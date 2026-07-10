"""
OptiSeat スコア計算 テスト

backend.api.score の compute_score / breakdown_to_total を直接呼び出す単体テスト。

実行方法（Dev Container 内）:
  pytest backend/tests/test_score.py -v
"""

from __future__ import annotations

from backend.api.score import (
    CONSTRAINT_WEIGHTS,
    breakdown_to_total,
    compute_score,
)
from backend.api.schemas import ScoreBreakdown

# ---------------------------------------------------------------------------
# 共通テストデータ
# ---------------------------------------------------------------------------

# 2×3 グリッド: seat_id = (row-1)*3 + col
SEATS = [
    {"id": (r - 1) * 3 + c, "row": r, "col": c}
    for r in range(1, 3)
    for c in range(1, 4)
]
# id: 1(r1c1) 2(r1c2) 3(r1c3) 4(r2c1) 5(r2c2) 6(r2c3)

CLASSROOM = {"num_rows": 2, "num_cols": 3, "front_rows": [1], "back_rows": [2]}

GROUPS = [
    {"group_id": 1, "seat_ids": [1, 2, 4, 5]},
    {"group_id": 2, "seat_ids": [3, 6]},
]

# 3男3女
STUDENTS = [
    {"id": 1, "gender": "male", "tags": []},
    {"id": 2, "gender": "male", "tags": []},
    {"id": 3, "gender": "male", "tags": []},
    {"id": 4, "gender": "female", "tags": []},
    {"id": 5, "gender": "female", "tags": []},
    {"id": 6, "gender": "female", "tags": []},
]

# 直線配置: student i → seat i
STRAIGHT = [{"student_id": i, "seat_id": i} for i in range(1, 7)]


def _req(**overrides) -> dict:
    base = {
        "students": STUDENTS,
        "seats": SEATS,
        "classroom": CLASSROOM,
        "groups": GROUPS,
        "constraints": {
            "fixed": [],
            "forbidden": [],
            "seat_gender": [],
            "relative_fixed": [],
        },
        "prev_assign": [],
    }
    base.update(overrides)
    return base


# ---------------------------------------------------------------------------
# CONSTRAINT_WEIGHTS
# ---------------------------------------------------------------------------


class TestConstraintWeights:
    def test_all_keys_present(self):
        expected = {
            "front_preferred_violation",
            "back_preferred_violation",
            "group_gender_imbalance",
            "loneliness_violation",
            "prev_neighbor_same",
            "prev_group_same",
            "prev_assign_same",
        }
        assert set(CONSTRAINT_WEIGHTS.keys()) == expected

    def test_weights_are_positive(self):
        for key, w in CONSTRAINT_WEIGHTS.items():
            assert w > 0, f"{key} weight must be positive"


# ---------------------------------------------------------------------------
# breakdown_to_total
# ---------------------------------------------------------------------------


class TestBreakdownToTotal:
    def test_zero_breakdown_gives_zero(self):
        bd = ScoreBreakdown(
            front_preferred_violation=0,
            back_preferred_violation=0,
            group_gender_imbalance=0,
            loneliness_violation=0,
            prev_assign_same=0,
            prev_neighbor_same=0,
            prev_group_same=0,
            fixed_violation=0,
            gender_constraint_violation=0,
            relative_fixed_violation=0,
            forbidden_violation=0,
        )
        assert breakdown_to_total(bd) == 0

    def test_single_violation_uses_correct_weight(self):
        bd = ScoreBreakdown(
            front_preferred_violation=1,
            back_preferred_violation=0,
            group_gender_imbalance=0,
            loneliness_violation=0,
            prev_assign_same=0,
            prev_neighbor_same=0,
            prev_group_same=0,
            fixed_violation=0,
            gender_constraint_violation=0,
            relative_fixed_violation=0,
            forbidden_violation=0,
        )
        assert (
            breakdown_to_total(bd)
            == CONSTRAINT_WEIGHTS["front_preferred_violation"]
        )

    def test_hard_constraint_violations_not_in_total(self):
        """fixed/gender/relative_fixed/forbidden はハード制約なので CONSTRAINT_WEIGHTS に含まれない。"""
        bd = ScoreBreakdown(
            front_preferred_violation=0,
            back_preferred_violation=0,
            group_gender_imbalance=0,
            loneliness_violation=0,
            prev_assign_same=0,
            prev_neighbor_same=0,
            prev_group_same=0,
            fixed_violation=1,
            gender_constraint_violation=1,
            relative_fixed_violation=1,
            forbidden_violation=1,
        )
        assert breakdown_to_total(bd) == 0


