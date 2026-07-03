"""
OptiSeat 入力検証 テスト

backend.api.validation の run_validation を直接呼び出す単体テスト。

実行方法（Dev Container 内）:
  pytest backend/tests/test_validation.py -v
"""

from __future__ import annotations

from backend.api.validation import run_validation
from backend.api.schemas import ValidateRequest

# ---------------------------------------------------------------------------
# テストデータ構築ヘルパー
# ---------------------------------------------------------------------------

_STUDENTS = [
    {"id": 1, "gender": "male", "tags": []},
    {"id": 2, "gender": "female", "tags": []},
    {"id": 3, "gender": "male", "tags": []},
]
# 2×2 グリッド: id=1(r1c1) 2(r1c2) 3(r2c1) 4(r2c2)
_SEATS = [
    {"id": (r - 1) * 2 + c, "row": r, "col": c}
    for r in range(1, 3)
    for c in range(1, 3)
]


def _req(constraints: dict | None = None) -> ValidateRequest:
    return ValidateRequest.model_validate(
        {
            "students": _STUDENTS,
            "seats": _SEATS,
            "constraints": constraints
            or {
                "fixed": [],
                "forbidden": [],
                "seat_gender": [],
                "relative_fixed": [],
            },
        }
    )


# ---------------------------------------------------------------------------
# 矛盾なし
# ---------------------------------------------------------------------------


class TestNoWarnings:
    def test_empty_constraints_no_warnings(self):
        warnings = run_validation(_req())
        assert warnings == []

    def test_valid_fixed_no_warnings(self):
        constraints = {
            "fixed": [{"student_id": 1, "seat_id": 1}],
            "forbidden": [],
            "seat_gender": [],
            "relative_fixed": [],
        }
        warnings = run_validation(_req(constraints))
        assert warnings == []

    def test_valid_forbidden_no_warnings(self):
        constraints = {
            "fixed": [],
            "forbidden": [
                {"student_id_a": 1, "student_id_b": 2, "type": "adjacent8"}
            ],
            "seat_gender": [],
            "relative_fixed": [],
        }
        warnings = run_validation(_req(constraints))
        assert warnings == []


# ---------------------------------------------------------------------------
# fixed 制約チェック
# ---------------------------------------------------------------------------


class TestFixedConstraintValidation:
    def test_unknown_student_id_in_fixed(self):
        constraints = {
            "fixed": [{"student_id": 999, "seat_id": 1}],
            "forbidden": [],
            "seat_gender": [],
            "relative_fixed": [],
        }
        warnings = run_validation(_req(constraints))
        codes = [w.code for w in warnings]
        assert "UNKNOWN_STUDENT_ID" in codes

    def test_unknown_seat_id_in_fixed(self):
        constraints = {
            "fixed": [{"student_id": 1, "seat_id": 999}],
            "forbidden": [],
            "seat_gender": [],
            "relative_fixed": [],
        }
        warnings = run_validation(_req(constraints))
        codes = [w.code for w in warnings]
        assert "UNKNOWN_SEAT_ID" in codes

    def test_two_students_fixed_to_same_seat(self):
        constraints = {
            "fixed": [
                {"student_id": 1, "seat_id": 1},
                {"student_id": 2, "seat_id": 1},
            ],
            "forbidden": [],
            "seat_gender": [],
            "relative_fixed": [],
        }
        warnings = run_validation(_req(constraints))
        codes = [w.code for w in warnings]
        assert "FIXED_SEAT_CONFLICT" in codes

    def test_different_seats_no_seat_conflict(self):
        constraints = {
            "fixed": [
                {"student_id": 1, "seat_id": 1},
                {"student_id": 2, "seat_id": 2},
            ],
            "forbidden": [],
            "seat_gender": [],
            "relative_fixed": [],
        }
        warnings = run_validation(_req(constraints))
        codes = [w.code for w in warnings]
        assert "FIXED_SEAT_CONFLICT" not in codes

    def test_multiple_warnings_accumulated(self):
        """存在しない student_id + seat_id → 2件以上の警告。"""
        constraints = {
            "fixed": [{"student_id": 999, "seat_id": 888}],
            "forbidden": [],
            "seat_gender": [],
            "relative_fixed": [],
        }
        warnings = run_validation(_req(constraints))
        assert len(warnings) >= 2

    def test_same_student_fixed_to_multiple_seats(self):
        """同じ人を複数の座席に固定 → FIXED_STUDENT_CONFLICT。"""
        constraints = {
            "fixed": [
                {"student_id": 1, "seat_id": 1},
                {"student_id": 1, "seat_id": 2},
            ],
            "forbidden": [],
            "seat_gender": [],
            "relative_fixed": [],
        }
        warnings = run_validation(_req(constraints))
        codes = [w.code for w in warnings]
        assert "FIXED_STUDENT_CONFLICT" in codes

    def test_different_students_no_student_conflict(self):
        constraints = {
            "fixed": [
                {"student_id": 1, "seat_id": 1},
                {"student_id": 2, "seat_id": 2},
            ],
            "forbidden": [],
            "seat_gender": [],
            "relative_fixed": [],
        }
        warnings = run_validation(_req(constraints))
        codes = [w.code for w in warnings]
        assert "FIXED_STUDENT_CONFLICT" not in codes


