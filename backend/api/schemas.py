"""
API スキーマ定義（Pydantic v2）

SolveRequest / SolveResponse および制約バリデーション専用スキーマを定義する。
"""

from __future__ import annotations

from enum import Enum
from typing import Annotated, Literal

from pydantic import AfterValidator, BaseModel, Field, model_validator

from .config import (
    MAX_STUDENTS,
    SOLVER_TIMEOUT_DEFAULT,
    SOLVER_TIMEOUT_MAX,
    SOLVER_MAX_SOLUTIONS_DEFAULT,
    SOLVER_MAX_SOLUTIONS_MAX,
    SEAT_MAX_ROWS,
    SEAT_MAX_COLS,
)


# ---------------------------------------------------------------------------
# 入力スキーマ（共通部品）
# ---------------------------------------------------------------------------


class Gender(str, Enum):
    male = "male"
    female = "female"


class TagType(str, Enum):
    front_preferred = "front_preferred"
    back_preferred = "back_preferred"


class StudentInput(BaseModel):
    id: int = Field(..., ge=1, description="出席番号（1以上）")
    gender: Gender
    tags: list[TagType] = Field(default_factory=list)


class SeatInput(BaseModel):
    id: int = Field(..., ge=1)
    row: int = Field(..., ge=1, le=SEAT_MAX_ROWS)
    col: int = Field(..., ge=1, le=SEAT_MAX_COLS)


def _validate_unique_students(
    students: list[StudentInput],
) -> list[StudentInput]:
    """児童・生徒IDの重複を拒否する。"""
    seen: set[int] = set()
    for s in students:
        if s.id in seen:
            raise ValueError(f"児童・生徒ID {s.id} が重複しています")
        seen.add(s.id)
    return students


def _validate_unique_seats(seats: list[SeatInput]) -> list[SeatInput]:
    """座席IDと座標 (row, col) の重複を拒否する。"""
    seen_ids: set[int] = set()
    seen_pos: set[tuple[int, int]] = set()
    for seat in seats:
        if seat.id in seen_ids:
            raise ValueError(f"座席ID {seat.id} が重複しています")
        seen_ids.add(seat.id)
        pos = (seat.row, seat.col)
        if pos in seen_pos:
            raise ValueError(
                f"座席の座標（{seat.row}行{seat.col}列）が重複しています"
            )
        seen_pos.add(pos)
    return seats


# SolveRequest / ScoreRequest / ValidateRequest で共通の入力リスト型。
# 要素数上限と重複チェックを一元管理する（不正入力は 422 で弾く防御的検証）
StudentList = Annotated[
    list[StudentInput],
    Field(min_length=1, max_length=MAX_STUDENTS),
    AfterValidator(_validate_unique_students),
]

SeatList = Annotated[
    list[SeatInput],
    Field(min_length=1, max_length=SEAT_MAX_ROWS * SEAT_MAX_COLS),
    AfterValidator(_validate_unique_seats),
]


class SeatConfig(BaseModel):
    num_rows: int = Field(..., ge=1, le=SEAT_MAX_ROWS)
    num_cols: int = Field(..., ge=1, le=SEAT_MAX_COLS)
    front_rows: list[int] = Field(
        default_factory=lambda: [1],
        description="前列とする行番号リスト（デフォルト: [1]）",
    )
    back_rows: list[int] | None = Field(
        default=None,
        description=(
            "後列とする行番号リスト"
            "（省略/null 時は最終行を自動設定、空リストは後側エリアなし）"
        ),
    )

    @model_validator(mode="after")
    def validate_row_zones(self) -> SeatConfig:
        """front_rows / back_rows の行番号が 1〜num_rows に収まり重複しないことを検証する。

        範囲外の行番号はソルバをクラッシュさせないが、存在しない行への距離を
        最小化しようとして最適化が静かに歪むため、入力時点で拒否する。
        """
        for name, rows in (
            ("front_rows", self.front_rows),
            ("back_rows", self.back_rows),
        ):
            if rows is None:
                continue
            if len(rows) != len(set(rows)):
                raise ValueError(f"{name} に重複する行番号があります")
            for row in rows:
                if not 1 <= row <= self.num_rows:
                    raise ValueError(
                        f"{name} の行番号 {row} が範囲外です（1〜{self.num_rows}）"
                    )
        return self


