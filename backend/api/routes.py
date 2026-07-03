"""
REST API エンドポイント定義

エンドポイント:
  GET  /health              — サーバー・ソルバの稼働確認
  GET  /api/v1/config       — アプリケーション設定の取得
  POST /api/v1/solve        — 席替え計算の実行
  POST /api/v1/score        — 座席配置のスコア再計算
  POST /api/v1/validate     — 制約の整合性チェック（ソルバ実行なし）
"""

from __future__ import annotations

import asyncio
import logging
import time

import clingo
from fastapi import APIRouter, Request

from ..solver.runner import run_solver
from .config import (
    MAX_STUDENTS,
    SOLVER_TIMEOUT_DEFAULT,
    SOLVER_TIMEOUT_MAX,
    SOLVER_MAX_SOLUTIONS_DEFAULT,
    SOLVER_MAX_SOLUTIONS_MAX,
    SEAT_MAX_ROWS,
    SEAT_MAX_COLS,
)
from .schemas import (
    AssignmentResult,
    ScoreRequest,
    ScoreResponse,
    SolveError,
    SolveRequest,
    SolveResponse,
    SolveStatus,
    Solution,
    SolutionScore,
    ValidateRequest,
    ValidateResponse,
)
from .score import compute_score, breakdown_to_total
from .validation import run_validation

logger = logging.getLogger(__name__)

router = APIRouter()


# ---------------------------------------------------------------------------
# GET /api/v1/config
# ---------------------------------------------------------------------------


@router.get("/api/v1/config")
def get_config() -> dict[str, int]:
    """アプリケーション設定を返す（最大児童・生徒数・ソルバ設定・教室サイズ上限など）"""
    return {
        "max_students": MAX_STUDENTS,
        "solver_timeout_default": SOLVER_TIMEOUT_DEFAULT,
        "solver_timeout_max": SOLVER_TIMEOUT_MAX,
        "solver_max_solutions_default": SOLVER_MAX_SOLUTIONS_DEFAULT,
        "solver_max_solutions_max": SOLVER_MAX_SOLUTIONS_MAX,
        "seat_max_rows": SEAT_MAX_ROWS,
        "seat_max_cols": SEAT_MAX_COLS,
    }


# ---------------------------------------------------------------------------
# GET /health
# ---------------------------------------------------------------------------


@router.get("/health")
async def health() -> dict[str, str]:
    """APIサーバーとソルバの稼働確認。"""
    return {
        "status": "ok",
        "solver": f"clingo {clingo.__version__}",
        "version": "1.0.0",
    }


# ---------------------------------------------------------------------------
# POST /api/v1/solve
# ---------------------------------------------------------------------------


@router.post("/api/v1/solve", response_model=SolveResponse)
async def solve(request: SolveRequest, raw_request: Request) -> SolveResponse:
    """
    席替え計算を実行し、最適な座席配置候補を返す

    - 解が見つかった場合: status=ok, solutions=[{rank, score, assignments}]
      （一部ショットがタイムアウトしても、解が1件以上あれば ok を返す）
    - 制約矛盾で解なし: status=unsatisfiable
    - 制限時間内に解が1件も見つからなかった場合: status=timeout
    """
    data = request.model_dump()
    timeout_sec = request.options.timeout
    max_solutions = request.options.max_solutions

    logger.info(
        "solve: students=%d, seats=%d, timeout=%d, max_solutions=%d",
        len(request.students),
        len(request.seats),
        timeout_sec,
        max_solutions,
    )

    semaphore = raw_request.app.state.solve_semaphore
    start = time.perf_counter()
    try:
        async with semaphore:
            loop = asyncio.get_running_loop()
            raw_solutions, timed_out = await loop.run_in_executor(
                None,  # デフォルト ThreadPoolExecutor
                lambda: run_solver(
                    data, max_solutions=max_solutions, timeout=timeout_sec
                ),
            )
    except Exception as exc:
        elapsed_ms = int((time.perf_counter() - start) * 1000)
        logger.error("solve: solver internal error: %s", exc, exc_info=True)
        return SolveResponse(
            status=SolveStatus.unsatisfiable,
            elapsed_ms=elapsed_ms,
            solutions=[],
            error=SolveError(
                code="SOLVER_ERROR",
                message="配置の計算中に内部エラーが発生しました。",
            ),
        )
    elapsed_ms = int((time.perf_counter() - start) * 1000)

    # ステータス判定
    # timed_out は runner.py の handle.wait() 戻り値に基づく正確な判別。
    # （経過時間によるヒューリスティックは使用しない）
    status = (
        SolveStatus.ok
        if raw_solutions
        else (SolveStatus.timeout if timed_out else SolveStatus.unsatisfiable)
    )
    logger.info(
        "solve: status=%s, elapsed=%dms, solutions=%d",
        status.value,
        elapsed_ms,
        len(raw_solutions),
    )

    if not raw_solutions:
        error = (
            SolveError(
                code="UNSATISFIABLE",
                message="指定された制約を同時に満たす座席配置が存在しません。",
            )
            if status is SolveStatus.unsatisfiable
            else None
        )
        return SolveResponse(
            status=status,
            elapsed_ms=elapsed_ms,
            solutions=[],
            error=error,
        )

    # スコア計算とレスポンス組み立て
    solutions: list[Solution] = []
    for rank, raw_assign in enumerate(raw_solutions, start=1):
        breakdown = compute_score(raw_assign, data)
        total = breakdown_to_total(breakdown)
        solutions.append(
            Solution(
                rank=rank,
                score=SolutionScore(total=total, breakdown=breakdown),
                assignments=[
                    AssignmentResult(
                        student_id=a["student_id"], seat_id=a["seat_id"]
                    )
                    for a in raw_assign
                ],
            )
        )

    return SolveResponse(
        status=status,
        elapsed_ms=elapsed_ms,
        solutions=solutions,
    )


# ---------------------------------------------------------------------------
# POST /api/v1/score
# ---------------------------------------------------------------------------


@router.post("/api/v1/score", response_model=ScoreResponse)
async def score(request: ScoreRequest) -> ScoreResponse:
    """
    座席配置のスコア（制約違反数）を計算して返す

    ソルバを再実行せず、配置された座席に対して制約違反カウントのみ行う。
    手動調整後のペナルティ再計算に使用する。
    """
    data = request.model_dump()
    assignments = [
        {"student_id": a["student_id"], "seat_id": a["seat_id"]}
        for a in data["assignments"]
    ]
    breakdown = compute_score(assignments, data)
    total = breakdown_to_total(breakdown)
    return ScoreResponse(score=SolutionScore(total=total, breakdown=breakdown))


# ---------------------------------------------------------------------------
# POST /api/v1/validate
# ---------------------------------------------------------------------------


@router.post("/api/v1/validate", response_model=ValidateResponse)
async def validate(request: ValidateRequest) -> ValidateResponse:
    """
    制約の整合性チェック（ソルバ実行なし）

    チェック内容:
      - fixed/forbidden の student_id が students に存在するか
      - fixed の seat_id が seats に存在するか
      - fixed で同じ座席に複数人が固定されていないか
    """
    warnings = run_validation(request)
    return ValidateResponse(valid=len(warnings) == 0, warnings=warnings)