# ---------------------------------------------------------------------------
# forbidden 制約チェック
# ---------------------------------------------------------------------------


class TestForbiddenConstraintValidation:
    def test_unknown_student_id_a_in_forbidden(self):
        constraints = {
            "fixed": [],
            "forbidden": [
                {"student_id_a": 999, "student_id_b": 1, "type": "adjacent8"}
            ],
            "seat_gender": [],
            "relative_fixed": [],
        }
        warnings = run_validation(_req(constraints))
        codes = [w.code for w in warnings]
        assert "UNKNOWN_STUDENT_ID" in codes

    def test_unknown_student_id_b_in_forbidden(self):
        constraints = {
            "fixed": [],
            "forbidden": [
                {"student_id_a": 1, "student_id_b": 999, "type": "adjacent8"}
            ],
            "seat_gender": [],
            "relative_fixed": [],
        }
        warnings = run_validation(_req(constraints))
        codes = [w.code for w in warnings]
        assert "UNKNOWN_STUDENT_ID" in codes


# ---------------------------------------------------------------------------
# seat_gender 制約チェック
# ---------------------------------------------------------------------------


class TestSeatGenderValidation:
    def test_unknown_seat_id_in_seat_gender(self):
        constraints = {
            "fixed": [],
            "forbidden": [],
            "seat_gender": [{"seat_id": 999, "allowed_gender": "female"}],
            "relative_fixed": [],
        }
        warnings = run_validation(_req(constraints))
        codes = [w.code for w in warnings]
        assert "UNKNOWN_SEAT_ID" in codes

    def test_gender_fixed_conflict(self):
        """male を female 専用席に固定 → GENDER_FIXED_CONFLICT。"""
        constraints = {
            "fixed": [{"student_id": 1, "seat_id": 1}],  # student1 = male
            "forbidden": [],
            "seat_gender": [{"seat_id": 1, "allowed_gender": "female"}],
            "relative_fixed": [],
        }
        warnings = run_validation(_req(constraints))
        codes = [w.code for w in warnings]
        assert "GENDER_FIXED_CONFLICT" in codes

    def test_matching_gender_no_conflict(self):
        """male を male 専用席に固定 → 矛盾なし。"""
        constraints = {
            "fixed": [{"student_id": 1, "seat_id": 1}],  # student1 = male
            "forbidden": [],
            "seat_gender": [{"seat_id": 1, "allowed_gender": "male"}],
            "relative_fixed": [],
        }
        warnings = run_validation(_req(constraints))
        codes = [w.code for w in warnings]
        assert "GENDER_FIXED_CONFLICT" not in codes

    def test_gender_conflict_detected_with_duplicate_fixed(self):
        """同一座席に複数人固定されていても性別矛盾を見逃さない。

        以前は {seat_id: student_id} の dict で後勝ち上書きされていたため、
        先に登録された生徒の性別矛盾を見逃していた（回帰テスト）。
        """
        constraints = {
            "fixed": [
                {"student_id": 1, "seat_id": 1},  # student1 = male（矛盾）
                {"student_id": 2, "seat_id": 1},  # student2 = female（一致）
            ],
            "forbidden": [],
            "seat_gender": [{"seat_id": 1, "allowed_gender": "female"}],
            "relative_fixed": [],
        }
        warnings = run_validation(_req(constraints))
        codes = [w.code for w in warnings]
        assert "GENDER_FIXED_CONFLICT" in codes


# ---------------------------------------------------------------------------
# relative_fixed 制約チェック
# ---------------------------------------------------------------------------


