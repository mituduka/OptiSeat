"""
OptiSeat スコア API テスト

POST /api/v1/score エンドポイントのテスト。（ソルバ不要）

実行方法（Dev Container 内）:
  pytest backend/tests/test_score_and_meta.py -v
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from backend.api.main import app

client = TestClient(app)

# ---------------------------------------------------------------------------
# 共通テストデータ（2×3グリッド）
# ---------------------------------------------------------------------------

# seat id → row/col: id=1(r1c1), 2(r1c2), 3(r1c3), 4(r2c1), 5(r2c2), 6(r2c3)
SEATS_2X3 = [
    {"id": i, "row": 1 + (i - 1) // 3, "col": 1 + (i - 1) % 3}
    for i in range(1, 7)
]

CLASSROOM_2X3 = {
    "num_rows": 2,
    "num_cols": 3,
    "front_rows": [1],
    "back_rows": [2],
}

GROUPS_2X3 = [
    {"group_id": 1, "seat_ids": [1, 2, 4, 5]},
    {"group_id": 2, "seat_ids": [3, 6]},
]

STUDENTS_3M3F = [
    {"id": 1, "gender": "male", "tags": []},
    {"id": 2, "gender": "male", "tags": []},
    {"id": 3, "gender": "male", "tags": []},
    {"id": 4, "gender": "female", "tags": []},
    {"id": 5, "gender": "female", "tags": []},
    {"id": 6, "gender": "female", "tags": []},
]

# 単純な直線配置: student i → seat i
ASSIGNMENTS_STRAIGHT = [{"student_id": i, "seat_id": i} for i in range(1, 7)]


def _score_req(**kwargs) -> dict:
    """デフォルト値付きのスコアリクエストを生成する。kwargs でフィールドを上書き可能。"""
    base: dict = {
        "assignments": ASSIGNMENTS_STRAIGHT,
        "students": STUDENTS_3M3F,
        "seats": SEATS_2X3,
        "classroom": CLASSROOM_2X3,
        "groups": GROUPS_2X3,
        "constraints": {"fixed": [], "forbidden": []},
        "prev_assign": [],
    }
    base.update(kwargs)
    return base


def _post_score(req: dict) -> dict:
    resp = client.post("/api/v1/score", json=req)
    assert resp.status_code == 200
    return resp.json()


def _bd(req: dict) -> dict:
    """スコアリクエストを送信してbreakdownを返す。"""
    return _post_score(req)["score"]["breakdown"]


# ===========================================================================
# POST /api/v1/score — 基本動作
# ===========================================================================


class TestScoreEndpointBasic:
    BREAKDOWN_FIELDS = [
        "front_preferred_violation",
        "back_preferred_violation",
        "group_gender_imbalance",
        "loneliness_violation",
        "prev_assign_same",
        "prev_neighbor_same",
        "prev_group_same",
        "fixed_violation",
        "gender_constraint_violation",
        "relative_fixed_violation",
        "forbidden_violation",
        "leader_group_violation",
    ]

    def test_returns_200(self):
        resp = client.post("/api/v1/score", json=_score_req())
        assert resp.status_code == 200

    def test_response_has_score_field(self):
        data = _post_score(_score_req())
        assert "score" in data

    def test_score_has_total_and_breakdown(self):
        data = _post_score(_score_req())
        assert "total" in data["score"]
        assert "breakdown" in data["score"]

    def test_breakdown_has_all_11_fields(self):
        bd = _bd(_score_req())
        for field in self.BREAKDOWN_FIELDS:
            assert field in bd, f"field '{field}' missing in breakdown"

    def test_total_is_non_negative(self):
        data = _post_score(_score_req())
        assert data["score"]["total"] >= 0

    def test_minimum_single_assignment(self):
        req = {
            "assignments": [{"student_id": 1, "seat_id": 1}],
            "students": [{"id": 1, "gender": "male", "tags": []}],
            "seats": [{"id": 1, "row": 1, "col": 1}],
            "classroom": {"num_rows": 1, "num_cols": 1, "front_rows": [1]},
        }
        resp = client.post("/api/v1/score", json=req)
        assert resp.status_code == 200


# ===========================================================================
# POST /api/v1/score — front/back_preferred 違反カウント
# ===========================================================================


class TestComputeScoreFrontBack:
    # 2行1列グリッド: seat1=row1, seat2=row2
    _SEATS = [{"id": 1, "row": 1, "col": 1}, {"id": 2, "row": 2, "col": 1}]
    _CLASSROOM = {
        "num_rows": 2,
        "num_cols": 1,
        "front_rows": [1],
        "back_rows": [2],
    }

    def _req(
        self, students: list, assignments: list, classroom: dict | None = None
    ) -> dict:
        return {
            "assignments": assignments,
            "students": students,
            "seats": self._SEATS,
            "classroom": classroom or self._CLASSROOM,
        }

    def test_front_preferred_in_front_row_zero_violation(self):
        students = [
            {"id": 1, "gender": "male", "tags": ["front_preferred"]},
            {"id": 2, "gender": "female", "tags": []},
        ]
        # s1(front_preferred) → seat1(row1=front) → no violation
        bd = _bd(
            self._req(
                students,
                [
                    {"student_id": 1, "seat_id": 1},
                    {"student_id": 2, "seat_id": 2},
                ],
            )
        )
        assert bd["front_preferred_violation"] == 0

    def test_front_preferred_not_in_front_row_one_violation(self):
        students = [
            {"id": 1, "gender": "male", "tags": ["front_preferred"]},
            {"id": 2, "gender": "female", "tags": []},
        ]
        # s1(front_preferred) → seat2(row2=back) → violation=1
        bd = _bd(
            self._req(
                students,
                [
                    {"student_id": 1, "seat_id": 2},
                    {"student_id": 2, "seat_id": 1},
                ],
            )
        )
        assert bd["front_preferred_violation"] == 1

    def test_back_preferred_in_back_row_zero_violation(self):
        students = [
            {"id": 1, "gender": "male", "tags": ["back_preferred"]},
            {"id": 2, "gender": "female", "tags": []},
        ]
        # s1(back_preferred) → seat2(row2=back) → no violation
        bd = _bd(
            self._req(
                students,
                [
                    {"student_id": 1, "seat_id": 2},
                    {"student_id": 2, "seat_id": 1},
                ],
            )
        )
        assert bd["back_preferred_violation"] == 0

    def test_back_preferred_not_in_back_row_one_violation(self):
        students = [
            {"id": 1, "gender": "male", "tags": ["back_preferred"]},
            {"id": 2, "gender": "female", "tags": []},
        ]
        # s1(back_preferred) → seat1(row1=front) → violation=1
        bd = _bd(
            self._req(
                students,
                [
                    {"student_id": 1, "seat_id": 1},
                    {"student_id": 2, "seat_id": 2},
                ],
            )
        )
        assert bd["back_preferred_violation"] == 1

    def test_two_front_preferred_both_violated(self):
        # 2×2グリッド: seat1(r1c1), seat2(r1c2), seat3(r2c1), seat4(r2c2)
        seats = [
            {"id": 1, "row": 1, "col": 1},
            {"id": 2, "row": 1, "col": 2},
            {"id": 3, "row": 2, "col": 1},
            {"id": 4, "row": 2, "col": 2},
        ]
        classroom = {
            "num_rows": 2,
            "num_cols": 2,
            "front_rows": [1],
            "back_rows": [2],
        }
        students = [
            {"id": 1, "gender": "male", "tags": ["front_preferred"]},
            {"id": 2, "gender": "female", "tags": ["front_preferred"]},
            {"id": 3, "gender": "male", "tags": []},
            {"id": 4, "gender": "female", "tags": []},
        ]
        # s1,s2 (front_preferred) → row2 → both violated
        assignments = [
            {"student_id": 1, "seat_id": 3},
            {"student_id": 2, "seat_id": 4},
            {"student_id": 3, "seat_id": 1},
            {"student_id": 4, "seat_id": 2},
        ]
        req = {
            "assignments": assignments,
            "students": students,
            "seats": seats,
            "classroom": classroom,
        }
        bd = _bd(req)
        assert bd["front_preferred_violation"] == 2

    def test_back_rows_none_auto_detects_max_row(self):
        # back_rows を省略(None) → 最大行を自動検出して back_row とする
        students = [
            {"id": 1, "gender": "male", "tags": ["back_preferred"]},
            {"id": 2, "gender": "female", "tags": []},
        ]
        classroom_no_back = {"num_rows": 2, "num_cols": 1, "front_rows": [1]}
        # s1(back_preferred) → seat2(row2)、back_rows 自動検出で row2 → violation=0
        bd = _bd(
            self._req(
                students,
                [
                    {"student_id": 1, "seat_id": 2},
                    {"student_id": 2, "seat_id": 1},
                ],
                classroom=classroom_no_back,
            )
        )
        assert bd["back_preferred_violation"] == 0


# ===========================================================================
# POST /api/v1/score — 班内男女偏りカウント
# ===========================================================================


class TestComputeScoreGroupGender:
    def test_balanced_group_zero_imbalance(self):
        # 各班に男1女1 → imbalance=0
        students = [
            {"id": 1, "gender": "male", "tags": []},
            {"id": 2, "gender": "female", "tags": []},
        ]
        seats = [{"id": 1, "row": 1, "col": 1}, {"id": 2, "row": 1, "col": 2}]
        groups = [{"group_id": 1, "seat_ids": [1, 2]}]
        req = {
            "assignments": [
                {"student_id": 1, "seat_id": 1},
                {"student_id": 2, "seat_id": 2},
            ],
            "students": students,
            "seats": seats,
            "classroom": {"num_rows": 1, "num_cols": 2, "front_rows": [1]},
            "groups": groups,
        }
        bd = _bd(req)
        assert bd["group_gender_imbalance"] == 0

    def test_all_male_group_one_imbalance(self):
        # 班2(seats 3,6)に男2人のみ → females=0 → imbalance=1
        # 班1(seats 1,2,4,5)に男1+女3 → balanced
        students = [
            {"id": 1, "gender": "male", "tags": []},  # → seat1 (group1)
            {"id": 2, "gender": "female", "tags": []},  # → seat2 (group1)
            {
                "id": 3,
                "gender": "male",
                "tags": [],
            },  # → seat3 (group2) all-male
            {"id": 4, "gender": "female", "tags": []},  # → seat4 (group1)
            {"id": 5, "gender": "female", "tags": []},  # → seat5 (group1)
            {
                "id": 6,
                "gender": "male",
                "tags": [],
            },  # → seat6 (group2) all-male
        ]
        assignments = [{"student_id": i, "seat_id": i} for i in range(1, 7)]
        req = _score_req(
            students=students, assignments=assignments, groups=GROUPS_2X3
        )
        bd = _bd(req)
        assert bd["group_gender_imbalance"] == 1

    def test_all_female_group_one_imbalance(self):
        # 班2(seats 3,6)に女2人のみ → males=0 → imbalance=1
        students = [
            {"id": 1, "gender": "male", "tags": []},  # → seat1 (group1)
            {"id": 2, "gender": "male", "tags": []},  # → seat2 (group1)
            {
                "id": 3,
                "gender": "female",
                "tags": [],
            },  # → seat3 (group2) all-female
            {"id": 4, "gender": "female", "tags": []},  # → seat4 (group1)
            {"id": 5, "gender": "male", "tags": []},  # → seat5 (group1)
            {
                "id": 6,
                "gender": "female",
                "tags": [],
            },  # → seat6 (group2) all-female
        ]
        assignments = [{"student_id": i, "seat_id": i} for i in range(1, 7)]
        req = _score_req(
            students=students, assignments=assignments, groups=GROUPS_2X3
        )
        bd = _bd(req)
        assert bd["group_gender_imbalance"] == 1

    def test_two_unbalanced_groups_imbalance_two(self):
        # 班1(4席)=全男, 班2(2席)=全女 → 合計imbalance=2
        # 4M + 2F で班1に4男、班2に2女
        students = [
            {"id": 1, "gender": "male", "tags": []},  # → seat1 (group1)
            {"id": 2, "gender": "male", "tags": []},  # → seat2 (group1)
            {"id": 3, "gender": "female", "tags": []},  # → seat3 (group2)
            {"id": 4, "gender": "male", "tags": []},  # → seat4 (group1)
            {"id": 5, "gender": "male", "tags": []},  # → seat5 (group1)
            {"id": 6, "gender": "female", "tags": []},  # → seat6 (group2)
        ]
        assignments = [{"student_id": i, "seat_id": i} for i in range(1, 7)]
        req = _score_req(
            students=students, assignments=assignments, groups=GROUPS_2X3
        )
        bd = _bd(req)
        assert bd["group_gender_imbalance"] == 2

    def test_no_groups_zero_imbalance(self):
        bd = _bd(_score_req(groups=[]))
        assert bd["group_gender_imbalance"] == 0


# ===========================================================================
# POST /api/v1/score — 孤独感（loneliness）違反カウント
# ===========================================================================


class TestComputeScoreLoneliness:
    def test_same_gender_neighbor_zero_loneliness(self):
        # 1行2列, 男2人が横隣 → 互いに同性横隣あり → loneliness=0
        students = [
            {"id": 1, "gender": "male", "tags": []},
            {"id": 2, "gender": "male", "tags": []},
        ]
        seats = [{"id": 1, "row": 1, "col": 1}, {"id": 2, "row": 1, "col": 2}]
        req = {
            "assignments": [
                {"student_id": 1, "seat_id": 1},
                {"student_id": 2, "seat_id": 2},
            ],
            "students": students,
            "seats": seats,
            "classroom": {"num_rows": 1, "num_cols": 2, "front_rows": [1]},
            "groups": [],
        }
        bd = _bd(req)
        assert bd["loneliness_violation"] == 0

    def test_isolated_no_same_gender_peer_one_violation(self):
        # 1行3列, f1(c1) - m2(c2) - f3(c3)、班はf1とf3が同班
        # f1,f3 は同班で同性ピアあり → 孤独ではない
        # m2 は横隣が全員女性、班なし → 孤独=1
        students = [
            {"id": 1, "gender": "female", "tags": []},
            {"id": 2, "gender": "male", "tags": []},
            {"id": 3, "gender": "female", "tags": []},
        ]
        seats = [
            {"id": 1, "row": 1, "col": 1},
            {"id": 2, "row": 1, "col": 2},
            {"id": 3, "row": 1, "col": 3},
        ]
        groups = [
            {"group_id": 1, "seat_ids": [1, 3]}
        ]  # f1,f3 同班（m2は含まない）
        req = {
            "assignments": [
                {"student_id": 1, "seat_id": 1},
                {"student_id": 2, "seat_id": 2},
                {"student_id": 3, "seat_id": 3},
            ],
            "students": students,
            "seats": seats,
            "classroom": {"num_rows": 1, "num_cols": 3, "front_rows": [1]},
            "groups": groups,
        }
        bd = _bd(req)
        assert bd["loneliness_violation"] == 1

    def test_same_gender_in_group_satisfies_loneliness(self):
        # 2×2, 全員同班、横隣が異性でも同班同性で救済 → loneliness=0
        students = [
            {"id": 1, "gender": "male", "tags": []},  # → seat1(r1c1), 横隣=f2
            {
                "id": 2,
                "gender": "female",
                "tags": [],
            },  # → seat2(r1c2), 横隣=m1
            {"id": 3, "gender": "male", "tags": []},  # → seat3(r2c1), 横隣=f4
            {
                "id": 4,
                "gender": "female",
                "tags": [],
            },  # → seat4(r2c2), 横隣=m3
        ]
        seats = [
            {"id": 1, "row": 1, "col": 1},
            {"id": 2, "row": 1, "col": 2},
            {"id": 3, "row": 2, "col": 1},
            {"id": 4, "row": 2, "col": 2},
        ]
        groups = [{"group_id": 1, "seat_ids": [1, 2, 3, 4]}]
        req = {
            "assignments": [
                {"student_id": i, "seat_id": i} for i in range(1, 5)
            ],
            "students": students,
            "seats": seats,
            "classroom": {"num_rows": 2, "num_cols": 2, "front_rows": [1]},
            "groups": groups,
        }
        bd = _bd(req)
        assert bd["loneliness_violation"] == 0


# ===========================================================================
# POST /api/v1/score — 前回座席関連違反カウント
# ===========================================================================


class TestComputeScorePrevAssign:
    def test_no_prev_assign_zero_violations(self):
        bd = _bd(_score_req(prev_assign=[]))
        assert bd["prev_assign_same"] == 0

    def test_all_same_seats_as_prev(self):
        prev = [{"student_id": i, "seat_id": i} for i in range(1, 7)]
        bd = _bd(
            _score_req(assignments=ASSIGNMENTS_STRAIGHT, prev_assign=prev)
        )
        assert bd["prev_assign_same"] == 6

    def test_partial_prev_same(self):
        # student 1,2 は前回と同じ座席、3〜6は入れ替え → prev_assign_same=2
        prev = [{"student_id": i, "seat_id": i} for i in range(1, 7)]
        current = [
            {"student_id": 1, "seat_id": 1},  # 同じ
            {"student_id": 2, "seat_id": 2},  # 同じ
            {"student_id": 3, "seat_id": 4},  # 違う
            {"student_id": 4, "seat_id": 3},  # 違う
            {"student_id": 5, "seat_id": 6},  # 違う
            {"student_id": 6, "seat_id": 5},  # 違う
        ]
        bd = _bd(_score_req(assignments=current, prev_assign=prev))
        assert bd["prev_assign_same"] == 2

    def test_prev_neighbor_no_prev_assign(self):
        bd = _bd(_score_req(prev_assign=[]))
        assert bd["prev_neighbor_same"] == 0

    def test_prev_neighbor_counts_repeated_pair(self):
        # 2人が前回も今回も横隣 → prev_neighbor_same=1
        students = [
            {"id": 1, "gender": "male", "tags": []},
            {"id": 2, "gender": "female", "tags": []},
        ]
        seats = [{"id": 1, "row": 1, "col": 1}, {"id": 2, "row": 1, "col": 2}]
        prev = [
            {"student_id": 1, "seat_id": 1},
            {"student_id": 2, "seat_id": 2},
        ]
        req = {
            "assignments": [
                {"student_id": 1, "seat_id": 1},
                {"student_id": 2, "seat_id": 2},
            ],
            "students": students,
            "seats": seats,
            "classroom": {"num_rows": 1, "num_cols": 2, "front_rows": [1]},
            "groups": [],
            "prev_assign": prev,
        }
        bd = _bd(req)
        assert bd["prev_neighbor_same"] == 1

    def test_prev_group_composition_changed(self):
        # 前回と班構成が完全に変わった → prev_group_same=0
        # prev: group1={1,2,4,5}, group2={3,6}
        # current: group1={3,4,5,6}, group2={1,2}
        prev = [{"student_id": i, "seat_id": i} for i in range(1, 7)]
        current = [
            {"student_id": 3, "seat_id": 1},  # group1
            {"student_id": 4, "seat_id": 2},  # group1
            {"student_id": 1, "seat_id": 3},  # group2
            {"student_id": 5, "seat_id": 4},  # group1
            {"student_id": 6, "seat_id": 5},  # group1
            {"student_id": 2, "seat_id": 6},  # group2
        ]
        bd = _bd(
            _score_req(
                assignments=current, groups=GROUPS_2X3, prev_assign=prev
            )
        )
        assert bd["prev_group_same"] == 0

    def test_prev_group_identical_composition(self):
        # 前回と全班構成が一致 → prev_group_same=2
        # group1: seats[1,2,4,5] → students{1,2,4,5} (prev=current)
        # group2: seats[3,6]     → students{3,6} (prev=current)
        prev = [{"student_id": i, "seat_id": i} for i in range(1, 7)]
        # 同じグループ内で座席を入れ替え → 班メンバーは変わらない
        current = [
            {"student_id": 2, "seat_id": 1},  # group1（1↔2入れ替え）
            {"student_id": 1, "seat_id": 2},  # group1
            {"student_id": 6, "seat_id": 3},  # group2（3↔6入れ替え）
            {"student_id": 5, "seat_id": 4},  # group1（4↔5入れ替え）
            {"student_id": 4, "seat_id": 5},  # group1
            {"student_id": 3, "seat_id": 6},  # group2
        ]
        bd = _bd(
            _score_req(
                assignments=current, groups=GROUPS_2X3, prev_assign=prev
            )
        )
        assert bd["prev_group_same"] == 2


# ===========================================================================
# POST /api/v1/score — ハード制約違反カウント（手動変更検出）
# ===========================================================================


class TestComputeScoreHardViolations:
    def test_fixed_violation_detected(self):
        # student1 を seat1 に固定したが、実際には seat2 → fixed_violation=1
        constraints = {
            "fixed": [{"student_id": 1, "seat_id": 1}],
            "forbidden": [],
        }
        assignments = [
            {"student_id": 1, "seat_id": 2},  # 固定違反
            {"student_id": 2, "seat_id": 1},
            {"student_id": 3, "seat_id": 3},
            {"student_id": 4, "seat_id": 4},
            {"student_id": 5, "seat_id": 5},
            {"student_id": 6, "seat_id": 6},
        ]
        bd = _bd(_score_req(assignments=assignments, constraints=constraints))
        assert bd["fixed_violation"] == 1

    def test_fixed_constraint_satisfied(self):
        # student1 を seat1 に固定、実際にも seat1 → fixed_violation=0
        constraints = {
            "fixed": [{"student_id": 1, "seat_id": 1}],
            "forbidden": [],
        }
        bd = _bd(
            _score_req(
                assignments=ASSIGNMENTS_STRAIGHT, constraints=constraints
            )
        )
        assert bd["fixed_violation"] == 0

    def test_gender_constraint_violation(self):
        # seat1 は male_only, 女性(id=4)を seat1 に配置 → gender_constraint_violation=1
        constraints = {
            "fixed": [],
            "forbidden": [],
            "seat_gender": [{"seat_id": 1, "allowed_gender": "male"}],
        }
        assignments = [
            {
                "student_id": 4,
                "seat_id": 1,
            },  # female → male_only seat → violation
            {"student_id": 1, "seat_id": 4},
            {"student_id": 2, "seat_id": 2},
            {"student_id": 3, "seat_id": 3},
            {"student_id": 5, "seat_id": 5},
            {"student_id": 6, "seat_id": 6},
        ]
        bd = _bd(_score_req(assignments=assignments, constraints=constraints))
        assert bd["gender_constraint_violation"] == 1

    def test_gender_constraint_satisfied(self):
        # seat1 は male_only, 男性(id=1)を seat1 に配置 → violation=0
        constraints = {
            "fixed": [],
            "forbidden": [],
            "seat_gender": [{"seat_id": 1, "allowed_gender": "male"}],
        }
        bd = _bd(
            _score_req(
                assignments=ASSIGNMENTS_STRAIGHT, constraints=constraints
            )
        )
        assert bd["gender_constraint_violation"] == 0

    def test_relative_fixed_violation(self):
        # student_id_a=1 (seat1=r1c1) の右隣(d_col=+1) に student_id_b=2 が来るべき
        # だが student2 は seat3(r1c3) にいる → violation=1
        constraints = {
            "fixed": [],
            "forbidden": [],
            "relative_fixed": [
                {"student_id_a": 1, "student_id_b": 2, "d_row": 0, "d_col": 1}
            ],
        }
        assignments = [
            {"student_id": 1, "seat_id": 1},  # seat1(r1c1)
            {
                "student_id": 2,
                "seat_id": 3,
            },  # seat3(r1c3) ≠ seat2(r1c2) → violation
            {"student_id": 3, "seat_id": 2},
            {"student_id": 4, "seat_id": 4},
            {"student_id": 5, "seat_id": 5},
            {"student_id": 6, "seat_id": 6},
        ]
        bd = _bd(_score_req(assignments=assignments, constraints=constraints))
        assert bd["relative_fixed_violation"] == 1

    def test_forbidden_adjacent8_violation(self):
        # student1,student2 は adjacent8 禁止、横隣に配置 → violation=1
        constraints = {
            "fixed": [],
            "forbidden": [
                {"student_id_a": 1, "student_id_b": 2, "type": "adjacent8"}
            ],
        }
        # s1→seat1(r1c1), s2→seat2(r1c2): 同行・隣列 → adjacent8 違反
        bd = _bd(
            _score_req(
                assignments=ASSIGNMENTS_STRAIGHT, constraints=constraints
            )
        )
        assert bd["forbidden_violation"] == 1

    def test_forbidden_same_group_violation(self):
        # student1,student2 は same_group 禁止、同班に配置 → violation=1
        constraints = {
            "fixed": [],
            "forbidden": [
                {"student_id_a": 1, "student_id_b": 2, "type": "same_group"}
            ],
        }
        # ASSIGNMENTS_STRAIGHT: s1→seat1, s2→seat2 ともに group1(seats[1,2,4,5])
        bd = _bd(
            _score_req(
                assignments=ASSIGNMENTS_STRAIGHT,
                groups=GROUPS_2X3,
                constraints=constraints,
            )
        )
        assert bd["forbidden_violation"] == 1


# ===========================================================================
# POST /api/v1/score — total = weighted sum of soft violations
# ===========================================================================


class TestBreakdownToTotal:
    def test_total_matches_weighted_sum(self):
        # front_preferred_violation=1(weight=3) + group_gender_imbalance=1(weight=2) = 5
        # 2座席・2男性、前側希望が後列に、全員同班（no females → imbalance=1）
        students = [
            {"id": 1, "gender": "male", "tags": ["front_preferred"]},
            {"id": 2, "gender": "male", "tags": []},
        ]
        seats = [{"id": 1, "row": 1, "col": 1}, {"id": 2, "row": 2, "col": 1}]
        groups = [{"group_id": 1, "seat_ids": [1, 2]}]
        # s1(front_preferred) → seat2(row2=後列) → front_violation=1
        # group1 = {m1, m2} → no females → imbalance=1
        req = {
            "assignments": [
                {"student_id": 1, "seat_id": 2},
                {"student_id": 2, "seat_id": 1},
            ],
            "students": students,
            "seats": seats,
            "classroom": {
                "num_rows": 2,
                "num_cols": 1,
                "front_rows": [1],
                "back_rows": [2],
            },
            "groups": groups,
        }
        data = _post_score(req)
        bd = data["score"]["breakdown"]
        assert bd["front_preferred_violation"] == 1
        assert bd["group_gender_imbalance"] == 1
        assert data["score"]["total"] == 1 * 3 + 1 * 2  # = 5

    def test_zero_total_when_no_violations(self):
        # 完全に最適な配置 → total=0
        # 2×2: m1(front_preferred)→r1c1(front), f2(back_preferred)→r2c1(back)
        #        m3→r1c2, f4→r2c2
        # 班1(seats 1,3): m1+f2 バランス, 班2(seats 2,4): m3+f4 バランス
        # 横隣: m1↔m3, f2↔f4 → 同性隣接あり → loneliness=0
        students = [
            {"id": 1, "gender": "male", "tags": ["front_preferred"]},
            {"id": 2, "gender": "female", "tags": ["back_preferred"]},
            {"id": 3, "gender": "male", "tags": []},
            {"id": 4, "gender": "female", "tags": []},
        ]
        seats = [
            {"id": 1, "row": 1, "col": 1},
            {"id": 2, "row": 1, "col": 2},
            {"id": 3, "row": 2, "col": 1},
            {"id": 4, "row": 2, "col": 2},
        ]
        groups = [
            {"group_id": 1, "seat_ids": [1, 3]},  # m1, f2
            {"group_id": 2, "seat_ids": [2, 4]},  # m3, f4
        ]
        assignments = [
            {"student_id": 1, "seat_id": 1},  # m1 → r1c1(front) ✓
            {"student_id": 2, "seat_id": 3},  # f2 → r2c1(back) ✓
            {"student_id": 3, "seat_id": 2},  # m3 → r1c2
            {"student_id": 4, "seat_id": 4},  # f4 → r2c2
        ]
        req = {
            "assignments": assignments,
            "students": students,
            "seats": seats,
            "classroom": {
                "num_rows": 2,
                "num_cols": 2,
                "front_rows": [1],
                "back_rows": [2],
            },
            "groups": groups,
        }
        data = _post_score(req)
        assert data["score"]["total"] == 0

    def test_hard_violations_not_in_total(self):
        # fixed_violation があっても total に含まれない（weight=None）
        students = [
            {"id": 1, "gender": "male", "tags": []},
            {"id": 2, "gender": "male", "tags": []},
        ]
        seats = [{"id": 1, "row": 1, "col": 1}, {"id": 2, "row": 1, "col": 2}]
        # s1を seat1 に固定したが、実際には seat2 に配置 → fixed_violation=1
        constraints = {
            "fixed": [{"student_id": 1, "seat_id": 1}],
            "forbidden": [],
        }
        assignments = [
            {"student_id": 1, "seat_id": 2},
            {"student_id": 2, "seat_id": 1},
        ]
        req = {
            "assignments": assignments,
            "students": students,
            "seats": seats,
            "classroom": {"num_rows": 1, "num_cols": 2, "front_rows": [1]},
            "groups": [],
            "constraints": constraints,
        }
        data = _post_score(req)
        bd = data["score"]["breakdown"]
        assert bd["fixed_violation"] >= 1
        # total は soft 制約の重み付き合計のみ（fixed は含まない）
        # この配置では soft 制約違反なし → total=0
        assert data["score"]["total"] == 0


# ===========================================================================
# POST /api/v1/score — leader_group（班分散グループ）違反カウント
# ===========================================================================


class TestLeaderGroupViolationViaApi:
    """POST /api/v1/score 経由で班分散グループ違反のカウントを検証する。"""

    def test_no_violation_when_members_in_different_groups(self):
        """別々の班にメンバーがいる場合は違反0。"""
        # GROUPS_2X3: 班1=[1,2,4,5], 班2=[3,6]
        # ASSIGNMENTS_STRAIGHT: 1→1, 2→2, 3→3, ... → 学生1=班1, 学生3=班2
        req = _score_req(
            constraints={
                "fixed": [],
                "forbidden": [],
                "seat_gender": [],
                "relative_fixed": [],
                "leader_groups": [{"group_id": 0, "student_ids": [1, 3]}],
            }
        )
        bd = _bd(req)
        assert bd["leader_group_violation"] == 0

    def test_violation_when_members_in_same_group(self):
        """同じ班にメンバーが複数いる場合、超過分をカウント。"""
        # 学生1,2 がともに班1 → 超過1
        req = _score_req(
            constraints={
                "fixed": [],
                "forbidden": [],
                "seat_gender": [],
                "relative_fixed": [],
                "leader_groups": [{"group_id": 0, "student_ids": [1, 2]}],
            }
        )
        bd = _bd(req)
        assert bd["leader_group_violation"] == 1

    def test_violation_total_excludes_leader_group(self):
        """leader_group_violation は total に含まれない（weight=None）。"""
        req = _score_req(
            constraints={
                "fixed": [],
                "forbidden": [],
                "seat_gender": [],
                "relative_fixed": [],
                "leader_groups": [
                    {"group_id": 0, "student_ids": [1, 2, 4, 5]}
                ],  # 全員班1
            }
        )
        data = _post_score(req)
        bd = data["score"]["breakdown"]
        assert bd["leader_group_violation"] == 3  # 4人 → 超過3
        # total は soft 制約のみ（leader_group_violation は含まない）
        # 配置自体は同性ピア・前後配慮など他のカウントを含まない構成
        assert (
            data["score"]["total"]
            == bd["loneliness_violation"] * 2
            + bd["group_gender_imbalance"] * 2
        )
