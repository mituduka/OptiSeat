"""
API スキーマ定義（Pydantic v2）

SolveRequest / SolveResponse および制約バリデーション専用スキーマを定義する。
"""

from __future__ import annotations

from enum import Enum
from typing import Literal

from pydantic import BaseModel, Field, model_validator

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
    row: int = Field(..., ge=1)
    col: int = Field(..., ge=1)


class SeatConfig(BaseModel):
    num_rows: int = Field(..., ge=1, le=SEAT_MAX_ROWS)
    num_cols: int = Field(..., ge=1, le=SEAT_MAX_COLS)
    front_rows: list[int] = Field(
        default_factory=lambda: [1],
        description="前列とする行番号リスト（デフォルト: [1]）",
    )
    back_rows: list[int] | None = Field(
        default=None,
        description="後列とする行番号リスト（省略時は最終行を自動設定）",
    )


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
        default=False, description="O-1: 前回と異なる座席を強制"
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
    students: list[StudentInput] = Field(
        ..., min_length=1, max_length=MAX_STUDENTS
    )
    seats: list[SeatInput] = Field(..., min_length=1)
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
    students: list[StudentInput] = Field(
        ..., min_length=1, max_length=MAX_STUDENTS
    )
    seats: list[SeatInput] = Field(..., min_length=1)
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
    students: list[StudentInput] = Field(
        ..., min_length=1, max_length=MAX_STUDENTS
    )
    seats: list[SeatInput] = Field(..., min_length=1)
    constraints: ConstraintConfig = Field(default_factory=ConstraintConfig)


class ValidationWarning(BaseModel):
    code: str
    message: str


class ValidateResponse(BaseModel):
    valid: bool
    warnings: list[ValidationWarning]
