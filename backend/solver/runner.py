"""
clingo ソルバの実行オーケストレーター

run_solver() は API リクエストの dict を受け取り、
clingo で最適な座席配置を最大 N 件列挙して返す。

処理フロー:
  1. ネスト形式の API リクエストをフラット dict に展開
  2. build_factbase() で FactBase を構築し、base の grounding を1回だけ実行する
  3. max_solutions 回のマルチショットループ:
       - 各ショットで全スレッドの seed を変更（シード多様性）
       - --parallel-mode=max_workers により、ショット内で max_workers スレッドが並列探索
       - タイムアウトは max_solutions で均等分配（per_shot_timeout）
       - 解が得られるたびに「距離制約」（後述）を追加 grounding し、
         次ショット以降の解が既出の解群と大きく異なることを保証する
  4. 重複を除いた解群を返す

設計の根拠:
  - base grounding 1回: ctrl.ground() は Control 生成直後に1回だけ呼ぶ。
    multi-shot solving はグラウンドプログラムを再利用するため以降の solve() 呼び出しで
    grounding コストはゼロ。距離制約はショット間に小さな program part として
    追加 grounding する（インクリメンタル。base の再 grounding は発生しない）。
  - 距離制約による解多様性: シード変更だけでは「数人入れ替えただけの類似解」や
    完全一致解が返ることがある（rand-freq を下げると顕著）。ショット k の解を
    ファクト化し「既出解と一致する座席数 <= N - min_diff」を integrity constraint
    として追加することで、候補間のハミング距離（座席が変わる人数）>= min_diff を保証する。
    min_diff = floor(生徒数 × SOLVER_MIN_DIFF_RATIO)。固定制約で動けない生徒が
    いる場合は実現可能な上限（生徒数 − 固定人数）にクランプする。
    距離制約追加後の UNSAT は「十分に異なる解がもう存在しない」ことの証明なので、
    それまでの解群を返してループを打ち切る（真の UNSAT とは区別する）。
  - 並列化: --parallel-mode=N で C レベルのスレッドを N 本起動。
    on_model コールバックは clingo が mutex で保護するためスレッドセーフ。
    seed はスレッドごとの設定値のため、ショット毎に全スレッド分を更新する
    （ctrl.configuration.solver.seed への代入は solver[0] にしか効かない点に注意）。
  - コスト追跡: --opt-mode=optN では最適化中間解も on_model に届くため、
    model.cost を追跡して常に最良コストの解群だけを保持する。
"""

from __future__ import annotations

import random
import time
from pathlib import Path
from typing import Any

from clorm import FactBase
from clorm.clingo import Control

from .facts import build_factbase
from .predicates import Assign
from ..api.config import (
    SOLVER_MIN_DIFF_RATIO,
    SOLVER_RAND_FREQ,
    SOLVER_WORKERS,
)

# .lp ファイルのディレクトリ（このファイルと同じ solver/ 配下の lp/）
LP_DIR = Path(__file__).parent / "lp"


def build_diversity_program(
    part_index: int,
    solution: list[dict[str, int]],
    min_diff: int,
) -> str:
    """
    既出解との距離制約プログラム（LP テキスト）を生成する。

    解をファクト divsol<k>(生徒ID, 座席ID) として列挙し、
    「この解と同じ座席に座る生徒数が N - min_diff を超える」配置を禁止する。
    つまり以降の解は、この解から min_diff 人以上が別の座席になる。
    """
    pred = f"divsol{part_index}"
    facts = " ".join(
        f"{pred}({a['student_id']},{a['seat_id']})." for a in solution
    )
    max_same = len(solution) - min_diff
    constraint = (
        f":- #count {{ S : {pred}(S, R), assign(S, R) }} > {max_same}."
    )
    return f"{facts}\n{constraint}"