class FixedConstraint(BaseModel):
    student_id: int = Field(..., ge=1)
    seat_id: int = Field(..., ge=1)


class ForbiddenConstraint(BaseModel):
    student_id_a: int = Field(..., ge=1)
    student_id_b: int = Field(..., ge=1)
    type: Literal["adjacent8", "same_group"] = "adjacent8"

    @model_validator(mode="after")
    def validate_different_students(self) -> ForbiddenConstraint:
        if self.student_id_a == self.student_id_b:
            raise ValueError("同じIDは指定できません")
        return self


class SeatGenderConstraint(BaseModel):
    seat_id: int = Field(..., ge=1)
    allowed_gender: Literal["male", "female"]


class RelativeFixedConstraint(BaseModel):
    student_id_a: int = Field(..., ge=1, description="基準となる児童・生徒（中心）")
    student_id_b: int = Field(..., ge=1, description="相対配置する児童・生徒")
    d_row: int = Field(..., ge=-1, le=1, description="行オフセット")
    d_col: int = Field(..., ge=-1, le=1, description="列オフセット")

    @model_validator(mode="after")
    def validate_not_center(self) -> RelativeFixedConstraint:
        if self.student_id_a == self.student_id_b:
            raise ValueError("同じIDは指定できません")
        if self.d_row == 0 and self.d_col == 0:
            raise ValueError("オフセット(0,0)は無効です")
        return self


class LeaderGroupConstraint(BaseModel):
    group_id: int = Field(..., ge=0, description="班分散グループID（0始まり）")
    student_ids: list[int] = Field(
        ..., min_length=2, description="グループに属する児童・生徒IDリスト（2人以上）"
    )


class ConstraintConfig(BaseModel):
    fixed: list[FixedConstraint] = Field(default_factory=list)
    forbidden: list[ForbiddenConstraint] = Field(default_factory=list)
    seat_gender: list[SeatGenderConstraint] = Field(default_factory=list)
    relative_fixed: list[RelativeFixedConstraint] = Field(default_factory=list)
    leader_groups: list[LeaderGroupConstraint] = Field(default_factory=list)


class PrevAssignment(BaseModel):
    student_id: int = Field(..., ge=1)
    seat_id: int = Field(..., ge=1)


class PrevSeatOptions(BaseModel):
    differ_seat: bool = Field(
        default=False, description="S-05: 前回と同じ座席への配置を避ける"
    )
    differ_neighbor: bool = Field(
        default=False, description="O-2: 前回と左右の隣を変える"
    )
    differ_group: bool = Field(
        default=False, description="O-3: 前回と異なる班メンバー"
    )


class SoftToggles(BaseModel):
    gender_balance: bool = Field(
        default=False, description="班内男女バランスの最適化を有効にする"
    )
    loneliness: bool = Field(
        default=False, description="近隣同性バランスの最適化を有効にする"
    )


class SolveOptions(BaseModel):
    max_solutions: int = Field(
        default=SOLVER_MAX_SOLUTIONS_DEFAULT, ge=1, le=SOLVER_MAX_SOLUTIONS_MAX
    )
    timeout: int = Field(
        default=SOLVER_TIMEOUT_DEFAULT,
        ge=1,
        le=SOLVER_TIMEOUT_MAX,
        description="秒",
    )
    prev_options: PrevSeatOptions = Field(default_factory=PrevSeatOptions)
    soft_toggles: SoftToggles = Field(default_factory=SoftToggles)


class GroupLayout(BaseModel):
    group_id: int = Field(..., ge=1, description="班ID（1始まり）")
    seat_ids: list[int] = Field(
        ..., min_length=1, description="班に属する座席IDのリスト"
    )