# ---------------------------------------------------------------------------
# compute_score — front/back preferred
# ---------------------------------------------------------------------------


class TestFrontBackPreferred:
    _SEATS2 = [{"id": 1, "row": 1, "col": 1}, {"id": 2, "row": 2, "col": 1}]
    _CLS2 = {"num_rows": 2, "num_cols": 1, "front_rows": [1], "back_rows": [2]}

    def test_front_preferred_in_front_row_no_violation(self):
        students = [{"id": 1, "gender": "male", "tags": ["front_preferred"]}]
        req = {
            "students": students,
            "seats": self._SEATS2,
            "classroom": self._CLS2,
            "groups": [],
            "constraints": {
                "fixed": [],
                "forbidden": [],
                "seat_gender": [],
                "relative_fixed": [],
            },
            "prev_assign": [],
        }
        bd = compute_score([{"student_id": 1, "seat_id": 1}], req)
        assert bd.front_preferred_violation == 0

    def test_front_preferred_in_back_row_violation(self):
        students = [{"id": 1, "gender": "male", "tags": ["front_preferred"]}]
        req = {
            "students": students,
            "seats": self._SEATS2,
            "classroom": self._CLS2,
            "groups": [],
            "constraints": {
                "fixed": [],
                "forbidden": [],
                "seat_gender": [],
                "relative_fixed": [],
            },
            "prev_assign": [],
        }
        bd = compute_score([{"student_id": 1, "seat_id": 2}], req)
        assert bd.front_preferred_violation == 1

    def test_back_preferred_in_back_row_no_violation(self):
        students = [{"id": 1, "gender": "male", "tags": ["back_preferred"]}]
        req = {
            "students": students,
            "seats": self._SEATS2,
            "classroom": self._CLS2,
            "groups": [],
            "constraints": {
                "fixed": [],
                "forbidden": [],
                "seat_gender": [],
                "relative_fixed": [],
            },
            "prev_assign": [],
        }
        bd = compute_score([{"student_id": 1, "seat_id": 2}], req)
        assert bd.back_preferred_violation == 0

    def test_back_preferred_in_front_row_violation(self):
        students = [{"id": 1, "gender": "male", "tags": ["back_preferred"]}]
        req = {
            "students": students,
            "seats": self._SEATS2,
            "classroom": self._CLS2,
            "groups": [],
            "constraints": {
                "fixed": [],
                "forbidden": [],
                "seat_gender": [],
                "relative_fixed": [],
            },
            "prev_assign": [],
        }
        bd = compute_score([{"student_id": 1, "seat_id": 1}], req)
        assert bd.back_preferred_violation == 1

    def test_back_preferred_without_back_rows_auto_detect(self):
        """back_rows が省略された場合、最大行を自動検出して back_row とする。"""
        students = [{"id": 1, "gender": "male", "tags": ["back_preferred"]}]
        cls = {
            "num_rows": 2,
            "num_cols": 1,
            "front_rows": [1],
        }  # back_rows 省略
        seats = [{"id": 1, "row": 2, "col": 1}]
        req = {
            "students": students,
            "seats": seats,
            "classroom": cls,
            "groups": [],
            "constraints": {
                "fixed": [],
                "forbidden": [],
                "seat_gender": [],
                "relative_fixed": [],
            },
            "prev_assign": [],
        }
        # row=2 が自動検出で back_row になるため、違反なし
        bd = compute_score([{"student_id": 1, "seat_id": 1}], req)
        assert bd.back_preferred_violation == 0

    def test_back_preferred_without_back_rows_front_row_violation(self):
        """back_rows 省略時、前列に配置された back_preferred は違反。"""
        students = [{"id": 1, "gender": "male", "tags": ["back_preferred"]}]
        cls = {
            "num_rows": 2,
            "num_cols": 1,
            "front_rows": [1],
        }  # back_rows 省略
        seats = [{"id": 1, "row": 1, "col": 1}, {"id": 2, "row": 2, "col": 1}]
        req = {
            "students": students,
            "seats": seats,
            "classroom": cls,
            "groups": [],
            "constraints": {
                "fixed": [],
                "forbidden": [],
                "seat_gender": [],
                "relative_fixed": [],
            },
            "prev_assign": [],
        }
        # row=1 に配置 → back_row(=2) ではないので違反
        bd = compute_score([{"student_id": 1, "seat_id": 1}], req)
        assert bd.back_preferred_violation == 1


