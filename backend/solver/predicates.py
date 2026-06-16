"""
clorm Predicate クラス定義

ASP の述語（predicate）を Python クラスとして表現する。
各クラスのインスタンスが 1 つの ASP ファクトに対応する。

clorm の命名規則:
  デフォルトでクラス名を単純に lowercase にした名前が述語名になる。
  例: Student → student, FrontRow → frontrow（snake_case にはならない）
  複数語の場合は Meta.name で明示的に snake_case 名を指定する。
    FrontRow  → Meta.name = "front_row"
    BackRow   → Meta.name = "back_row"
    PrevAssign → Meta.name = "prev_assign"

フィールド型:
  IntegerField  : ASP の整数（例: 1, 42）
  ConstantField : ASP の定数（例: male, front_preferred）
                  ※ StringField（クォート付き文字列 "foo"）とは異なる
"""

from clorm import Predicate, IntegerField, ConstantField

# ─── 入力述語（FactBase に格納する事実）──────────────────────────────────────


class Student(Predicate):
    """
    児童・生徒。
    述語名: student/2
    例: student(1, male).  student(2, female).
    """

    student_id = IntegerField()
    gender = ConstantField()  # "male" または "female"（ASP 定数）


class Tag(Predicate):
    """
    児童・生徒へのタグ付け。1 人に複数タグ付与可能。
    述語名: tag/2
    例: tag(1, front_preferred).  tag(3, back_preferred).
    """

    student_id = IntegerField()
    tag = ConstantField()  # "front_preferred" / "back_preferred"（ASP 定数）


class Seat(Predicate):
    """
    座席。グリッドのセルを表す。
    述語名: seat/3
    例: seat(1, 1, 1).  seat(5, 2, 1).
         seat_id row col
    """

    seat_id = IntegerField()
    row = IntegerField()
    col = IntegerField()


class FrontRow(Predicate):
    """
    前列として定義された行番号（ユーザーが設定）。
    述語名: front_row/1  ← Meta.name で snake_case を明示
    例: front_row(1).
    """

    class Meta:
        name = "front_row"

    row = IntegerField()


class BackRow(Predicate):
    """
    後列として定義された行番号（ユーザーが設定）。
    述語名: back_row/1  ← Meta.name で snake_case を明示
    未指定の場合はグリッドの最終行をデフォルトとする。
    例: back_row(2).
    """

    class Meta:
        name = "back_row"

    row = IntegerField()


class Group(Predicate):
    """
    班レイアウト定義。どの座席がどの班に属するかを示す。
    述語名: group/2
    例: group(1, 1). group(1, 2). group(1, 5). group(1, 6).
         → 班1は座席 1,2,5,6 で構成される
    """

    group_id = IntegerField()
    seat_id = IntegerField()


class Fixed(Predicate):
    """
    Hard 制約: 座席固定（ピン留め）。
    述語名: fixed/2
    例: fixed(3, 7).  → 児童・生徒 3 は座席 7 に必ず配置
    """

    student_id = IntegerField()
    seat_id = IntegerField()


class Forbidden8(Predicate):
    """
    Hard 制約: 8方向隣接禁止ペア（斜め含む）。
    述語名: forbidden8/2
    例: forbidden8(2, 5).  → 児童・生徒 2 と 5 は8方向隣接させない
    Python レイヤーで student_id_a < student_id_b に正規化して格納。
    """

    student_id_a = IntegerField()
    student_id_b = IntegerField()


class ForbiddenGroup(Predicate):
    """
    Hard 制約: 同班禁止ペア。
    述語名: forbidden_group/2
    例: forbidden_group(2, 5).  → 児童・生徒 2 と 5 は同じ班に入れない
    Python レイヤーで student_id_a < student_id_b に正規化して格納。
    """

    class Meta:
        name = "forbidden_group"

    student_id_a = IntegerField()
    student_id_b = IntegerField()


class PrevAssign(Predicate):
    """
    前回の配置（Soft 制約に使用）。
    述語名: prev_assign/2  ← Meta.name で snake_case を明示
    例: prev_assign(1, 4).  → 前回、児童・生徒 1 は座席 4 にいた
    """

    class Meta:
        name = "prev_assign"

    student_id = IntegerField()
    seat_id = IntegerField()


