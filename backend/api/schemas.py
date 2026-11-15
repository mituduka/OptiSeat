"""
API スキーマ定義（Pydantic v2）

SolveRequest / SolveResponse および制約バリデーション専用スキーマを定義する。
"""

from __future__ import annotations

from enum import Enum
from typing import Annotated, Literal, get_args

from pydantic import AfterValidator, BaseModel, Field, model_validator

from .config import (
    MAX_STUDENTS,
    SEAT_MAX_COLS,
    SEAT_MAX_ROWS,
    SOLVER_MAX_SOLUTIONS_DEFAULT,
    SOLVER_MAX_SOLUTIONS_MAX,
    SOLVER_TIMEOUT_DEFAULT,
    SOLVER_TIMEOUT_MAX,
)

# ---------------------------------------------------------------------------
# 入力サイズ上限
# ---------------------------------------------------------------------------
#
# すべて config.py の MAX_STUDENTS / SEAT_MAX_ROWS / SEAT_MAX_COLS から導出する。
# 巨大な入力 1 件でスコア計算・ファクト生成・grounding（いずれもソルバの
# タイムアウト対象外）が CPU を長時間占有するのを防ぐ。値は frontend が正当な
# 利用で送りうる最大件数以上になるよう決めている（根拠は各定数のコメント）。

# 教室の最大座席数。frontend の座席 ID は行優先の連番
# （(row-1)*numCols+col、lib/seats.ts の generateSeats / coordsToSeatId）なので
# 座席 ID の上限も兼ねる。
MAX_SEATS: int = SEAT_MAX_ROWS * SEAT_MAX_COLS

# 児童・生徒 ID の上限。frontend は新規追加時に「既存 ID の最大値 + 1」を振り、
# 削除しても ID を詰めない（さらに名簿は localStorage に永続化される）ため、
# ID は MAX_STUDENTS を超えて増え続けうる。インポートでも任意の数値を受け付ける。
# したがって件数由来の上限は付けられず、ASP ファクトとして clingo に渡せる
# 32bit 符号付き整数の上限を値域とする（これを超えると clingo.Number が
# OverflowError を送出する）。
STUDENT_ID_MAX: int = 2**31 - 1

ForbiddenType = Literal["adjacent8", "same_group"]

# forbidden の最大件数。frontend（lib/store.ts の addForbidden）は
# (studentIdA, studentIdB, type) の順序付きの組で重複排除するため、
# (1,2) と (2,1) が共存でき、type も 2 種類ある。
# よって最大 N(N-1) × type 数（N=MAX_STUDENTS）。
MAX_FORBIDDEN: int = (
    MAX_STUDENTS * (MAX_STUDENTS - 1) * len(get_args(ForbiddenType))
)

# relative_fixed のオフセットは各軸 -1〜1。中心 (0,0) を除いた 3×3−1 = 8 方向。
RELATIVE_OFFSET_MAX: int = 1
RELATIVE_OFFSETS_PER_STUDENT: int = (2 * RELATIVE_OFFSET_MAX + 1) ** 2 - 1

# relative_fixed の最大件数。frontend（setRelativeFixed）は基準の児童・生徒 A
# ごとに制約を丸ごと置き換え、A 1 人あたりオフセット 1 方向に 1 件しか持てない。
MAX_RELATIVE_FIXED: int = MAX_STUDENTS * RELATIVE_OFFSETS_PER_STUDENT

# leader_groups（班分散グループ）の最大件数。frontend の addLeaderGroup は
# 件数に上限を設けておらず、同じ児童・生徒が複数グループに属することもできる
# ため、UI 上の厳密な最大値は存在しない。実運用で児童・生徒数を超える数の
# グループを作る場面は考えにくいので MAX_STUDENTS とする。
# （H-10 の grounding はグループ数 × メンバー対の数 × 班数 に比例する）
MAX_LEADER_GROUPS: int = MAX_STUDENTS

StudentId = Annotated[int, Field(ge=1, le=STUDENT_ID_MAX)]
SeatId = Annotated[int, Field(ge=1, le=MAX_SEATS)]


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
    id: StudentId = Field(..., description="出席番号（1以上）")
    gender: Gender
    # frontend はタグをトグルで付け外しするため重複しない（最大でタグの種類数）
    tags: list[TagType] = Field(default_factory=list, max_length=len(TagType))


class SeatInput(BaseModel):
    id: SeatId
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
    Field(min_length=1, max_length=MAX_SEATS),
    AfterValidator(_validate_unique_seats),
]


