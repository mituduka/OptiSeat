"""
S-07（前回同班）の違反カウントが ASP ソルバと score.py で一致することのテスト

ASP 側（soft.lp の same_group_composition）は「今回の班 Gnew のメンバー集合が
前回のいずれかの班 Gprev のメンバー集合と完全一致」する (Gnew, Gprev) の組ごとに
@2 のペナルティ 1 を付ける。前回の班は「現在の班レイアウトの各班の座席に前回
座っていた生徒」の集合で、空の前回班は対象外（facts.py が prev_group_id を出さない）。
score.py の prev_group_same はこの組の数と一致しなければならない。

実行方法:
  pytest backend/tests/test_prev_group_same.py -v
"""

from __future__ import annotations

from typing import ClassVar

import clingo
import pytest

from backend.api.score import compute_score
from backend.solver.facts import build_factbase
from backend.solver.runner import LP_DIR

# 2×2 グリッド: seat_id = (row-1)*2 + col
SEATS_2X2 = [
    {"id": (r - 1) * 2 + c, "row": r, "col": c}
    for r in range(1, 3)
    for c in range(1, 3)
]
GROUPS_2X2 = [
    {"group_id": 1, "seat_ids": [1, 2]},
    {"group_id": 2, "seat_ids": [3, 4]},
]

# 2×3 グリッド（班の大きさが異なる）: seat_id = (row-1)*3 + col
SEATS_2X3 = [
    {"id": (r - 1) * 3 + c, "row": r, "col": c}
    for r in range(1, 3)
    for c in range(1, 4)
]
GROUPS_2X3 = [
    {"group_id": 1, "seat_ids": [1, 2, 4, 5]},
    {"group_id": 2, "seat_ids": [3, 6]},
]


def _students(n: int) -> list[dict]:
    return [{"id": i, "gender": "male", "tags": []} for i in range(1, n + 1)]


def _assign(pairs: dict[int, int]) -> list[dict[str, int]]:
    return [{"student_id": s, "seat_id": r} for s, r in pairs.items()]


def _request(
    n_students: int,
    seats: list[dict],
    groups: list[dict],
    prev: dict[int, int],
) -> dict:
    """compute_score に渡す SolveRequest 形式の dict。"""
    num_cols = max(s["col"] for s in seats)
    num_rows = max(s["row"] for s in seats)
    return {
        "students": _students(n_students),
        "seats": seats,
        "classroom": {
            "num_rows": num_rows,
            "num_cols": num_cols,
            "front_rows": [1],
            "back_rows": [num_rows],
        },
        "groups": groups,
        "constraints": {
            "fixed": [],
            "forbidden": [],
            "seat_gender": [],
            "relative_fixed": [],
        },
        "prev_assign": _assign(prev),
    }


def _asp_prev_group_cost(request: dict, current: dict[int, int]) -> int:
    """配置を current に固定して解き、S-07（@2）のコストを返す。

    S-07 以外の弱制約が grounding されないよう、タグなし・他トグル OFF の
    入力に限定する。その前提を cost ベクトルの長さで確認する。
    """
    classroom = request["classroom"]
    flat = {
        "students": request["students"],
        "seats": request["seats"],
        "front_rows": classroom["front_rows"],
        "back_rows": classroom["back_rows"],
        "groups": request["groups"],
        "fixed": [],
        "forbidden": [],
        "seat_gender": [],
        "relative_fixed": [],
        "leader_groups": [],
        "prev_assign": request["prev_assign"],
        "prev_options": {"differ_group": True},
        "soft_toggles": {},
    }
    fb = build_factbase(flat)

    ctl = clingo.Control(["--opt-mode=opt", "-n", "0"])
    for name in ["base.lp", "hard.lp", "soft.lp"]:
        ctl.load(str(LP_DIR / name))
    pin = " ".join(f":- not assign({s},{r})." for s, r in current.items())
    ctl.add("base", [], fb.asp_str() + "\n" + pin)
    ctl.ground([("base", [])])

    costs: list[list[int]] = []
    result = ctl.solve(on_model=lambda m: costs.append(list(m.cost)))
    assert result.satisfiable, "固定した配置がハード制約を満たさない"
    cost = costs[-1]
    # S-07（@2）以外のレベルが現れていないこと（現れると cost[0] が @2 でなくなる）
    assert len(cost) <= 1, f"S-07 以外の弱制約が有効になっている: {cost}"
    return cost[0] if cost else 0


def _score_prev_group_same(request: dict, current: dict[int, int]) -> int:
    return compute_score(_assign(current), request).prev_group_same