def run_solver(
    data: dict[str, Any],
    max_solutions: int = 5,
    timeout: int = 30,
    min_diff_ratio: float | None = None,
) -> tuple[list[list[dict[str, int]]], bool]:
    """
    席替えソルバを実行し、最適な座席配置を複数返す。

    Args:
        data: API リクエストの dict（SolveRequest.model_dump() 形式）
              ネスト構造:
                {
                  "students": [{"id": 1, "gender": "male", "tags": [...]}],
                  "seats": [{"id": 1, "row": 1, "col": 1}],
                  "classroom": {
                    "num_rows": 2, "num_cols": 3,
                    "front_rows": [1],
                    "back_rows": [2]   # 省略可（省略時は最終行）
                  },
                  "groups": [{"group_id": 1, "seat_ids": [1, 2, 4, 5]}],
                  "constraints": {
                    "fixed": [{"student_id": 3, "seat_id": 7}],
                    "forbidden": [{"student_id_a": 2, "student_id_b": 5}]
                  },
                  "prev_assign": [{"student_id": 1, "seat_id": 1}],
                }
        max_solutions: 返却する最大解数（デフォルト 5）
        timeout: ソルバのタイムアウト秒数（デフォルト 30 秒）
        min_diff_ratio: 解候補間の最小差分比率（0〜1）。None なら
                   SOLVER_MIN_DIFF_RATIO（環境変数、デフォルト 0.5）を使う。
                   0 で距離制約を無効化（テスト・チューニング用）。

    Returns:
        (solutions, timed_out) のタプル。
        solutions: 座席配置のリスト。
                   各要素は [{"student_id": 1, "seat_id": 5}, ...] 形式。
                   解なし（UNSAT）の場合は空リスト []。
                   距離制約により「十分に異なる解」が尽きた場合は
                   max_solutions 未満の件数を返す（水増しはしない）。
        timed_out: いずれかのショットでタイムアウトが発生した場合 True。
                   False かつ solutions が空なら確定 UNSAT。
                   確定 UNSAT が証明された場合は、先行ショットがタイムアウト
                   していても False を返す（解なしが確定しているため）。

    Raises:
        RuntimeError: ソルバ内部エラー発生時
    """

    # ── 1. ネスト構造をフラット dict に展開 ──────────────────────────────
    classroom = data.get("classroom", {})
    constraints = data.get("constraints", {})

    options = data.get("options", {}) or {}
    prev_options = options.get("prev_options", {}) or {}
    soft_toggles = options.get("soft_toggles", {}) or {}

    flat_data: dict[str, Any] = {
        "students": data.get("students", []),
        "seats": data.get("seats", []),
        "front_rows": classroom.get("front_rows", [1]),
        "back_rows": classroom.get(
            "back_rows"
        ),  # None は facts.py で最終行を自動補完（[] は後側エリアなし）
        "groups": data.get("groups", []),
        "fixed": constraints.get("fixed", []),
        "forbidden": constraints.get("forbidden", []),
        "seat_gender": constraints.get("seat_gender", []),
        "relative_fixed": constraints.get("relative_fixed", []),
        "leader_groups": constraints.get("leader_groups", []),
        "prev_assign": data.get("prev_assign", []),
        "prev_options": prev_options,
        "soft_toggles": soft_toggles,
    }

    # ── 2. FactBase 構築・grounding（1回のみ）────────────────────────────
    # grounding はコストが高いため、ループ外で1回だけ実行する（multi-shot solving）。
    # --parallel-mode=N により各 solve() 呼び出しで N スレッドが並列探索する。
    try:
        fb: FactBase = build_factbase(flat_data)
    except Exception as exc:
        raise RuntimeError(
            f"ファクトベースの構築に失敗しました: {exc}"
        ) from exc

    max_workers = min(max_solutions, SOLVER_WORKERS)
    first_seed = random.randint(0, 2**31 - 1)

    # ── 距離制約のパラメータ ─────────────────────────────────────────────
    # min_diff = 解候補間で座席が変わるべき最小人数。
    # 固定制約で動けない生徒は差分に寄与できないため、実現可能な上限
    # （生徒数 − 固定人数）でクランプする。0 以下なら距離制約は無効。
    if min_diff_ratio is None:
        min_diff_ratio = SOLVER_MIN_DIFF_RATIO
    n_students = len(flat_data["students"])
    n_fixed = len({f["student_id"] for f in flat_data["fixed"]})
    min_diff = min(int(n_students * min_diff_ratio), n_students - n_fixed)

    try:
        ctrl = Control(
            arguments=[
                # compete モードでは -n K は「スレッドごと K 件」として解釈される。
                # -n 1 にすることで各スレッドが最適解を 1 件証明した時点でショットが終了し、
                # 簡単な問題での余分な列挙を防ぐ。解の収集は on_model の上書きで行うため
                # スレッド数分だけ on_model が呼ばれても最良解が残る。
                "-n",
                "1",
                "--opt-mode=optN",
                "--heuristic=Domain",  # soft.lp の #heuristic ディレクティブを有効化
                # このフラグなしでは #heuristic は完全に無視される。
                # Domain モードでは #heuristic で指定した原子を
                # 優先的に真偽決定し、front/back 配慮の初期解品質を向上させる。
                f"--rand-freq={SOLVER_RAND_FREQ}",
                f"--seed={first_seed}",
                f"--parallel-mode={max_workers}",  # ショット内の並列スレッド数
            ],
            unifier=[Assign],
        )
        for lp_file in ["base.lp", "hard.lp", "soft.lp"]:
            ctrl.load(str(LP_DIR / lp_file))
        ctrl.add_facts(fb)
        ctrl.ground([("base", [])])  # ← grounding はここで1回のみ
    except RuntimeError:
        raise
    except Exception as exc:
        raise RuntimeError(f"ソルバの初期化に失敗しました: {exc}") from exc

    # ── 3. マルチショット × 並列ソルブで解を収集 ─────────────────────────
    # ショットごとにシードを変更して探索の多様性を確保する（マルチシード）。
    # 各ショット内では --parallel-mode=max_workers スレッドが並列探索する（並列実行）。
    # タイムアウトを max_solutions で均等分配し、合計壁時計時間を timeout 秒に抑える。
    #
    # on_model は clingo が mutex で保護して逐次呼び出すためスレッドセーフ。
    # _best はショットごとに独立したリストで、on_model が呼ばれるたびに
    # 最新（最良）解で上書きされる。ショット終了時に _best[0] が
    # そのショットで見つかった最良解となる。
    # グローバルなコスト比較は行わないため、各ショットがサブ最適解を返しても
    # 採用され、解の多様性が確保される。
    solutions: list[list[dict[str, int]]] = []
    seen: set[frozenset] = set()
    per_shot_timeout = max(1.0, timeout / max_solutions)
    deadline = time.monotonic() + timeout
    any_timed_out = False
    diversity_parts = 0  # 追加済み距離制約の数（>0 なら UNSAT は「多様解の枯渇」）

    for shot_idx in range(max_solutions):
        if len(solutions) >= max_solutions:
            break
        # per_shot_timeout の下限 1 秒により合計が timeout を超えないよう、
        # 残り時間が尽きたらタイムアウト扱いで打ち切る
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            any_timed_out = True
            break
        # ショットごとにシードを変更（1ショット目は Control 引数の seed を使用済み）。
        # seed はスレッドごとの設定値のため全スレッド分を更新する
        # （ctrl.configuration.solver.seed への代入は solver[0] にしか効かない）。
        if shot_idx > 0:
            solver_conf = ctrl.configuration.solver
            for i in range(len(solver_conf)):
                solver_conf[i].seed = str(random.randint(0, 2**31 - 1))

        # ショット専用の best_result。on_model が呼ばれるたびに上書きされ、
        # ショット終了時点での最良解を保持する。
        best_result: list[list[dict] | None] = [None]

        def on_model(model, _best=best_result) -> None:
            assigns_fb: FactBase = model.facts(unifier=[Assign], atoms=True)
            _best[0] = [
                {"student_id": int(a.student_id), "seat_id": int(a.seat_id)}
                for a in assigns_fb.query(Assign).all()
            ]

        with ctrl.solve(on_model=on_model, async_=True) as handle:
            finished = handle.wait(min(per_shot_timeout, remaining))
            if not finished:
                # wait() が False → タイムアウト（探索未完了）
                handle.cancel()
                any_timed_out = True
            else:
                # wait() が True → 探索完了。SolveResult で結果を確認する。
                solve_result = handle.get()
                if solve_result.unsatisfiable and solve_result.exhausted:
                    if diversity_parts == 0:
                        # 確定 UNSAT: 距離制約なしの UNSAT は元問題の解なしが
                        # 確定したことを意味する。先行ショットがタイムアウト
                        # していても timeout ではなく unsatisfiable として報告する。
                        any_timed_out = False
                    # 距離制約追加後の UNSAT は「既出解と min_diff 人以上異なる解が
                    # もう存在しない」ことの証明。類似解で水増しせず、
                    # ここまでの解群だけを返す（timed_out は変更しない）。
                    break

        result = best_result[0]
        if result is not None:
            key = frozenset((a["student_id"], a["seat_id"]) for a in result)
            if key not in seen:
                seen.add(key)
                solutions.append(result)
                # 距離制約を追加 grounding: 以降のショットはこの解から
                # min_diff 人以上が別の座席になる配置だけを探索する
                if min_diff > 0:
                    part_name = f"div{diversity_parts}"
                    program = build_diversity_program(
                        diversity_parts, result, min_diff
                    )
                    ctrl.add(part_name, [], program)
                    ctrl.ground([(part_name, [])])
                    diversity_parts += 1

    return solutions, any_timed_out