class SeatGenderConstraint(Predicate):
    """
    Hard 制約: 座席の性別制約。
    述語名: seat_gender_constraint/2  ← Meta.name で snake_case を明示
    例: seat_gender_constraint(7, female). → 座席 7 には女性のみ配置可
    """

    class Meta:
        name = "seat_gender_constraint"

    seat_id = IntegerField()
    allowed_gender = ConstantField()  # "male" または "female"（ASP 定数）


class RelativeFixed(Predicate):
    """
    Hard 制約: 相対的固定制約。
    述語名: relative_fixed/4  ← Meta.name で snake_case を明示
    例: relative_fixed(1, 2, 0, 1). → 児童・生徒1の右隣（同行+1列）に児童・生徒2を配置
    d_row: -1=1行前, 0=同行, +1=1行後
    d_col: -1=1列左, 0=同列, +1=1列右
    """

    class Meta:
        name = "relative_fixed"

    student_id_a = IntegerField()
    student_id_b = IntegerField()
    d_row = IntegerField()
    d_col = IntegerField()


# ─── オプションフラグ述語（ゼロ項、有効時のみファクトとして追加）───────────────


class OptGenderBalance(Predicate):
    """
    ソフト制約トグル: 班内男女バランスを有効にするオプション。
    述語名: opt_gender_balance/0
    """

    class Meta:
        name = "opt_gender_balance"


class OptLoneliness(Predicate):
    """
    ソフト制約トグル: 近隣同性バランスを有効にするオプション。
    述語名: opt_loneliness/0
    """

    class Meta:
        name = "opt_loneliness"


class OptPrevSeatDiffer(Predicate):
    """
    O-1: 前回と異なる座席を強制するオプション。
    述語名: opt_prev_seat_differ/0
    """

    class Meta:
        name = "opt_prev_seat_differ"


class OptPrevNeighborDiffer(Predicate):
    """
    O-2: 前回と左右の隣を変えるオプション。
    述語名: opt_prev_neighbor_differ/0
    """

    class Meta:
        name = "opt_prev_neighbor_differ"


class OptPrevGroupDiffer(Predicate):
    """
    O-3: 前回と異なる班メンバーを強制するオプション。
    述語名: opt_prev_group_differ/0
    """

    class Meta:
        name = "opt_prev_group_differ"


class PrevRowNeighbor(Predicate):
    """
    前回、横隣（同行・列差1）だった児童・生徒ペア（a < b に正規化）。
    述語名: prev_row_neighbor/2
    例: prev_row_neighbor(2, 3).  → 前回、児童・生徒2と3は横隣だった
    """

    class Meta:
        name = "prev_row_neighbor"

    a = IntegerField()
    b = IntegerField()


class PrevGroupMember(Predicate):
    """
    前回の班メンバー情報。
    述語名: prev_group_member/2
    例: prev_group_member(1, 3).  → 前回、班1に児童・生徒3がいた
    """

    class Meta:
        name = "prev_group_member"

    group_id = IntegerField()
    student_id = IntegerField()


class PrevGroupId(Predicate):
    """
    前回の班ID（O-3で使用）。
    述語名: prev_group_id/1
    例: prev_group_id(1).
    """

    class Meta:
        name = "prev_group_id"

    group_id = IntegerField()


class LeaderGroup(Predicate):
    """
    Hard 制約: 班分散グループ。同じグループ内の児童・生徒は同じ班に入れない。
    述語名: leader_group/2  ← Meta.name で snake_case を明示
    例: leader_group(0, 1).  leader_group(0, 2).  → 児童・生徒1と2は同班禁止
    """

    class Meta:
        name = "leader_group"

    group_id = IntegerField()
    student_id = IntegerField()


# ─── 出力述語（clingo が生成する解）─────────────────────────────────────────


class Assign(Predicate):
    """
    座席割り当て結果。clingo のモデルから抽出する。
    述語名: assign/2
    例: assign(1, 5).  → 児童・生徒 1 は座席 5 に配置
    """

    student_id = IntegerField()
    seat_id = IntegerField()