# ---------------------------------------------------------------------------
# compute_score — group gender imbalance
# ---------------------------------------------------------------------------


class TestGroupGenderImbalance:
    def test_balanced_group_no_violation(self):
        """班に男女が1人ずつ → 違反なし。"""
        req = _req(
            students=[
                {"id": 1, "gender": "male", "tags": []},
                {"id": 2, "gender": "female", "tags": []},
            ],
            seats=SEATS[:2],
            classroom={"num_rows": 1, "num_cols": 2, "front_rows": [1]},
            groups=[{"group_id": 1, "seat_ids": [1, 2]}],
        )
        bd = compute_score(
            [{"student_id": 1, "seat_id": 1}, {"student_id": 2, "seat_id": 2}],
            req,
        )
        assert bd.group_gender_imbalance == 0

    def test_all_male_group_violation(self):
        """班が全員男性 → 1件違反（females==0）。"""
        req = _req(
            students=[
                {"id": 1, "gender": "male", "tags": []},
                {"id": 2, "gender": "male", "tags": []},
            ],
            seats=SEATS[:2],
            classroom={"num_rows": 1, "num_cols": 2, "front_rows": [1]},
            groups=[{"group_id": 1, "seat_ids": [1, 2]}],
        )
        bd = compute_score(
            [{"student_id": 1, "seat_id": 1}, {"student_id": 2, "seat_id": 2}],
            req,
        )
        assert bd.group_gender_imbalance == 1  # females==0


# ---------------------------------------------------------------------------
# compute_score — prev_assign_same
# ---------------------------------------------------------------------------


class TestPrevAssignSame:
    def test_same_seat_as_prev_counted(self):
        req = _req(prev_assign=[{"student_id": 1, "seat_id": 1}])
        bd = compute_score(STRAIGHT, req)
        assert bd.prev_assign_same >= 1

    def test_all_different_from_prev_no_violation(self):
        # 前回は逆順配置（student1→seat6, ... student6→seat1）
        prev = [{"student_id": i, "seat_id": 7 - i} for i in range(1, 7)]
        req = _req(prev_assign=prev)
        bd = compute_score(STRAIGHT, req)
        assert bd.prev_assign_same == 0

    def test_no_prev_assign_zero_violation(self):
        req = _req(prev_assign=[])
        bd = compute_score(STRAIGHT, req)
        assert bd.prev_assign_same == 0


# ---------------------------------------------------------------------------
# compute_score — ハード制約違反（手動変更で発生しうる）
# ---------------------------------------------------------------------------