# ---------------------------------------------------------------------------
# SolveRequest
# ---------------------------------------------------------------------------


class SolveRequest(BaseModel):
    students: StudentList
    seats: SeatList
    classroom: SeatConfig
    groups: list[GroupLayout] = Field(
        default_factory=list, description="班レイアウト定義（省略可）"
    )
    constraints: ConstraintConfig = Field(default_factory=ConstraintConfig)
    prev_assign: list[PrevAssignment] = Field(default_factory=list)
    options: SolveOptions = Field(default_factory=SolveOptions)

    @model_validator(mode="after")
    def validate_student_seat_count(self) -> SolveRequest:
        if len(self.students) > len(self.seats):
            raise ValueError(
                f"児童・生徒数({len(self.students)})が座席数({len(self.seats)})を超えています"
            )
        return self


# ---------------------------------------------------------------------------
# レスポンススキーマ
# ---------------------------------------------------------------------------


class ScoreBreakdown(BaseModel):
    front_preferred_violation: int = 0  # 前側希望が前側にいない件数
    back_preferred_violation: int = 0  # 後側希望が後側にいない件数
    group_gender_imbalance: int = (
        0  # 班内男女偏り件数（no males or no females per group）
    )
    loneliness_violation: int = 0  # 同性ピア（横隣∪同班）が0人の件数
    prev_assign_same: int = 0  # 前回と同席件数
    prev_neighbor_same: int = 0  # S-06: 前回横隣が今回も横隣な件数
    prev_group_same: int = 0  # S-07: 前回と同班構成が一致する班の件数
    fixed_violation: int = 0  # 固定制約違反件数（手動変更で発生しうる）
    gender_constraint_violation: int = (
        0  # 性別制約違反件数（手動変更で発生しうる）
    )
    relative_fixed_violation: int = (
        0  # 隣接固定制約違反件数（手動変更で発生しうる）
    )
    forbidden_violation: int = (
        0  # 隣接禁止制約違反件数（手動変更で発生しうる）
    )
    leader_group_violation: int = (
        0  # 班分散グループ違反件数（手動変更で発生しうる）
    )


class SolutionScore(BaseModel):
    total: int
    breakdown: ScoreBreakdown


class AssignmentResult(BaseModel):
    student_id: int
    seat_id: int


class Solution(BaseModel):
    rank: int
    score: SolutionScore
    assignments: list[AssignmentResult]


class ConflictingConstraint(BaseModel):
    type: str
    description: str


class SolveError(BaseModel):
    code: str
    message: str
    conflicting_constraints: list[ConflictingConstraint] = Field(
        default_factory=list
    )


class SolveStatus(str, Enum):
    ok = "ok"
    unsatisfiable = "unsatisfiable"
    timeout = "timeout"


class SolveResponse(BaseModel):
    status: SolveStatus
    elapsed_ms: int
    solutions: list[Solution]
    error: SolveError | None = None


# ---------------------------------------------------------------------------
# ScoreRequest / ScoreResponse
# ---------------------------------------------------------------------------


class ScoreRequest(BaseModel):
    assignments: list[AssignmentResult] = Field(..., min_length=1)
    students: StudentList
    seats: SeatList
    classroom: SeatConfig
    groups: list[GroupLayout] = Field(default_factory=list)
    constraints: ConstraintConfig = Field(default_factory=ConstraintConfig)
    prev_assign: list[PrevAssignment] = Field(default_factory=list)


class ScoreResponse(BaseModel):
    score: SolutionScore


# ---------------------------------------------------------------------------
# ValidateRequest / ValidateResponse
# ---------------------------------------------------------------------------


class ValidateRequest(BaseModel):
    students: StudentList
    seats: SeatList
    constraints: ConstraintConfig = Field(default_factory=ConstraintConfig)


class ValidationWarning(BaseModel):
    code: str
    message: str


class ValidateResponse(BaseModel):
    valid: bool
    warnings: list[ValidationWarning]