class TestRelativeFixedValidation:
    def test_unknown_student_id_in_relative_fixed(self):
        constraints = {
            "fixed": [],
            "forbidden": [],
            "seat_gender": [],
            "relative_fixed": [
                {
                    "student_id_a": 999,
                    "student_id_b": 1,
                    "d_row": 0,
                    "d_col": 1,
                }
            ],
        }
        warnings = run_validation(_req(constraints))
        codes = [w.code for w in warnings]
        assert "UNKNOWN_STUDENT_ID" in codes

    def test_relative_fixed_forbidden8_conflict(self):
        """同一ペアに relative_fixed と forbidden8 → RELATIVE_FIXED_FORBIDDEN_CONFLICT。"""
        constraints = {
            "fixed": [],
            "forbidden": [
                {"student_id_a": 1, "student_id_b": 2, "type": "adjacent8"}
            ],
            "seat_gender": [],
            "relative_fixed": [
                {"student_id_a": 1, "student_id_b": 2, "d_row": 0, "d_col": 1}
            ],
        }
        warnings = run_validation(_req(constraints))
        codes = [w.code for w in warnings]
        assert "RELATIVE_FIXED_FORBIDDEN_CONFLICT" in codes

    def test_relative_fixed_same_group_no_conflict(self):
        """forbidden の type=same_group と relative_fixed は矛盾しない。"""
        constraints = {
            "fixed": [],
            "forbidden": [
                {"student_id_a": 1, "student_id_b": 2, "type": "same_group"}
            ],
            "seat_gender": [],
            "relative_fixed": [
                {"student_id_a": 1, "student_id_b": 2, "d_row": 0, "d_col": 1}
            ],
        }
        warnings = run_validation(_req(constraints))
        codes = [w.code for w in warnings]
        assert "RELATIVE_FIXED_FORBIDDEN_CONFLICT" not in codes

    def test_relative_fixed_conflict_deduplicated(self):
        """同一ペアに複数の relative_fixed があっても警告は1件のみ。"""
        constraints = {
            "fixed": [],
            "forbidden": [
                {"student_id_a": 1, "student_id_b": 2, "type": "adjacent8"}
            ],
            "seat_gender": [],
            "relative_fixed": [
                {"student_id_a": 1, "student_id_b": 2, "d_row": 0, "d_col": 1},
                {
                    "student_id_a": 2,
                    "student_id_b": 1,
                    "d_row": 0,
                    "d_col": -1,
                },  # 逆順
            ],
        }
        warnings = run_validation(_req(constraints))
        conflict_warnings = [
            w
            for w in warnings
            if w.code == "RELATIVE_FIXED_FORBIDDEN_CONFLICT"
        ]
        assert len(conflict_warnings) == 1


# ---------------------------------------------------------------------------
# leader_groups（班分散グループ）バリデーション
# ---------------------------------------------------------------------------


class TestLeaderGroupValidation:
    def test_valid_leader_group_no_warnings(self):
        """名簿に存在する2人以上のメンバーで構成されたグループは警告なし。"""
        constraints = {
            "fixed": [],
            "forbidden": [],
            "seat_gender": [],
            "relative_fixed": [],
            "leader_groups": [{"group_id": 0, "student_ids": [1, 2]}],
        }
        warnings = run_validation(_req(constraints))
        assert all(w.code != "UNKNOWN_STUDENT_ID" for w in warnings)

    def test_unknown_student_id_in_leader_group(self):
        """名簿に存在しない student_id を含むグループは警告を出す。"""
        constraints = {
            "fixed": [],
            "forbidden": [],
            "seat_gender": [],
            "relative_fixed": [],
            "leader_groups": [{"group_id": 0, "student_ids": [1, 999]}],
        }
        warnings = run_validation(_req(constraints))
        codes = [w.code for w in warnings]
        assert "UNKNOWN_STUDENT_ID" in codes
        # メッセージにグループID と存在しないIDが含まれること
        msgs = [w.message for w in warnings if w.code == "UNKNOWN_STUDENT_ID"]
        assert any("999" in m for m in msgs)

    def test_multiple_leader_groups_validated_independently(self):
        """複数グループそれぞれで未知IDを検出する。"""
        constraints = {
            "fixed": [],
            "forbidden": [],
            "seat_gender": [],
            "relative_fixed": [],
            "leader_groups": [
                {"group_id": 0, "student_ids": [1, 998]},
                {"group_id": 1, "student_ids": [2, 999]},
            ],
        }
        warnings = run_validation(_req(constraints))
        unknown_msgs = [
            w.message for w in warnings if w.code == "UNKNOWN_STUDENT_ID"
        ]
        assert any("998" in m for m in unknown_msgs)
        assert any("999" in m for m in unknown_msgs)