class SeatConfig(BaseModel):
    num_rows: int = Field(..., ge=1, le=SEAT_MAX_ROWS)
    num_cols: int = Field(..., ge=1, le=SEAT_MAX_COLS)
    # front_rows / back_rows は validate_row_zones で重複なし・1〜num_rows に
    # 収まることを検証するため、正当な入力は最大で SEAT_MAX_ROWS 件
    front_rows: list[int] = Field(
        default_factory=lambda: [1],
        max_length=SEAT_MAX_ROWS,
        description="前列とする行番号リスト（デフォルト: [1]）",
    )
    back_rows: list[int] | None = Field(
        default=None,
        max_length=SEAT_MAX_ROWS,
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
    student_id: StudentId
    seat_id: SeatId


class ForbiddenConstraint(BaseModel):
    student_id_a: StudentId
    student_id_b: StudentId
    type: ForbiddenType = "adjacent8"

    @model_validator(mode="after")
    def validate_different_students(self) -> ForbiddenConstraint:
        if self.student_id_a == self.student_id_b:
            raise ValueError("同じIDは指定できません")
        return self


class SeatGenderConstraint(BaseModel):
    seat_id: SeatId
    allowed_gender: Literal["male", "female"]


class RelativeFixedConstraint(BaseModel):
    student_id_a: StudentId = Field(..., description="基準となる児童・生徒（中心）")
    student_id_b: StudentId = Field(..., description="相対配置する児童・生徒")
    d_row: int = Field(
        ...,
        ge=-RELATIVE_OFFSET_MAX,
        le=RELATIVE_OFFSET_MAX,
        description="行オフセット",
    )
    d_col: int = Field(
        ...,
        ge=-RELATIVE_OFFSET_MAX,
        le=RELATIVE_OFFSET_MAX,
        description="列オフセット",
    )

    @model_validator(mode="after")
    def validate_not_center(self) -> RelativeFixedConstraint:
        if self.student_id_a == self.student_id_b:
            raise ValueError("同じIDは指定できません")
        if self.d_row == 0 and self.d_col == 0:
            raise ValueError("オフセット(0,0)は無効です")
        return self


class LeaderGroupConstraint(BaseModel):
    # frontend（leaderGroupsToApi）は配列の添字を group_id として送る
    group_id: int = Field(
        ...,
        ge=0,
        le=MAX_LEADER_GROUPS - 1,
        description="班分散グループID（0始まり）",
    )
    # frontend はチェックボックスで選ぶため重複せず、名簿の人数以下
    student_ids: list[StudentId] = Field(
        ...,
        min_length=2,
        max_length=MAX_STUDENTS,
        description="グループに属する児童・生徒IDリスト（2人以上）",
    )


class ConstraintConfig(BaseModel):
    # fixed: frontend の addFixed は児童・生徒ごとに 1 件へ置き換える → 最大 N 件
    fixed: list[FixedConstraint] = Field(
        default_factory=list, max_length=MAX_STUDENTS
    )
    forbidden: list[ForbiddenConstraint] = Field(
        default_factory=list, max_length=MAX_FORBIDDEN
    )
    # seat_gender: frontend の addSeatGender は座席ごとに 1 件へ置き換える
    seat_gender: list[SeatGenderConstraint] = Field(
        default_factory=list, max_length=MAX_SEATS
    )
    relative_fixed: list[RelativeFixedConstraint] = Field(
        default_factory=list, max_length=MAX_RELATIVE_FIXED
    )
    leader_groups: list[LeaderGroupConstraint] = Field(
        default_factory=list, max_length=MAX_LEADER_GROUPS
    )


class PrevAssignment(BaseModel):
    student_id: StudentId
    seat_id: SeatId


# prev_assign の最大件数。frontend の前回席入力は座席ごとに 1 件で、
# 他の座席に割り当て済みの児童・生徒は選択肢から除外される（1 人 1 件）。
# インポート時も、エクスポートされた確定配置（児童・生徒数以下）を読み込む。
PrevAssignList = Annotated[
    list[PrevAssignment], Field(max_length=MAX_STUDENTS)
]


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
    # 各班は 1 席以上を持つため、班の数・班 ID とも座席数以下
    # （frontend の班数ステッパーは 1〜10 だが、その値は backend の設定ではない）
    group_id: int = Field(..., ge=1, le=MAX_SEATS, description="班ID（1始まり）")
    # frontend は座席を班に追加するとき他の班から外し、グリッド外の座席を
    # 除いて送るため、1 班の座席数は教室の座席数以下
    seat_ids: list[SeatId] = Field(
        ...,
        min_length=1,
        max_length=MAX_SEATS,
        description="班に属する座席IDのリスト",
    )


GroupList = Annotated[list[GroupLayout], Field(max_length=MAX_SEATS)]


# ---------------------------------------------------------------------------
# SolveRequest
# ---------------------------------------------------------------------------


class SolveRequest(BaseModel):
    students: StudentList
    seats: SeatList
    classroom: SeatConfig
    groups: GroupList = Field(
        default_factory=list, description="班レイアウト定義（省略可）"
    )
    constraints: ConstraintConfig = Field(default_factory=ConstraintConfig)
    prev_assign: PrevAssignList = Field(default_factory=list)
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


class AssignmentInput(BaseModel):
    """ScoreRequest の配置 1 件（レスポンス用の AssignmentResult とは分ける）。"""

    student_id: StudentId
    seat_id: SeatId


class ScoreRequest(BaseModel):
    # frontend はソルバ解（児童・生徒 1 人 1 件）を席交換するだけなので
    # 件数は児童・生徒数以下
    assignments: list[AssignmentInput] = Field(
        ..., min_length=1, max_length=MAX_STUDENTS
    )
    students: StudentList
    seats: SeatList
    classroom: SeatConfig
    groups: GroupList = Field(default_factory=list)
    constraints: ConstraintConfig = Field(default_factory=ConstraintConfig)
    prev_assign: PrevAssignList = Field(default_factory=list)


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