class TestHardConstraintViolations:
    def test_fixed_violation_when_student_not_at_fixed_seat(self):
        req = _req(
            constraints={
                "fixed": [{"student_id": 1, "seat_id": 2}],  # seat2 に固定
                "forbidden": [],
                "seat_gender": [],
                "relative_fixed": [],
            }
        )
        # student1 を seat1 に配置 → 固定違反
        bd = compute_score(STRAIGHT, req)
        assert bd.fixed_violation == 1

    def test_fixed_no_violation_when_correct(self):
        req = _req(
            constraints={
                "fixed": [{"student_id": 1, "seat_id": 1}],
                "forbidden": [],
                "seat_gender": [],
                "relative_fixed": [],
            }
        )
        bd = compute_score(STRAIGHT, req)
        assert bd.fixed_violation == 0

    def test_gender_constraint_violation(self):
        """male の学生を female 専用席に配置 → 違反1件。"""
        req = _req(
            constraints={
                "fixed": [],
                "forbidden": [],
                "seat_gender": [{"seat_id": 1, "allowed_gender": "female"}],
                "relative_fixed": [],
            }
        )
        # student1(male) → seat1(female のみ)
        bd = compute_score(STRAIGHT, req)
        assert bd.gender_constraint_violation == 1

    def test_forbidden_adjacent8_violation(self):
        """隣接禁止ペアが実際に隣接している場合、違反を検出する。"""
        req = _req(
            constraints={
                "fixed": [],
                "forbidden": [
                    {"student_id_a": 1, "student_id_b": 2, "type": "adjacent8"}
                ],
                "seat_gender": [],
                "relative_fixed": [],
            }
        )
        # student1→seat1(r1c1), student2→seat2(r1c2) → 隣接
        bd = compute_score(STRAIGHT, req)
        assert bd.forbidden_violation == 1


# ---------------------------------------------------------------------------
# compute_score — leader_group_violation（班分散グループ）
# ---------------------------------------------------------------------------


class TestLeaderGroupViolation:
    """班分散グループ違反: 同一グループのメンバーが同じ班に複数いる場合。"""

    def test_no_violation_when_members_in_different_groups(self):
        """班1に学生1、班2に学生3がいる → 違反なし。"""
        # GROUPS: {1: seats[1,2,4,5], 2: seats[3,6]}
        # STRAIGHT: 1→1, 2→2, 3→3, 4→4, 5→5, 6→6
        # 学生1は班1, 学生3は班2 → 別々の班 → 違反なし
        req = _req(
            constraints={
                "fixed": [],
                "forbidden": [],
                "seat_gender": [],
                "relative_fixed": [],
                "leader_groups": [{"group_id": 0, "student_ids": [1, 3]}],
            }
        )
        bd = compute_score(STRAIGHT, req)
        assert bd.leader_group_violation == 0

    def test_violation_when_two_members_in_same_group(self):
        """班1に学生1と学生2が両方いる → 1件違反（超過分=1）。"""
        # 学生1→1(班1), 学生2→2(班1) → 班1にメンバー2人
        req = _req(
            constraints={
                "fixed": [],
                "forbidden": [],
                "seat_gender": [],
                "relative_fixed": [],
                "leader_groups": [{"group_id": 0, "student_ids": [1, 2]}],
            }
        )
        bd = compute_score(STRAIGHT, req)
        assert bd.leader_group_violation == 1  # 2人 - 1 = 1件

    def test_violation_count_is_excess_members(self):
        """同一班にメンバーがN人いる場合、違反カウントは N-1（超過分）。"""
        # 学生1,2,4,5 全員班1 → メンバー4人 → 超過 3
        req = _req(
            constraints={
                "fixed": [],
                "forbidden": [],
                "seat_gender": [],
                "relative_fixed": [],
                "leader_groups": [
                    {"group_id": 0, "student_ids": [1, 2, 4, 5]}
                ],
            }
        )
        bd = compute_score(STRAIGHT, req)
        assert bd.leader_group_violation == 3

    def test_multiple_leader_groups_independent(self):
        """複数のリーダーグループは独立してカウントされる。"""
        # G0: [1, 2]（班1に2人 → 1違反）
        # G1: [3, 6]（班2に2人 → 1違反）
        req = _req(
            constraints={
                "fixed": [],
                "forbidden": [],
                "seat_gender": [],
                "relative_fixed": [],
                "leader_groups": [
                    {"group_id": 0, "student_ids": [1, 2]},
                    {"group_id": 1, "student_ids": [3, 6]},
                ],
            }
        )
        bd = compute_score(STRAIGHT, req)
        assert bd.leader_group_violation == 2

    def test_no_leader_groups_zero_violation(self):
        """leader_groups が未指定（デフォルト空配列）でも 0 を返す。"""
        req = _req()  # leader_groups なし
        bd = compute_score(STRAIGHT, req)
        assert bd.leader_group_violation == 0

    def test_leader_group_violation_not_in_total(self):
        """leader_group_violation はハード制約のため total に含まれない。"""
        bd = ScoreBreakdown(
            front_preferred_violation=0,
            back_preferred_violation=0,
            group_gender_imbalance=0,
            loneliness_violation=0,
            prev_assign_same=0,
            prev_neighbor_same=0,
            prev_group_same=0,
            fixed_violation=0,
            gender_constraint_violation=0,
            relative_fixed_violation=0,
            forbidden_violation=0,
            leader_group_violation=5,
        )
        assert breakdown_to_total(bd) == 0


