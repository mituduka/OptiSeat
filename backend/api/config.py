"""
アプリケーション設定

すべての定数は対応する環境変数で上書き可能。
デフォルト値はコード内のコメントに記載。

使用箇所:
  - schemas.py : バリデーション上限値として参照
  - routes.py  : GET /api/v1/config のレスポンスとして配信
  - runner.py  : ソルバ起動オプションとして参照
"""

import logging
import os

logger = logging.getLogger(__name__)


def _env_int(key: str, default: int) -> int:
    raw = os.getenv(key)
    if raw is None:
        return default
    try:
        return int(raw)
    except ValueError:
        logger.warning(
            "環境変数 %s の値 '%s' が不正です。デフォルト値 %d を使用します。",
            key,
            raw,
            default,
        )
        return default


def _env_float(key: str, default: float) -> float:
    raw = os.getenv(key)
    if raw is None:
        return default
    try:
        return float(raw)
    except ValueError:
        logger.warning(
            "環境変数 %s の値 '%s' が不正です。デフォルト値 %s を使用します。",
            key,
            raw,
            default,
        )
        return default


# 1クラスの最大児童・生徒数。SolveRequest / ScoreRequest / ValidateRequest の上限バリデーションに使用。
MAX_STUDENTS: int = _env_int("MAX_STUDENTS", 50)

# ソルバのデフォルトタイムアウト秒数（SolveOptions.timeout のデフォルト値）。
SOLVER_TIMEOUT_DEFAULT: int = _env_int("SOLVER_TIMEOUT_DEFAULT", 30)

# ソルバに指定できるタイムアウトの上限秒数（SolveOptions.timeout の le 値）。
SOLVER_TIMEOUT_MAX: int = _env_int("SOLVER_TIMEOUT_MAX", 120)

# 1回のソルブで取得する解候補数のデフォルト値（SolveOptions.max_solutions のデフォルト値）。
SOLVER_MAX_SOLUTIONS_DEFAULT: int = _env_int("SOLVER_MAX_SOLUTIONS_DEFAULT", 5)

# 1回のソルブで取得できる解候補数の上限（SolveOptions.max_solutions の le 値）。
SOLVER_MAX_SOLUTIONS_MAX: int = _env_int("SOLVER_MAX_SOLUTIONS_MAX", 10)

# 教室の最大行数（SeatConfig.num_rows の le 値）。
SEAT_MAX_ROWS: int = _env_int("SEAT_MAX_ROWS", 12)

# 教室の最大列数（SeatConfig.num_cols の le 値）。
SEAT_MAX_COLS: int = _env_int("SEAT_MAX_COLS", 12)

# clingo の --rand-freq オプション値（0〜1、探索のランダム性を制御）。
# 1 に近いほど多様な解が得られるが収束が遅くなる。バックエンド内部のみで使用。
SOLVER_RAND_FREQ: float = _env_float("SOLVER_RAND_FREQ", 1.0)

# ソルバ並列実行のワーカー数。シードごとの独立探索を並列実行する際のスレッド数上限。
# デフォルトは os.cpu_count()。SOLVER_WORKERS 環境変数で明示的に制御可能。
SOLVER_WORKERS: int = _env_int("SOLVER_WORKERS", os.cpu_count() or 1)
