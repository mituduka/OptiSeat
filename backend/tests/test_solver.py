"""
OptiSeat ソルバ テスト

backend.solver.runner.run_solver() のユニット・統合テスト。

テスト構成:
  TestHardConstraints  — Hard 制約（H-01〜H-04）が守られているかを検証
  TestSoftConstraints  — Soft 制約（S-01〜S-05）が最良解で満たされているかを検証
  TestEdgeCases        — エッジケース（解なし・固定・最小構成など）

実行方法（Dev Container 内）:
  pytest backend/tests/test_solver.py -v
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from backend.solver.runner import run_solver
from backend.api.score import compute_score

# ── テスト用サンプルデータの読み込み ─────────────────────────────────────────

FIXTURES_DIR = Path(__file__).parent / "fixtures"


def load_sample() -> dict:
    """6 名・2×3 グリッド・2 班構成のサンプルデータを読み込む。"""
    with open(FIXTURES_DIR / "sample_class.json", encoding="utf-8") as f:
        data = json.load(f)
    # JSON コメントキー（_で始まる）を除外して返す
    return {k: v for k, v in data.items() if not k.startswith("_")}


# ── ヘルパー関数 ──────────────────────────────────────────────────────────────


def _are_adjacent(seat_a: int, seat_b: int, num_cols: int) -> bool:
    """
    2 つの座席が上下左右で隣接しているかを判定する（テスト用ヘルパー）。

    座席 ID は 1 始まりで、グリッドを行優先で並べたもの:
      seat_id = (row - 1) * num_cols + col
    """
    row_a = (seat_a - 1) // num_cols + 1
    col_a = (seat_a - 1) % num_cols + 1
    row_b = (seat_b - 1) // num_cols + 1
    col_b = (seat_b - 1) % num_cols + 1
    horizontal = (row_a == row_b) and (abs(col_a - col_b) == 1)
    vertical = (col_a == col_b) and (abs(row_a - row_b) == 1)
    return horizontal or vertical


# ── フィクスチャ ──────────────────────────────────────────────────────────────


@pytest.fixture
def sample_data() -> dict:
    """標準の 6 名・2×3 サンプルデータ。"""
    return load_sample()


@pytest.fixture
def fixed_data() -> dict:
    """児童・生徒 1 を座席 3 にピン留めしたデータ。"""
    data = load_sample()
    data["constraints"]["fixed"] = [{"student_id": 1, "seat_id": 3}]
    return data


@pytest.fixture
def unsat_data() -> dict:
    """
    解なし（UNSAT）を引き起こすデータ。
    2 名の児童・生徒を同じ 1 つの座席に固定すると矛盾が生じる。
    """
    data = load_sample()
    # 2 人を同じ座席 1 に固定 → H-03 + H-02 で UNSAT
    data["constraints"]["fixed"] = [
        {"student_id": 1, "seat_id": 1},
        {"student_id": 2, "seat_id": 1},
    ]
    return data


# ── Hard 制約テスト ───────────────────────────────────────────────────────────


class TestHardConstraints:
    """H-01〜H-04 が全解で守られているかを検証する。"""

    def test_one_student_per_seat(self, sample_data: dict) -> None:
        """H-02: 各座席に 1 人のみ配置されていること。"""
        solutions, _ = run_solver(sample_data)
        assert solutions, "解が 1 件以上存在すること"
        for sol in solutions:
            seat_ids = [a["seat_id"] for a in sol]
            assert len(seat_ids) == len(set(seat_ids)), "重複座席なし"

    def test_one_seat_per_student(self, sample_data: dict) -> None:
        """H-01: 各児童・生徒は 1 席のみに配置されていること。"""
        solutions, _ = run_solver(sample_data)
        assert solutions
        for sol in solutions:
            student_ids = [a["student_id"] for a in sol]
            assert len(student_ids) == len(
                set(student_ids)
            ), "重複児童・生徒なし"

    def test_all_students_assigned(self, sample_data: dict) -> None:
        """H-01: 全児童・生徒が配置されていること。"""
        solutions, _ = run_solver(sample_data)
        assert solutions
        expected_ids = {s["id"] for s in sample_data["students"]}
        for sol in solutions:
            assigned_ids = {a["student_id"] for a in sol}
            assert (
                assigned_ids == expected_ids
            ), "全児童・生徒が割り当てられていること"

    def test_forbidden_pair_not_adjacent(self, sample_data: dict) -> None:
        """H-04: forbidden ペア（児童・生徒 2, 5）が隣接していないこと。"""
        solutions, _ = run_solver(sample_data)
        assert solutions
        num_cols = sample_data["classroom"]["num_cols"]
        for sol in solutions:
            assign_map = {a["student_id"]: a["seat_id"] for a in sol}
            seat_2 = assign_map[2]
            seat_5 = assign_map[5]
            assert not _are_adjacent(
                seat_2, seat_5, num_cols
            ), f"児童・生徒2(座席{seat_2})と児童・生徒5(座席{seat_5})が隣接している"

    def test_fixed_seat_honored(self, fixed_data: dict) -> None:
        """H-03: fixed 制約（児童・生徒 1 → 座席 3）が全解で守られていること。"""
        solutions, _ = run_solver(fixed_data)
        assert solutions
        for sol in solutions:
            assign_map = {a["student_id"]: a["seat_id"] for a in sol}
            assert (
                assign_map[1] == 3
            ), f"児童・生徒1は座席3固定のはず: {assign_map[1]}"

    def test_unsat_returns_empty(self, unsat_data: dict) -> None:
        """UNSAT の場合、空リストが返ること。"""
        solutions, _ = run_solver(unsat_data)
        assert solutions == [], f"UNSAT なのに解が返った: {solutions}"


# ── Soft 制約テスト ───────────────────────────────────────────────────────────


class TestSoftConstraints:
    """S-01〜S-05 が最良解（解リストの先頭）で満たされているかを検証する。"""

    def test_front_preferred_in_front_row(self, sample_data: dict) -> None:
        """S-01: front_preferred タグの児童・生徒（ID=1）が前列に配置されていること。"""
        solutions, _ = run_solver(sample_data, max_solutions=1)
        assert solutions
        assign_map = {a["student_id"]: a["seat_id"] for a in solutions[0]}
        front_seat_ids = {
            s["id"]
            for s in sample_data["seats"]
            if s["row"] in sample_data["classroom"]["front_rows"]
        }
        assert (
            assign_map[1] in front_seat_ids
        ), f"front_preferred の児童・生徒1が前列にいない: 座席{assign_map[1]}"

    def test_back_preferred_in_back_row(self, sample_data: dict) -> None:
        """S-02: back_preferred タグの児童・生徒（ID=4）が後列に配置されていること。"""
        solutions, _ = run_solver(sample_data, max_solutions=1)
        assert solutions
        assign_map = {a["student_id"]: a["seat_id"] for a in solutions[0]}
        back_rows = sample_data["classroom"].get("back_rows")
        if back_rows is None:
            back_rows = [sample_data["classroom"]["num_rows"]]
        back_seat_ids = {
            s["id"] for s in sample_data["seats"] if s["row"] in back_rows
        }
        assert (
            assign_map[4] in back_seat_ids
        ), f"back_preferred の児童・生徒4が後列にいない: 座席{assign_map[4]}"

    def test_group_has_both_genders(self, sample_data: dict) -> None:
        """S-03: 各班に男女が少なくとも 1 人ずついること（最良解）。"""
        # gender_balance トグルを明示的に有効化（デフォルトは False）
        sample_data = {
            **sample_data,
            "options": {"soft_toggles": {"gender_balance": True}},
        }
        solutions, _ = run_solver(sample_data, max_solutions=1)
        assert solutions
        assign_map = {a["student_id"]: a["seat_id"] for a in solutions[0]}
        gender_map = {s["id"]: s["gender"] for s in sample_data["students"]}

        for group in sample_data["groups"]:
            seat_ids = set(group["seat_ids"])
            genders_in_group = {
                gender_map[sid]
                for sid, rid in assign_map.items()
                if rid in seat_ids
            }
            assert (
                "male" in genders_in_group
            ), f"班{group['group_id']} に男性がいない"
            assert (
                "female" in genders_in_group
            ), f"班{group['group_id']} に女性がいない"

    def test_returns_at_least_one_solution(self, sample_data: dict) -> None:
        """標準データで解が 1 件以上返ること。"""
        solutions, _ = run_solver(sample_data, max_solutions=5)
        assert len(solutions) >= 1, "解が 0 件"

    def test_solutions_are_all_different(self, sample_data: dict) -> None:
        """返ってくる複数の解が互いに異なること。"""
        solutions, _ = run_solver(sample_data, max_solutions=5)
        if len(solutions) < 2:
            pytest.skip("解が 1 件のみ（比較不要）")
        solution_frozensets = [
            frozenset((a["student_id"], a["seat_id"]) for a in sol)
            for sol in solutions
        ]
        assert len(set(solution_frozensets)) == len(
            solution_frozensets
        ), "同一の解が重複して返っている"

    def test_front_preferred_minimizes_row_distance(self) -> None:
        """S-01 距離最小化: 前列が満席でも front_preferred の児童・生徒は最も前に近い行に配置される。

        3行×2列グリッド（6席）、前列=行1（2席）に対して front_preferred が3人いる。
        バイナリペナルティなら行2も行3も同コスト。距離ベースなら行2（距離1）が行3（距離2）より優先。
        """
        data = {
            "students": [
                {"id": 1, "gender": "male", "tags": ["front_preferred"]},
                {"id": 2, "gender": "male", "tags": ["front_preferred"]},
                {"id": 3, "gender": "male", "tags": ["front_preferred"]},
                {"id": 4, "gender": "female", "tags": []},
                {"id": 5, "gender": "female", "tags": []},
                {"id": 6, "gender": "female", "tags": []},
            ],
            "seats": [
                {"id": r * 2 + c + 1, "row": r + 1, "col": c + 1}
                for r in range(3)
                for c in range(2)
            ],
            "classroom": {
                "num_rows": 3,
                "num_cols": 2,
                "front_rows": [1],
            },
            "groups": [],
            "constraints": {
                "fixed": [],
                "forbidden": [],
                "seat_gender": [],
                "relative_fixed": [],
            },
            "prev_assign": [],
        }
        solutions, _ = run_solver(data, max_solutions=1)
        assert solutions, "解が得られなかった"
        assign_map = {a["student_id"]: a["seat_id"] for a in solutions[0]}
        seat_map = {s["id"]: s for s in data["seats"]}
        # front_preferred の3人（ID=1,2,3）の配置行を確認
        fp_rows = [seat_map[assign_map[sid]]["row"] for sid in [1, 2, 3]]
        assert max(fp_rows) <= 2, (
            f"front_preferred の児童・生徒が行3（前列から距離2）に配置されている。"
            f"距離最小化なら行2（距離1）に配置されるはず。配置行: {fp_rows}"
        )

    def test_previous_assignment_differs(self, sample_data: dict) -> None:
        """S-05: 最良解では前回と同じ席になる児童・生徒が 0 人であること（理想値の確認）。

        S-05 は differ_seat トグル連動（Issue #58 対応）のため明示的に有効化する。
        """
        sample_data["options"] = {"prev_options": {"differ_seat": True}}
        solutions, _ = run_solver(sample_data, max_solutions=1)
        assert solutions
        prev_map = {
            pa["student_id"]: pa["seat_id"]
            for pa in sample_data["prev_assign"]
        }
        assign_map = {a["student_id"]: a["seat_id"] for a in solutions[0]}
        same_seat_count = sum(
            1 for sid, rid in assign_map.items() if prev_map.get(sid) == rid
        )
        # 前回と完全に同じになる児童・生徒が 0 人であることを期待
        # （制約上不可能な場合を除く）
        assert (
            same_seat_count == 0
        ), f"前回と同席の児童・生徒が {same_seat_count} 人いる"

    def test_loneliness_same_gender_detects_higher_id_peer(self) -> None:
        """S-04 両方向チェック: 高IDの学生が低IDの学生を同性ピアとして検出できること。

        soft.lp の loneliness_peer は S < S2 の片方向のみ格納する。
        高ID側（id=2）の孤独感判定は第2ルール
          loneliness_peer_same_gender(S) :- loneliness_peer(S2, S), student(S, Gender), student(S2, Gender).
        を経由して行われる。このルールが機能しなければ id=2 にペナルティが発生する。
        """
        data = {
            "students": [
                {"id": 1, "gender": "male", "tags": []},
                {"id": 2, "gender": "male", "tags": []},
            ],
            "seats": [
                {"id": 1, "row": 1, "col": 1},
                {"id": 2, "row": 1, "col": 2},
            ],
            "classroom": {"num_rows": 1, "num_cols": 2, "front_rows": [1]},
            "groups": [],
            "constraints": {
                "fixed": [],
                "forbidden": [],
                "seat_gender": [],
                "relative_fixed": [],
            },
            "prev_assign": [],
            "options": {
                "soft_toggles": {"gender_balance": False, "loneliness": True},
            },
        }
        solutions, _ = run_solver(data, max_solutions=1)
        assert solutions, "解が得られなかった"
        breakdown = compute_score(solutions[0], data)
        assert (
            breakdown.loneliness_violation == 0
        ), f"loneliness_violation={breakdown.loneliness_violation}（高IDの学生が同性ピアを検出できていない）"


# ── エッジケーステスト ────────────────────────────────────────────────────────


class TestEdgeCases:
    """境界条件・特殊ケースを検証する。"""

    def test_no_groups_no_prev_assign(self) -> None:
        """班なし・前回配置なし・制約なし: 最低限の構成でも解が得られること。"""
        data = {
            "students": [
                {"id": 1, "gender": "male", "tags": []},
                {"id": 2, "gender": "female", "tags": []},
            ],
            "seats": [
                {"id": 1, "row": 1, "col": 1},
                {"id": 2, "row": 1, "col": 2},
            ],
            "classroom": {
                "num_rows": 1,
                "num_cols": 2,
                "front_rows": [1],
            },
            "groups": [],
            "constraints": {"fixed": [], "forbidden": []},
            "prev_assign": [],
        }
        solutions, _ = run_solver(data)
        assert len(solutions) >= 1
        for sol in solutions:
            assert len(sol) == 2

    def test_custom_back_rows(self) -> None:
        """back_rows を明示指定したとき back_preferred が正しく後列に配置されること。"""
        data = {
            "students": [
                {"id": 1, "gender": "male", "tags": ["back_preferred"]},
                {"id": 2, "gender": "female", "tags": []},
                {"id": 3, "gender": "male", "tags": []},
                {"id": 4, "gender": "female", "tags": []},
            ],
            "seats": [
                {"id": 1, "row": 1, "col": 1},
                {"id": 2, "row": 1, "col": 2},
                {"id": 3, "row": 2, "col": 1},
                {"id": 4, "row": 2, "col": 2},
            ],
            "classroom": {
                "num_rows": 2,
                "num_cols": 2,
                "front_rows": [1],
                "back_rows": [2],  # 明示指定
            },
            "groups": [],
            "constraints": {"fixed": [], "forbidden": []},
            "prev_assign": [],
        }
        solutions, _ = run_solver(data, max_solutions=1)
        assert solutions
        assign_map = {a["student_id"]: a["seat_id"] for a in solutions[0]}
        # 後列座席（row=2）は seat_id=3,4
        assert assign_map[1] in {
            3,
            4,
        }, f"back_preferred の児童・生徒1が後列（ID3,4）にいない: 座席{assign_map[1]}"

    def test_max_solutions_respected(self, sample_data: dict) -> None:
        """max_solutions の上限が守られること。"""
        for limit in [1, 3, 5]:
            solutions, _ = run_solver(sample_data, max_solutions=limit)
            assert (
                len(solutions) <= limit
            ), f"max_solutions={limit} なのに {len(solutions)} 件返った"


# ── 新制約タイプテスト ─────────────────────────────────────────────────────────


def _are_adjacent8(seat_a: int, seat_b: int, num_cols: int) -> bool:
    """
    2 つの座席が 8 方向（斜め含む）で隣接しているかを判定する（テスト用ヘルパー）。
    """
    row_a = (seat_a - 1) // num_cols + 1
    col_a = (seat_a - 1) % num_cols + 1
    row_b = (seat_b - 1) // num_cols + 1
    col_b = (seat_b - 1) % num_cols + 1
    return (
        abs(row_a - row_b) <= 1
        and abs(col_a - col_b) <= 1
        and seat_a != seat_b
    )


class TestNewConstraintTypes:
    """adjacent8 / same_group の新制約タイプが正しく機能するかを検証する。"""

    def test_adjacent8_forbidden_pair_not_adjacent8(
        self, sample_data: dict
    ) -> None:
        """H-05: adjacent8 forbidden ペア（児童・生徒 2, 5）が 8 方向で隣接していないこと。"""
        data = load_sample()
        data["constraints"]["forbidden"] = [
            {"student_id_a": 2, "student_id_b": 5, "type": "adjacent8"}
        ]
        solutions, _ = run_solver(data)
        assert solutions, "解が 1 件以上存在すること"
        num_cols = data["classroom"]["num_cols"]
        for sol in solutions:
            assign_map = {a["student_id"]: a["seat_id"] for a in sol}
            seat_2 = assign_map[2]
            seat_5 = assign_map[5]
            assert not _are_adjacent8(
                seat_2, seat_5, num_cols
            ), f"adjacent8 forbidden なのに児童・生徒2(座席{seat_2})と児童・生徒5(座席{seat_5})が8方向隣接"

    def test_same_group_forbidden_not_in_same_group(
        self, sample_data: dict
    ) -> None:
        """H-06: same_group forbidden ペアが同じ班に配置されないこと。"""
        data = load_sample()
        # 児童・生徒 1 と 2 を同班禁止に設定
        data["constraints"]["forbidden"] = [
            {"student_id_a": 1, "student_id_b": 2, "type": "same_group"}
        ]
        solutions, _ = run_solver(data)
        assert solutions, "解が 1 件以上存在すること"

        # 班レイアウトを確認
        for sol in solutions:
            assign_map = {a["student_id"]: a["seat_id"] for a in sol}
            seat_1 = assign_map[1]
            seat_2 = assign_map[2]
            # 2人が同じ班の座席に割り当てられていないことを確認
            for group in data["groups"]:
                group_seat_ids = set(group["seat_ids"])
                in_group_1 = seat_1 in group_seat_ids
                in_group_2 = seat_2 in group_seat_ids
                assert not (in_group_1 and in_group_2), (
                    f"same_group forbidden なのに児童・生徒1(座席{seat_1})と"
                    f"児童・生徒2(座席{seat_2})が同班{group['group_id']}に配置"
                )

    def test_default_type_is_adjacent8(self) -> None:
        """type フィールドなしの forbidden はデフォルト adjacent8 として動作すること。"""
        data = {
            "students": [
                {"id": 1, "gender": "male", "tags": []},
                {"id": 2, "gender": "female", "tags": []},
                {"id": 3, "gender": "male", "tags": []},
            ],
            "seats": [
                {"id": 1, "row": 1, "col": 1},
                {"id": 2, "row": 1, "col": 2},
                {"id": 3, "row": 1, "col": 3},
            ],
            "classroom": {"num_rows": 1, "num_cols": 3, "front_rows": [1]},
            "groups": [],
            # type フィールドなし（デフォルト adjacent8 として扱われる）
            "constraints": {
                "fixed": [],
                "forbidden": [{"student_id_a": 1, "student_id_b": 2}],
            },
            "prev_assign": [],
        }
        solutions, _ = run_solver(data)
        assert solutions, "解が 1 件以上存在すること"
        for sol in solutions:
            assign_map = {a["student_id"]: a["seat_id"] for a in sol}
            # 児童・生徒1と2は隣接不可（1列グリッドなので座席差が1なら隣接）
            seat_1, seat_2 = assign_map[1], assign_map[2]
            assert (
                abs(seat_1 - seat_2) != 1
            ), f"デフォルト adjacent8 なのに児童・生徒1(座席{seat_1})と児童・生徒2(座席{seat_2})が隣接"

    def test_seat_gender_male_only(self) -> None:
        """H-07: 男性専用座席に女性が配置されないこと。"""
        data = {
            "students": [
                {"id": 1, "gender": "male", "tags": []},
                {"id": 2, "gender": "female", "tags": []},
                {"id": 3, "gender": "male", "tags": []},
                {"id": 4, "gender": "female", "tags": []},
            ],
            "seats": [
                {"id": 1, "row": 1, "col": 1},
                {"id": 2, "row": 1, "col": 2},
                {"id": 3, "row": 2, "col": 1},
                {"id": 4, "row": 2, "col": 2},
            ],
            "classroom": {"num_rows": 2, "num_cols": 2, "front_rows": [1]},
            "groups": [],
            "constraints": {
                "fixed": [],
                "forbidden": [],
                "seat_gender": [{"seat_id": 1, "allowed_gender": "male"}],
            },
            "prev_assign": [],
        }
        solutions, _ = run_solver(data)
        assert solutions, "解が 1 件以上存在すること"
        gender_map = {s["id"]: s["gender"] for s in data["students"]}
        for sol in solutions:
            assign_map = {a["student_id"]: a["seat_id"] for a in sol}
            # 座席1（男性専用）に配置された学生の性別を確認
            student_in_seat1 = next(
                (sid for sid, rid in assign_map.items() if rid == 1), None
            )
            if student_in_seat1 is not None:
                assert (
                    gender_map[student_in_seat1] == "male"
                ), f"男性専用座席1に女性（ID:{student_in_seat1}）が配置された"

    def test_seat_gender_female_only(self) -> None:
        """H-07: 女性専用座席に男性が配置されないこと。"""
        data = {
            "students": [
                {"id": 1, "gender": "male", "tags": []},
                {"id": 2, "gender": "female", "tags": []},
                {"id": 3, "gender": "male", "tags": []},
                {"id": 4, "gender": "female", "tags": []},
            ],
            "seats": [
                {"id": 1, "row": 1, "col": 1},
                {"id": 2, "row": 1, "col": 2},
                {"id": 3, "row": 2, "col": 1},
                {"id": 4, "row": 2, "col": 2},
            ],
            "classroom": {"num_rows": 2, "num_cols": 2, "front_rows": [1]},
            "groups": [],
            "constraints": {
                "fixed": [],
                "forbidden": [],
                "seat_gender": [{"seat_id": 2, "allowed_gender": "female"}],
            },
            "prev_assign": [],
        }
        solutions, _ = run_solver(data)
        assert solutions, "解が 1 件以上存在すること"
        gender_map = {s["id"]: s["gender"] for s in data["students"]}
        for sol in solutions:
            assign_map = {a["student_id"]: a["seat_id"] for a in sol}
            student_in_seat2 = next(
                (sid for sid, rid in assign_map.items() if rid == 2), None
            )
            if student_in_seat2 is not None:
                assert (
                    gender_map[student_in_seat2] == "female"
                ), f"女性専用座席2に男性（ID:{student_in_seat2}）が配置された"

    def test_seat_gender_unsat(self) -> None:
        """H-07: 全座席が男性専用で女性がいる場合 UNSAT になること。"""
        data = {
            "students": [
                {"id": 1, "gender": "male", "tags": []},
                {"id": 2, "gender": "female", "tags": []},
            ],
            "seats": [
                {"id": 1, "row": 1, "col": 1},
                {"id": 2, "row": 1, "col": 2},
            ],
            "classroom": {"num_rows": 1, "num_cols": 2, "front_rows": [1]},
            "groups": [],
            "constraints": {
                "fixed": [],
                "forbidden": [],
                "seat_gender": [
                    {"seat_id": 1, "allowed_gender": "male"},
                    {"seat_id": 2, "allowed_gender": "male"},
                ],
            },
            "prev_assign": [],
        }
        solutions, _ = run_solver(data)
        assert (
            solutions == []
        ), f"女性が配置できる座席がないのに解が返った: {solutions}"

    def test_seat_gender_capacity_unsat_fast(self) -> None:
        """H-06 容量チェック: 性別ごとの人数が配置可能な座席数を超える場合、
        鳩の巣構造でも探索の枚挙に陥らず即座に確定 UNSAT になること。

        全30席に性別指定（男性18・女性12）で女性が15人のケース。
        カウント制約がないと CDCL の UNSAT 証明が指数時間かかり
        タイムアウトするため、timed_out=False の確認が本質的な検証。
        """
        seats = [
            {"id": (r - 1) * 6 + c, "row": r, "col": c}
            for r in range(1, 6)
            for c in range(1, 7)
        ]
        students = [
            {"id": i, "gender": "male" if i <= 15 else "female", "tags": []}
            for i in range(1, 31)
        ]
        # 座席1〜18は男性専用、19〜30は女性専用（女性可12席 < 女性15人）
        seat_gender = [
            {"seat_id": s["id"], "allowed_gender": "male" if s["id"] <= 18 else "female"}
            for s in seats
        ]
        data = {
            "students": students,
            "seats": seats,
            "classroom": {"num_rows": 5, "num_cols": 6, "front_rows": [1]},
            "groups": [],
            "constraints": {
                "fixed": [],
                "forbidden": [],
                "seat_gender": seat_gender,
            },
            "prev_assign": [],
        }
        solutions, timed_out = run_solver(data, timeout=5)
        assert solutions == [], f"容量超過なのに解が返った: {solutions}"
        assert timed_out is False, "確定 UNSAT がタイムアウト扱いになっている"

    def test_seat_gender_capacity_exact_fit_sat(self) -> None:
        """H-06 容量チェック: 人数と容量がちょうど一致する場合は解が存在すること。"""
        seats = [
            {"id": (r - 1) * 6 + c, "row": r, "col": c}
            for r in range(1, 6)
            for c in range(1, 7)
        ]
        # 男性18人・女性12人 = 専用座席数とちょうど一致
        students = [
            {"id": i, "gender": "male" if i <= 18 else "female", "tags": []}
            for i in range(1, 31)
        ]
        seat_gender = [
            {"seat_id": s["id"], "allowed_gender": "male" if s["id"] <= 18 else "female"}
            for s in seats
        ]
        data = {
            "students": students,
            "seats": seats,
            "classroom": {"num_rows": 5, "num_cols": 6, "front_rows": [1]},
            "groups": [],
            "constraints": {
                "fixed": [],
                "forbidden": [],
                "seat_gender": seat_gender,
            },
            "prev_assign": [],
        }
        solutions, _ = run_solver(data, max_solutions=1, timeout=10)
        assert solutions, "容量ちょうどの配置に解が存在しない"

    def test_relative_fixed_right(self) -> None:
        """H-08: 児童・生徒1の右隣(0,+1)に児童・生徒2が配置されること。"""
        data = {
            "students": [
                {"id": 1, "gender": "male", "tags": []},
                {"id": 2, "gender": "female", "tags": []},
                {"id": 3, "gender": "male", "tags": []},
                {"id": 4, "gender": "female", "tags": []},
            ],
            "seats": [
                {"id": 1, "row": 1, "col": 1},
                {"id": 2, "row": 1, "col": 2},
                {"id": 3, "row": 2, "col": 1},
                {"id": 4, "row": 2, "col": 2},
            ],
            "classroom": {"num_rows": 2, "num_cols": 2, "front_rows": [1]},
            "groups": [],
            "constraints": {
                "fixed": [],
                "forbidden": [],
                "relative_fixed": [
                    {
                        "student_id_a": 1,
                        "student_id_b": 2,
                        "d_row": 0,
                        "d_col": 1,
                    },
                ],
            },
            "prev_assign": [],
        }
        solutions, _ = run_solver(data)
        assert solutions, "解が 1 件以上存在すること"
        seat_map = {s["id"]: (s["row"], s["col"]) for s in data["seats"]}
        coord_to_seat = {(s["row"], s["col"]): s["id"] for s in data["seats"]}
        for sol in solutions:
            assign_map = {a["student_id"]: a["seat_id"] for a in sol}
            seat_a = assign_map[1]
            row_a, col_a = seat_map[seat_a]
            target_seat = coord_to_seat.get((row_a, col_a + 1))
            assert (
                target_seat is not None
            ), f"児童・生徒1(座席{seat_a})の右隣に座席が存在しない"
            assert (
                assign_map[2] == target_seat
            ), f"児童・生徒2は児童・生徒1の右隣(座席{target_seat})に配置されるべき: 実際は座席{assign_map[2]}"

    def test_relative_fixed_multiple(self) -> None:
        """H-08: 児童・生徒1の右(0,+1)に児童・生徒2、下(+1,0)に児童・生徒3が同時に配置されること。"""
        data = {
            "students": [
                {"id": 1, "gender": "male", "tags": []},
                {"id": 2, "gender": "female", "tags": []},
                {"id": 3, "gender": "male", "tags": []},
                {"id": 4, "gender": "female", "tags": []},
            ],
            "seats": [
                {"id": 1, "row": 1, "col": 1},
                {"id": 2, "row": 1, "col": 2},
                {"id": 3, "row": 2, "col": 1},
                {"id": 4, "row": 2, "col": 2},
            ],
            "classroom": {"num_rows": 2, "num_cols": 2, "front_rows": [1]},
            "groups": [],
            "constraints": {
                "fixed": [],
                "forbidden": [],
                "relative_fixed": [
                    {
                        "student_id_a": 1,
                        "student_id_b": 2,
                        "d_row": 0,
                        "d_col": 1,
                    },
                    {
                        "student_id_a": 1,
                        "student_id_b": 3,
                        "d_row": 1,
                        "d_col": 0,
                    },
                ],
            },
            "prev_assign": [],
        }
        solutions, _ = run_solver(data)
        assert solutions, "解が 1 件以上存在すること"
        seat_map = {s["id"]: (s["row"], s["col"]) for s in data["seats"]}
        coord_to_seat = {(s["row"], s["col"]): s["id"] for s in data["seats"]}
        for sol in solutions:
            assign_map = {a["student_id"]: a["seat_id"] for a in sol}
            seat_a = assign_map[1]
            row_a, col_a = seat_map[seat_a]
            # 右隣に児童・生徒2
            right_seat = coord_to_seat.get((row_a, col_a + 1))
            assert right_seat is not None
            assert assign_map[2] == right_seat
            # 下に児童・生徒3
            below_seat = coord_to_seat.get((row_a + 1, col_a))
            assert below_seat is not None
            assert assign_map[3] == below_seat

    def test_relative_fixed_edge_unsat(self) -> None:
        """H-08: 全児童・生徒に端方向の相対制約を設定し、配置不可能でUNSATになること。"""
        # 1×2グリッドで児童・生徒1の右に児童・生徒2、児童・生徒2の右に児童・生徒1
        # → 児童・生徒1が左端なら右に2が入るが、2の右には座席がない → UNSAT
        data = {
            "students": [
                {"id": 1, "gender": "male", "tags": []},
                {"id": 2, "gender": "female", "tags": []},
            ],
            "seats": [
                {"id": 1, "row": 1, "col": 1},
                {"id": 2, "row": 1, "col": 2},
            ],
            "classroom": {"num_rows": 1, "num_cols": 2, "front_rows": [1]},
            "groups": [],
            "constraints": {
                "fixed": [],
                "forbidden": [],
                "relative_fixed": [
                    {
                        "student_id_a": 1,
                        "student_id_b": 2,
                        "d_row": 0,
                        "d_col": 1,
                    },
                    {
                        "student_id_a": 2,
                        "student_id_b": 1,
                        "d_row": 0,
                        "d_col": 1,
                    },
                ],
            },
            "prev_assign": [],
        }
        solutions, _ = run_solver(data)
        assert (
            solutions == []
        ), f"相互右隣は不可能なのに解が返った: {solutions}"


# ── 班分散グループ制約テスト ──────────────────────────────────────────────────


class TestLeaderGroupConstraints:
    """H-10: 班分散グループ制約が全解で守られているかを検証する。"""

    def test_leader_group_not_in_same_group(self) -> None:
        """H-10: 班分散グループメンバーが同じ班に配置されないこと。"""
        # 6名・3班（班1: seats 1,2 / 班2: seats 3,4 / 班3: seats 5,6）
        # グループ0: 児童・生徒 1, 2, 3 → 各班に1人ずつ分散されるはず
        data = {
            "students": [
                {"id": 1, "gender": "male", "tags": []},
                {"id": 2, "gender": "female", "tags": []},
                {"id": 3, "gender": "male", "tags": []},
                {"id": 4, "gender": "female", "tags": []},
                {"id": 5, "gender": "male", "tags": []},
                {"id": 6, "gender": "female", "tags": []},
            ],
            "seats": [
                {"id": 1, "row": 1, "col": 1},
                {"id": 2, "row": 2, "col": 1},
                {"id": 3, "row": 1, "col": 2},
                {"id": 4, "row": 2, "col": 2},
                {"id": 5, "row": 1, "col": 3},
                {"id": 6, "row": 2, "col": 3},
            ],
            "classroom": {"num_rows": 2, "num_cols": 3, "front_rows": [1]},
            "groups": [
                {"group_id": 1, "seat_ids": [1, 2]},
                {"group_id": 2, "seat_ids": [3, 4]},
                {"group_id": 3, "seat_ids": [5, 6]},
            ],
            "constraints": {
                "fixed": [],
                "forbidden": [],
                "relative_fixed": [],
                "leader_groups": [
                    {"group_id": 0, "student_ids": [1, 2, 3]},
                ],
            },
            "prev_assign": [],
        }
        solutions, _ = run_solver(data)
        assert solutions, "解が 1 件以上存在すること"

        group_seat_map = {
            1: {1, 2},
            2: {3, 4},
            3: {5, 6},
        }
        leader_members = {1, 2, 3}

        for sol in solutions:
            assign_map = {a["student_id"]: a["seat_id"] for a in sol}
            for gid, seat_set in group_seat_map.items():
                members_in_group = [
                    sid
                    for sid in leader_members
                    if assign_map.get(sid) in seat_set
                ]
                assert (
                    len(members_in_group) <= 1
                ), f"班{gid}に班分散グループのメンバーが複数配置された: {members_in_group}"

    def test_leader_group_multiple_groups(self) -> None:
        """H-10: 複数の班分散グループが独立して機能すること。"""
        # 6名・3班（班1: seats 1,2 / 班2: seats 3,4 / 班3: seats 5,6）
        # グループ0: [1,2]、グループ1: [3,4] を設定
        # グループ0メンバー同士は同班禁止、グループ1メンバー同士も同班禁止
        data = {
            "students": [
                {"id": 1, "gender": "male", "tags": []},
                {"id": 2, "gender": "female", "tags": []},
                {"id": 3, "gender": "male", "tags": []},
                {"id": 4, "gender": "female", "tags": []},
                {"id": 5, "gender": "male", "tags": []},
                {"id": 6, "gender": "female", "tags": []},
            ],
            "seats": [
                {"id": 1, "row": 1, "col": 1},
                {"id": 2, "row": 2, "col": 1},
                {"id": 3, "row": 1, "col": 2},
                {"id": 4, "row": 2, "col": 2},
                {"id": 5, "row": 1, "col": 3},
                {"id": 6, "row": 2, "col": 3},
            ],
            "classroom": {"num_rows": 2, "num_cols": 3, "front_rows": [1]},
            "groups": [
                {"group_id": 1, "seat_ids": [1, 2]},
                {"group_id": 2, "seat_ids": [3, 4]},
                {"group_id": 3, "seat_ids": [5, 6]},
            ],
            "constraints": {
                "fixed": [],
                "forbidden": [],
                "relative_fixed": [],
                "leader_groups": [
                    {"group_id": 0, "student_ids": [1, 2]},
                    {"group_id": 1, "student_ids": [3, 4]},
                ],
            },
            "prev_assign": [],
        }
        solutions, _ = run_solver(data)
        assert solutions, "解が 1 件以上存在すること"

        group_seat_map = {
            1: {1, 2},
            2: {3, 4},
            3: {5, 6},
        }
        leader_groups_def = [
            {1, 2},
            {3, 4},
        ]

        for sol in solutions:
            assign_map = {a["student_id"]: a["seat_id"] for a in sol}
            for lg_members in leader_groups_def:
                for gid, seat_set in group_seat_map.items():
                    members_in_group = [
                        sid
                        for sid in lg_members
                        if assign_map.get(sid) in seat_set
                    ]
                    assert (
                        len(members_in_group) <= 1
                    ), f"班{gid}に班分散グループのメンバー{lg_members}が複数配置された: {members_in_group}"

    def test_leader_group_unsat(self) -> None:
        """H-10: グループ人数 > 班数でUNSATになること。"""
        # 2班構成で3名をグループに設定 → 2班しかないため少なくとも1班に2名入ってしまう → UNSAT
        data = {
            "students": [
                {"id": 1, "gender": "male", "tags": []},
                {"id": 2, "gender": "female", "tags": []},
                {"id": 3, "gender": "male", "tags": []},
                {"id": 4, "gender": "female", "tags": []},
                {"id": 5, "gender": "male", "tags": []},
                {"id": 6, "gender": "female", "tags": []},
            ],
            "seats": [
                {"id": 1, "row": 1, "col": 1},
                {"id": 2, "row": 1, "col": 2},
                {"id": 3, "row": 1, "col": 3},
                {"id": 4, "row": 2, "col": 1},
                {"id": 5, "row": 2, "col": 2},
                {"id": 6, "row": 2, "col": 3},
            ],
            "classroom": {"num_rows": 2, "num_cols": 3, "front_rows": [1]},
            "groups": [
                {"group_id": 1, "seat_ids": [1, 2, 4, 5]},
                {"group_id": 2, "seat_ids": [3, 6]},
            ],
            "constraints": {
                "fixed": [],
                "forbidden": [],
                "relative_fixed": [],
                "leader_groups": [
                    {"group_id": 0, "student_ids": [1, 2, 3]},
                ],
            },
            "prev_assign": [],
            # 班2には2席しかないため、3名グループのうち少なくとも2名が班1に入ることになる
            # ただし班1には4席あるため問題なく配置できる場合もある
            # → 真にUNSATにするには、3名を3班に分散させる必要があるが班が2つしかない
            # ここでは確実にUNSATにするため班サイズを1にする
        }
        # 上記は実はSATになりうるので、確実にUNSATになる構成に変更:
        # 各班が1席のみ（班1: [1], 班2: [2]）でグループに3名を設定
        data = {
            "students": [
                {"id": 1, "gender": "male", "tags": []},
                {"id": 2, "gender": "female", "tags": []},
                {"id": 3, "gender": "male", "tags": []},
            ],
            "seats": [
                {"id": 1, "row": 1, "col": 1},
                {"id": 2, "row": 1, "col": 2},
                {"id": 3, "row": 1, "col": 3},
            ],
            "classroom": {"num_rows": 1, "num_cols": 3, "front_rows": [1]},
            "groups": [
                {"group_id": 1, "seat_ids": [1]},
                {"group_id": 2, "seat_ids": [2]},
                # 班3のみに2人入ってしまうことになる（班1,2は1席ずつなので各1人まで）
                # → グループ内の3人が3班に分散するには3班以上必要
                # しかし班3がないため... 実は班3がある必要がある
            ],
            "constraints": {
                "fixed": [],
                "forbidden": [],
                "relative_fixed": [],
                "leader_groups": [
                    {"group_id": 0, "student_ids": [1, 2, 3]},
                ],
            },
            "prev_assign": [],
        }
        # 確実にUNSATにするには: 2班で各班1席のみ、グループに3名
        data = {
            "students": [
                {"id": 1, "gender": "male", "tags": []},
                {"id": 2, "gender": "female", "tags": []},
                {"id": 3, "gender": "male", "tags": []},
                {"id": 4, "gender": "female", "tags": []},
            ],
            "seats": [
                {"id": 1, "row": 1, "col": 1},
                {"id": 2, "row": 1, "col": 2},
                {"id": 3, "row": 2, "col": 1},
                {"id": 4, "row": 2, "col": 2},
            ],
            "classroom": {"num_rows": 2, "num_cols": 2, "front_rows": [1]},
            "groups": [
                {"group_id": 1, "seat_ids": [1, 2]},
                {"group_id": 2, "seat_ids": [3, 4]},
            ],
            "constraints": {
                "fixed": [],
                "forbidden": [],
                "relative_fixed": [],
                # 4人中3人が同グループ → 2班に3人が入るため少なくとも1班に2人 → UNSAT
                "leader_groups": [
                    {"group_id": 0, "student_ids": [1, 2, 3]},
                ],
            },
            "prev_assign": [],
        }
        solutions, _ = run_solver(data)
        assert (
            solutions == []
        ), f"班数(2)を超えるグループ人数(3)でも解が返った: {solutions}"


# ── 解多様性（距離制約）テスト ─────────────────────────────────────────────────


def _hamming(
    sol_a: list[dict[str, int]], sol_b: list[dict[str, int]]
) -> int:
    """2 つの解の間で座席が異なる生徒数を返す。"""
    map_a = {a["student_id"]: a["seat_id"] for a in sol_a}
    map_b = {a["student_id"]: a["seat_id"] for a in sol_b}
    return sum(1 for sid in map_a if map_a[sid] != map_b.get(sid))


def _tiny_data(n: int) -> dict:
    """制約なし・タグなしの n 名 × 1×n グリッド（全解がコスト 0）。"""
    return {
        "students": [
            {"id": i, "gender": "male" if i % 2 else "female", "tags": []}
            for i in range(1, n + 1)
        ],
        "seats": [{"id": i, "row": 1, "col": i} for i in range(1, n + 1)],
        "classroom": {"num_rows": 1, "num_cols": n, "front_rows": [1]},
        "groups": [],
        "constraints": {"fixed": [], "forbidden": []},
        "prev_assign": [],
    }


class TestSolutionDiversity:
    """距離制約（SOLVER_MIN_DIFF_RATIO / min_diff_ratio）の検証。"""

    def test_pairwise_min_distance_guaranteed(self, sample_data: dict) -> None:
        """返る解候補どうしは min_diff 人以上座席が異なること。"""
        # 6 名 × 比率 0.5 → 最小差分 3 人
        solutions, _ = run_solver(
            sample_data, max_solutions=5, min_diff_ratio=0.5
        )
        assert len(solutions) >= 1
        for i in range(len(solutions)):
            for j in range(i + 1, len(solutions)):
                d = _hamming(solutions[i], solutions[j])
                assert d >= 3, (
                    f"解{i}と解{j}の差分が{d}人しかない（最低3人必要）"
                )

    def test_diversity_exhaustion_returns_fewer(self) -> None:
        """十分に異なる解が尽きたら件数を水増しせず打ち切ること。

        3 名 × 1×3 グリッドで比率 1.0（全員移動）を要求すると、
        互いに全席が異なる置換は最大 3 つ（ラテン方格の行）しか存在しない。
        よって max_solutions=5 でもちょうど 3 件で打ち切られ、
        UNSAT による打ち切りは timeout として報告されない。
        """
        solutions, timed_out = run_solver(
            _tiny_data(3), max_solutions=5, min_diff_ratio=1.0
        )
        assert len(solutions) == 3, (
            f"相互に全席が異なる置換は3つのはずが {len(solutions)} 件返った"
        )
        assert timed_out is False
        for i in range(len(solutions)):
            for j in range(i + 1, len(solutions)):
                assert _hamming(solutions[i], solutions[j]) == 3

    def test_true_unsat_still_reported(self, unsat_data: dict) -> None:
        """距離制約が有効でも、元問題の UNSAT は解なしとして返ること。"""
        solutions, timed_out = run_solver(unsat_data, min_diff_ratio=0.5)
        assert solutions == []
        assert timed_out is False

    def test_all_fixed_clamps_min_diff(self) -> None:
        """全員固定でも距離制約が実現可能上限にクランプされ解が返ること。"""
        data = _tiny_data(3)
        data["constraints"]["fixed"] = [
            {"student_id": i, "seat_id": i} for i in range(1, 4)
        ]
        solutions, timed_out = run_solver(
            data, max_solutions=5, min_diff_ratio=1.0
        )
        # 唯一解（全員固定）が 1 件だけ返る
        assert len(solutions) == 1
        assert timed_out is False
        assert {a["student_id"]: a["seat_id"] for a in solutions[0]} == {
            1: 1,
            2: 2,
            3: 3,
        }

    def test_ratio_zero_disables_diversity(self, sample_data: dict) -> None:
        """比率 0 で距離制約が無効化され、従来どおり解が得られること。"""
        solutions, _ = run_solver(
            sample_data, max_solutions=3, min_diff_ratio=0.0
        )
        assert len(solutions) >= 1


# ── 前後配慮エリア未設定（空リスト）テスト ─────────────────────────────────────


class TestPreferenceZoneAbsence:
    """エリア0行（空リスト）は「エリアなし」として安全に扱われる。"""

    def test_empty_front_rows_solves_without_crash(self) -> None:
        """front_rows=[] + front_preferred タグでもソルバが正常に解を返す。"""
        data = {
            "students": [
                {"id": 1, "gender": "male", "tags": ["front_preferred"]},
                {"id": 2, "gender": "female", "tags": []},
            ],
            "seats": [
                {"id": 1, "row": 1, "col": 1},
                {"id": 2, "row": 1, "col": 2},
            ],
            "classroom": {
                "num_rows": 1, "num_cols": 2,
                "front_rows": [], "back_rows": [],
            },
            "groups": [],
            "constraints": {},
            "prev_assign": [],
        }
        solutions, timed_out = run_solver(data, max_solutions=2, timeout=5)
        assert len(solutions) >= 1
        assert timed_out is False

    def test_empty_back_rows_means_no_back_zone(self) -> None:
        """back_rows=[] は BackRow ファクトを生成しない（最終行フォールバックしない）。"""
        from backend.solver.facts import build_factbase
        from backend.solver.predicates import BackRow

        base = {
            "students": [{"id": 1, "gender": "male", "tags": []}],
            "seats": [
                {"id": 1, "row": 1, "col": 1},
                {"id": 2, "row": 2, "col": 1},
            ],
            "front_rows": [1],
            "groups": [], "fixed": [], "forbidden": [], "seat_gender": [],
            "relative_fixed": [], "leader_groups": [], "prev_assign": [],
            "prev_options": {}, "soft_toggles": {},
        }
        fb_empty = build_factbase({**base, "back_rows": []})
        assert list(fb_empty.query(BackRow).all()) == []

        fb_none = build_factbase({**base, "back_rows": None})
        rows = [b.row for b in fb_none.query(BackRow).all()]
        assert rows == [2], "None 時は最終行を自動設定する"


# ── S-05 トグル連動（differ_seat）テスト（Issue #58） ──────────────────────────


class TestPrevSeatToggle:
    """S-05 は opt_prev_seat_differ（differ_seat トグル）が有効なときだけ働く。"""

    BASE_FACTS = (
        "student(1, male). seat(1,1,1). front_row(1). back_row(1). "
        "prev_assign(1,1)."
    )

    def _optimal_cost(self, facts: str) -> list[int] | None:
        """lp ファイル + ファクトを直接 clingo で解き、最適コストを返す。"""
        import clingo

        from backend.solver.runner import LP_DIR

        ctl = clingo.Control(["--opt-mode=opt", "-n", "0"])
        for name in ["base.lp", "hard.lp", "soft.lp"]:
            ctl.load(str(LP_DIR / name))
        ctl.add("base", [], facts)
        ctl.ground([("base", [])])
        costs: list[list[int]] = []
        ctl.solve(on_model=lambda m: costs.append(list(m.cost)))
        return costs[-1] if costs else None

    def test_penalty_inactive_without_toggle(self) -> None:
        """トグル OFF では前回同席にペナルティが付かない（コスト項なし）。"""
        cost = self._optimal_cost(self.BASE_FACTS)
        assert cost is not None
        assert all(c == 0 for c in cost), f"OFF なのにコストが付いた: {cost}"

    def test_penalty_active_with_toggle(self) -> None:
        """トグル ON では前回同席（1席のみで回避不能）にペナルティ 1 が付く。"""
        cost = self._optimal_cost(
            self.BASE_FACTS + " opt_prev_seat_differ."
        )
        assert cost is not None
        assert cost[-1] == 1, f"ON なのに @1 ペナルティがない: {cost}"

    def test_toggle_forces_different_seats(self) -> None:
        """トグル ON なら最良解は前回と異なる配置（2人2席で入替）になる。"""
        data = {
            "students": [
                {"id": 1, "gender": "male", "tags": []},
                {"id": 2, "gender": "male", "tags": []},
            ],
            "seats": [
                {"id": 1, "row": 1, "col": 1},
                {"id": 2, "row": 1, "col": 2},
            ],
            "classroom": {"num_rows": 1, "num_cols": 2, "front_rows": [1]},
            "groups": [],
            "constraints": {},
            "prev_assign": [
                {"student_id": 1, "seat_id": 1},
                {"student_id": 2, "seat_id": 2},
            ],
            "options": {"prev_options": {"differ_seat": True}},
        }
        solutions, _ = run_solver(
            data, max_solutions=1, min_diff_ratio=0.0
        )
        assert solutions
        assign_map = {a["student_id"]: a["seat_id"] for a in solutions[0]}
        assert assign_map == {1: 2, 2: 1}, (
            f"前回席の入替になっていない: {assign_map}"
        )


# ── エンコーディング改善（Issue #55）テスト ──────────────────────────────────


class TestEncodingCleanups:
    """#55: 空班の S-03 対象外化・総容量の冗長制約。"""

    def _optimal_cost(self, facts: str) -> list[int] | None:
        import clingo

        from backend.solver.runner import LP_DIR

        ctl = clingo.Control(["--opt-mode=opt", "-n", "0"])
        for name in ["base.lp", "hard.lp", "soft.lp"]:
            ctl.load(str(LP_DIR / name))
        ctl.add("base", [], facts)
        ctl.ground([("base", [])])
        costs: list[list[int]] = []
        ctl.solve(on_model=lambda m: costs.append(list(m.cost)))
        return costs[-1] if costs else None

    def test_empty_group_not_penalized_by_gender_balance(self) -> None:
        """S-03: 誰も配置されていない班はペナルティ対象外（score.py と一致）。"""
        # 2人を班1（男女両方）に固定。班2の座席は空になる
        facts = (
            "student(1, male). student(2, female). "
            "seat(1,1,1). seat(2,1,2). seat(3,2,1). seat(4,2,2). "
            "front_row(1). back_row(2). "
            "group(1,1). group(1,2). group(2,3). group(2,4). "
            "fixed(1,1). fixed(2,2). "
            "opt_gender_balance."
        )
        cost = self._optimal_cost(facts)
        assert cost is not None
        assert all(c == 0 for c in cost), (
            f"空班（班2）にペナルティが付いている: {cost}"
        )

    def test_occupied_group_still_penalized(self) -> None:
        """S-03: 男性のみの班には従来どおりペナルティが付く。"""
        facts = (
            "student(1, male). student(2, male). "
            "seat(1,1,1). seat(2,1,2). "
            "front_row(1). back_row(1). "
            "group(1,1). group(1,2). "
            "opt_gender_balance."
        )
        cost = self._optimal_cost(facts)
        assert cost is not None
        # 女性0人のペナルティ1件のみ
        assert cost[-1] == 1, f"男性のみの班のペナルティがない: {cost}"

    def test_total_capacity_exceeded_is_immediate_unsat(self) -> None:
        """総人数 > 総座席数 は（APIを経なくても）即座に UNSAT が確定する。"""
        data = {
            "students": [
                {"id": i, "gender": "male", "tags": []} for i in range(1, 4)
            ],
            "seats": [
                {"id": 1, "row": 1, "col": 1},
                {"id": 2, "row": 1, "col": 2},
            ],
            "classroom": {"num_rows": 1, "num_cols": 2, "front_rows": [1]},
            "groups": [],
            "constraints": {},
            "prev_assign": [],
        }
        solutions, timed_out = run_solver(data, max_solutions=2, timeout=5)
        assert solutions == []
        assert timed_out is False