# ---------------------------------------------------------------------------
# 再現ケース: 班を丸ごと入れ替える
# ---------------------------------------------------------------------------


class TestWholeGroupSwap:
    """前回の班1と班2のメンバーを、座席ごと入れ替えた配置。"""

    PREV: ClassVar[dict[int, int]] = {1: 1, 2: 2, 3: 3, 4: 4}
    CURRENT: ClassVar[dict[int, int]] = {1: 3, 2: 4, 3: 1, 4: 2}

    def test_score_counts_swapped_groups(self) -> None:
        req = _request(4, SEATS_2X2, GROUPS_2X2, self.PREV)
        assert _score_prev_group_same(req, self.CURRENT) == 2

    def test_asp_counts_swapped_groups(self) -> None:
        req = _request(4, SEATS_2X2, GROUPS_2X2, self.PREV)
        assert _asp_prev_group_cost(req, self.CURRENT) == 2


# ---------------------------------------------------------------------------
# ASP の @2 コストと score.py の prev_group_same の突き合わせ
# ---------------------------------------------------------------------------

CASES = [
    pytest.param(
        4, SEATS_2X2, GROUPS_2X2,
        {1: 1, 2: 2, 3: 3, 4: 4}, {1: 3, 2: 4, 3: 1, 4: 2},
        2, id="2x2-swap-groups",
    ),
    pytest.param(
        4, SEATS_2X2, GROUPS_2X2,
        {1: 1, 2: 2, 3: 3, 4: 4}, {1: 2, 2: 1, 3: 4, 4: 3},
        2, id="2x2-same-groups-shuffled-within",
    ),
    pytest.param(
        4, SEATS_2X2, GROUPS_2X2,
        {1: 1, 2: 2, 3: 3, 4: 4}, {1: 1, 2: 3, 3: 2, 4: 4},
        0, id="2x2-mixed",
    ),
    pytest.param(
        # 生徒3人: 今回の班1={3}（前回班2={3} と一致）、班2={1,2}（前回班1と一致）
        3, SEATS_2X2, GROUPS_2X2,
        {1: 1, 2: 2, 3: 3}, {1: 3, 2: 4, 3: 1},
        2, id="2x2-partial-occupancy-swap",
    ),
    pytest.param(
        # 前回班2は空（前回班として扱わない）、今回班1は空（どれとも一致しない）
        2, SEATS_2X2, GROUPS_2X2,
        {1: 1, 2: 2}, {1: 3, 2: 4},
        1, id="2x2-empty-groups",
    ),
    pytest.param(
        # 前回班1={1,2} が今回は班2 に、前回班2 は空、今回班1 は空でない
        3, SEATS_2X2, GROUPS_2X2,
        {1: 1, 2: 2}, {1: 3, 2: 4, 3: 1},
        1, id="2x2-new-student-in-empty-prev-group",
    ),
    pytest.param(
        # 班の大きさが異なるため入れ替えはできない。前回班2={3,6} は今回も班2
        6, SEATS_2X3, GROUPS_2X3,
        {i: i for i in range(1, 7)}, {1: 4, 2: 1, 3: 6, 4: 5, 5: 2, 6: 3},
        2, id="2x3-uneven-same-groups",
    ),
    pytest.param(
        # 前回班2={3,6} の2人が今回は班1 に入り、班2 は {1,2}
        6, SEATS_2X3, GROUPS_2X3,
        {i: i for i in range(1, 7)}, {3: 1, 6: 2, 4: 4, 5: 5, 1: 3, 2: 6},
        0, id="2x3-uneven-mixed",
    ),
    pytest.param(
        # 生徒4人を 2×3 に配置: 前回班1={1,2}、班2={3,4} を入れ替え
        4, SEATS_2X3, GROUPS_2X3,
        {1: 1, 2: 2, 3: 3, 4: 6}, {1: 3, 2: 6, 3: 4, 4: 5},
        2, id="2x3-partial-occupancy-swap",
    ),
]


@pytest.mark.parametrize(
    ("n_students", "seats", "groups", "prev", "current", "expected"), CASES
)
def test_score_matches_asp_cost(
    n_students: int,
    seats: list[dict],
    groups: list[dict],
    prev: dict[int, int],
    current: dict[int, int],
    expected: int,
) -> None:
    req = _request(n_students, seats, groups, prev)
    asp_cost = _asp_prev_group_cost(req, current)
    score = _score_prev_group_same(req, current)
    assert asp_cost == expected, f"ASP の @2 コストが想定と異なる: {asp_cost}"
    assert score == asp_cost, (
        f"score.py の prev_group_same={score} が ASP の @2 コスト={asp_cost} と不一致"
    )
