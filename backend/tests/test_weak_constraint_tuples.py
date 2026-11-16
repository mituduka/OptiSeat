"""
弱制約タプル衝突の回帰テスト

clingo は同一優先度レベルの弱制約を (重み, 項...) のタプル集合として扱うため、
別種のペナルティでもタプルが一致すると 1 件に潰れる（Issue #58 と同じ仕組み）。
soft.lp の各弱制約には制約種別の定数を含めて区別している。

ここでは配置を `:- not assign(S, R).` で固定して LP を解き、
優先度ごとのコスト（model.cost）を直接検証する。

実行方法（Dev Container 内）:
  pytest backend/tests/test_weak_constraint_tuples.py -v
"""

from __future__ import annotations

from typing import Any

from clorm.clingo import Control

from backend.solver.facts import build_factbase
from backend.solver.runner import LP_DIR


def _solve_fixed(
    data: dict[str, Any], assignment: dict[int, int]
) -> dict[int, int]:
    """
    配置 {生徒ID: 座席ID} を固定して LP を解き、{優先度: コスト} を返す。

    弱制約が 1 つも成立しない優先度レベルは結果に含まれない
    （呼び出し側では .get(level, 0) で参照する）。
    """
    ctrl = Control(arguments=["--opt-mode=optN"])
    for lp_file in ["base.lp", "hard.lp", "soft.lp"]:
        ctrl.load(str(LP_DIR / lp_file))
    ctrl.add_facts(build_factbase(data))
    pins = " ".join(
        f":- not assign({s}, {r})." for s, r in assignment.items()
    )
    ctrl.add("base", [], pins)
    ctrl.ground([("base", [])])

    costs: list[dict[int, int]] = []

    def on_model(model) -> None:
        costs.append(dict(zip(model.priority, model.cost, strict=True)))

    result = ctrl.solve(on_model=on_model)
    assert result.satisfiable, "固定した配置がハード制約を満たしていない"
    return costs[-1]


# ── S-03（班の男女偏り）× S-04（孤立）: 班 ID と生徒 ID の衝突 ─────────────


def _group_data(*, gender_balance: bool, loneliness: bool) -> dict[str, Any]:
    """
    2×2 教室、班1=座席{1,2}、班2=座席{3,4}、生徒1=女・2,3,4=男。

    配置 {3→席1, 4→席2, 1→席3, 2→席4} では:
      - S-03: 班1（男男）に女子不在 → 1
      - S-04: 班2 の生徒1（女）・生徒2（男）は横隣・同班に同性なし → 2
    S-03 の G=1 と S-04 の S=1 が修正前は同じタプル (1, 1)@4 になっていた。
    """
    return {
        "students": [
            {"id": 1, "gender": "female", "tags": []},
            {"id": 2, "gender": "male", "tags": []},
            {"id": 3, "gender": "male", "tags": []},
            {"id": 4, "gender": "male", "tags": []},
        ],
        "seats": [
            {"id": 1, "row": 1, "col": 1},
            {"id": 2, "row": 1, "col": 2},
            {"id": 3, "row": 2, "col": 1},
            {"id": 4, "row": 2, "col": 2},
        ],
        "front_rows": [],
        "back_rows": [],
        "groups": [
            {"group_id": 1, "seat_ids": [1, 2]},
            {"group_id": 2, "seat_ids": [3, 4]},
        ],
        "soft_toggles": {
            "gender_balance": gender_balance,
            "loneliness": loneliness,
        },
    }


GROUP_ASSIGNMENT = {3: 1, 4: 2, 1: 3, 2: 4}


def test_gender_balance_and_loneliness_costs_are_additive() -> None:
    gb_only = _solve_fixed(
        _group_data(gender_balance=True, loneliness=False), GROUP_ASSIGNMENT
    ).get(4, 0)
    lonely_only = _solve_fixed(
        _group_data(gender_balance=False, loneliness=True), GROUP_ASSIGNMENT
    ).get(4, 0)
    both = _solve_fixed(
        _group_data(gender_balance=True, loneliness=True), GROUP_ASSIGNMENT
    ).get(4, 0)

    assert gb_only == 1
    assert lonely_only == 2
    assert both == gb_only + lonely_only == 3


# ── S-01（前列希望）× S-02（後列希望）: 両タグ生徒の同距離衝突 ─────────────


def _front_back_data(tags: list[str]) -> dict[str, Any]:
    """
    3×1 教室、front_rows=[1]、back_rows=[3]。
    生徒1 を 2 行目に置くと前列・後列とも距離 1。
    修正前は S-01 と S-02 が同じタプル (1, 1)@5 になっていた。
    """
    return {
        "students": [
            {"id": 1, "gender": "male", "tags": tags},
            {"id": 2, "gender": "male", "tags": []},
            {"id": 3, "gender": "male", "tags": []},
        ],
        "seats": [
            {"id": 1, "row": 1, "col": 1},
            {"id": 2, "row": 2, "col": 1},
            {"id": 3, "row": 3, "col": 1},
        ],
        "front_rows": [1],
        "back_rows": [3],
        "groups": [],
    }


FRONT_BACK_ASSIGNMENT = {2: 1, 1: 2, 3: 3}


def test_front_and_back_preferred_costs_are_additive() -> None:
    front_only = _solve_fixed(
        _front_back_data(["front_preferred"]), FRONT_BACK_ASSIGNMENT
    ).get(5, 0)
    back_only = _solve_fixed(
        _front_back_data(["back_preferred"]), FRONT_BACK_ASSIGNMENT
    ).get(5, 0)
    both = _solve_fixed(
        _front_back_data(["front_preferred", "back_preferred"]),
        FRONT_BACK_ASSIGNMENT,
    ).get(5, 0)

    assert front_only == 1
    assert back_only == 1
    assert both == front_only + back_only == 2