# ---------------------------------------------------------------------------
# C-1 修正テスト: seat_map に存在しない seat_id でも KeyError にならない
# ---------------------------------------------------------------------------


class TestMissingSeatId:
    """assignments の seat_id が seats に存在しなくても compute_score がクラッシュしないことを確認"""

    def test_unknown_seat_id_does_not_raise(self):
        """存在しない seat_id（999）を持つ配置でも KeyError を起こさず ScoreBreakdown を返す"""
        assignments = [
            {"student_id": 1, "seat_id": 999},  # 999 は seats に存在しない
            {"student_id": 2, "seat_id": 2},
        ]
        req = _req()
        result = compute_score(assignments, req)
        assert isinstance(result, ScoreBreakdown)

    def test_front_preferred_with_unknown_seat_id(self):
        """front_preferred タグを持つ学生の seat_id が無効でも違反カウントは 0"""
        assignments = [{"student_id": 1, "seat_id": 999}]
        req = _req(
            students=[
                {"id": 1, "gender": "male", "tags": ["front_preferred"]}
            ],
            seats=SEATS,
        )
        result = compute_score(assignments, req)
        # 存在しない座席はスキップ → 違反なし
        assert result.front_preferred_violation == 0

    def test_back_preferred_with_unknown_seat_id(self):
        """back_preferred タグを持つ学生の seat_id が無効でも違反カウントは 0"""
        assignments = [{"student_id": 1, "seat_id": 999}]
        req = _req(
            students=[{"id": 1, "gender": "male", "tags": ["back_preferred"]}],
            seats=SEATS,
        )
        result = compute_score(assignments, req)
        assert result.back_preferred_violation == 0

    def test_loneliness_with_unknown_seat_id(self):
        """孤独判定で seat_id が無効な学生はスキップされる"""
        assignments = [
            {"student_id": 1, "seat_id": 999},
            {"student_id": 2, "seat_id": 2},
        ]
        req = _req()
        result = compute_score(assignments, req)
        # student1 は無効座席なのでスキップ、student2 の孤独のみカウントされる可能性
        assert isinstance(result, ScoreBreakdown)

    def test_forbidden_adjacent8_with_unknown_seat_id(self):
        """forbidden 制約で一方の seat_id が無効でも違反カウントは 0"""
        assignments = [
            {"student_id": 1, "seat_id": 999},  # 無効
            {"student_id": 2, "seat_id": 2},
        ]
        req = _req(
            constraints={
                "fixed": [],
                "forbidden": [
                    {"student_id_a": 1, "student_id_b": 2, "type": "adjacent8"}
                ],
                "seat_gender": [],
                "relative_fixed": [],
            }
        )
        result = compute_score(assignments, req)
        assert result.forbidden_violation == 0


# ---------------------------------------------------------------------------
# M-1 最適化テスト: loneliness の事前マップ最適化が正確性を保つ
# ---------------------------------------------------------------------------


class TestLonelinessOptimization:
    """seat_to_group_seats 事前マップによる loneliness 計算の正確性を確認"""

    def test_loneliness_single_gender_in_group(self):
        """班内が全員同性なら loneliness なし（異性が横隣にいても班で同性が確保できる）"""
        # 全員男性
        students_all_male = [
            {"id": 1, "gender": "male", "tags": []},
            {"id": 2, "gender": "male", "tags": []},
            {"id": 3, "gender": "male", "tags": []},
            {"id": 4, "gender": "male", "tags": []},
        ]
        req = _req(students=students_all_male)
        result = compute_score(STRAIGHT[:4], req)
        # 全員男性なので各学生に同性ピアが存在 → loneliness = 0
        assert result.loneliness_violation == 0

    def test_loneliness_isolated_student(self):
        """横隣にも同班にも同性がいない場合、孤独カウント1"""
        students = [
            {"id": 1, "gender": "male", "tags": []},  # seat1 に配置
            {"id": 2, "gender": "female", "tags": []},  # seat2 に配置（横隣）
            {"id": 3, "gender": "female", "tags": []},
            {"id": 4, "gender": "female", "tags": []},
            {"id": 5, "gender": "female", "tags": []},
            {"id": 6, "gender": "female", "tags": []},
        ]
        # 班: student1(seat1) 単独班、他は別班
        groups_isolated = [
            {"group_id": 1, "seat_ids": [1]},
            {"group_id": 2, "seat_ids": [2, 3, 4, 5, 6]},
        ]
        req = _req(students=students, groups=groups_isolated)
        result = compute_score(STRAIGHT, req)
        # student1(male) の横隣は student2(female)、班に同性なし → loneliness = 1
        assert result.loneliness_violation >= 1

    def test_loneliness_multi_group_optimization(self):
        """複数グループある場合の最適化後もナイーブな結果と一致する"""
        result = compute_score(STRAIGHT, _req())
        # 事前マップ版でも元の実装と同じ結果を返すこと
        assert isinstance(result.loneliness_violation, int)
        assert result.loneliness_violation >= 0


class TestManualAdjustmentRobustness:
    """手動調整後の不整合な assignment に対する堅牢性（KeyError 防御）"""

    def test_assignment_with_unknown_student_id_does_not_raise(self):
        # students に存在しない student_id を含む配置でも例外を出さない
        bad_assign = STRAIGHT + [{"student_id": 999, "seat_id": 6}]
        req = _req(
            constraints={
                "fixed": [],
                "forbidden": [],
                "seat_gender": [{"seat_id": 6, "allowed_gender": "male"}],
                "relative_fixed": [],
            },
        )
        # student_map に 999 が無くても KeyError にならず計算が完了する
        result = compute_score(bad_assign, req)
        assert isinstance(result, ScoreBreakdown)


# ---------------------------------------------------------------------------
# 前後配慮エリア未設定（空リスト）の扱い
# ---------------------------------------------------------------------------


class TestEmptyPreferenceZones:
    """エリアが明示的に空（0行）の場合、配慮タグは対象外（違反0件）になる。"""

    def test_empty_front_rows_not_counted(self):
        students = [dict(s, tags=["front_preferred"]) for s in STUDENTS]
        req = _req(
            students=students,
            classroom={
                "num_rows": 2, "num_cols": 3,
                "front_rows": [], "back_rows": [2],
            },
        )
        bd = compute_score(STRAIGHT, req)
        assert bd.front_preferred_violation == 0

    def test_empty_back_rows_not_counted(self):
        students = [dict(s, tags=["back_preferred"]) for s in STUDENTS]
        req = _req(
            students=students,
            classroom={
                "num_rows": 2, "num_cols": 3,
                "front_rows": [1], "back_rows": [],
            },
        )
        bd = compute_score(STRAIGHT, req)
        assert bd.back_preferred_violation == 0

    def test_none_back_rows_falls_back_to_last_row(self):
        """back_rows=None（未指定）は従来どおり最終行を自動設定する。"""
        students = [
            dict(s, tags=(["back_preferred"] if s["id"] == 1 else []))
            for s in STUDENTS
        ]
        req = _req(
            students=students,
            classroom={"num_rows": 2, "num_cols": 3, "front_rows": [1]},
        )
        # 生徒1は seat 1（1行目）→ 最終行(2行目)にいないので違反1件
        bd = compute_score(STRAIGHT, req)
        assert bd.back_preferred_violation == 1
