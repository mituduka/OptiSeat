"""
FactBase 構築ヘルパー

APIリクエストの dict（フラット形式）を clorm FactBase に変換する。
runner.py が API のネスト構造を展開してからこの関数を呼び出す。
"""

from clorm import FactBase

from .predicates import (
    BackRow,
    Fixed,
    Forbidden8,
    ForbiddenGroup,
    FrontRow,
    Group,
    LeaderGroup,
    OptGenderBalance,
    OptLoneliness,
    OptPrevGroupDiffer,
    OptPrevNeighborDiffer,
    OptPrevSeatDiffer,
    PrevAssign,
    PrevGroupId,
    PrevGroupMember,
    PrevRowNeighbor,
    RelativeFixed,
    Seat,
    SeatGenderConstraint,
    Student,
    Tag,
)


def build_factbase(data: dict) -> FactBase:
    """
    フラット dict から clorm FactBase を構築する。

    Args:
        data: {
            "students": [{"id": 1, "gender": "male", "tags": ["front_preferred"]}],
            "seats":    [{"id": 1, "row": 1, "col": 1}],
            "front_rows": [1],       # ユーザー設定（デフォルト: [1]、[] はエリアなし）
            "back_rows":  [2],       # ユーザー設定（None は最終行を自動検出、[] はエリアなし）
            "groups": [{"group_id": 1, "seat_ids": [1, 2, 4, 5]}],
            "fixed":    [{"student_id": 3, "seat_id": 7}],
            "forbidden": [{"student_id_a": 2, "student_id_b": 5}],
            "prev_assign": [{"student_id": 1, "seat_id": 4}],
        }

    Returns:
        FactBase: 全事実を格納した FactBase
    """
    facts: list = []

    # ── 児童・生徒（Student / Tag） ──────────────────────────────────────────────
    for s in data.get("students", []):
        facts.append(Student(student_id=s["id"], gender=s["gender"]))
        for tag_value in s.get("tags", []):
            facts.append(Tag(student_id=s["id"], tag=tag_value))

    # ── 座席（Seat） ──────────────────────────────────────────────────────
    for seat in data.get("seats", []):
        facts.append(
            Seat(seat_id=seat["id"], row=seat["row"], col=seat["col"])
        )

    # ── 前列定義（FrontRow） ──────────────────────────────────────────────
    for row in data.get("front_rows", [1]):
        facts.append(FrontRow(row=row))

    # ── 後列定義（BackRow）───────────────────────────────────────────────
    # None（未指定）はグリッドの最終行を自動検出してデフォルトとして設定する。
    # 明示的な空リストは「後側エリアなし」を意味し、ファクトを追加しない
    # （back_preferred タグは対象外になる。front_rows=[] と同じ扱い）
    back_rows = data.get("back_rows")
    if back_rows is not None:
        for row in back_rows:
            facts.append(BackRow(row=row))
    elif data.get("seats"):
        max_row = max(s["row"] for s in data["seats"])
        facts.append(BackRow(row=max_row))

    # ── 班レイアウト（Group） ─────────────────────────────────────────────
    # 1 座席 = 1 ファクトとして展開する
    # 例: {"group_id": 1, "seat_ids": [1,2,4,5]} → group(1,1), group(1,2), group(1,4), group(1,5)
    for g in data.get("groups", []):
        for seat_id in g["seat_ids"]:
            facts.append(Group(group_id=g["group_id"], seat_id=seat_id))

    # ── Hard 制約: 固定（Fixed） ──────────────────────────────────────────
    for f in data.get("fixed", []):
        facts.append(Fixed(student_id=f["student_id"], seat_id=f["seat_id"]))

    # ── Hard 制約: 隣接禁止（Forbidden / Forbidden8 / ForbiddenGroup） ────────
    # student_id_a < student_id_b になるよう正規化
    for fb in data.get("forbidden", []):
        a, b = sorted([fb["student_id_a"], fb["student_id_b"]])
        t = fb.get("type", "adjacent8")
        if t == "same_group":
            facts.append(ForbiddenGroup(student_id_a=a, student_id_b=b))
        else:  # adjacent8 (デフォルト)
            facts.append(Forbidden8(student_id_a=a, student_id_b=b))

    # ── 前回配置（PrevAssign） ─────────────────────────────────────────────
    for pa in data.get("prev_assign", []):
        facts.append(
            PrevAssign(student_id=pa["student_id"], seat_id=pa["seat_id"])
        )

    # ── Hard 制約: 座席性別制約（SeatGenderConstraint） ────────────────────
    for sgc in data.get("seat_gender", []):
        facts.append(
            SeatGenderConstraint(
                seat_id=sgc["seat_id"],
                allowed_gender=sgc["allowed_gender"],
            )
        )

    # ── Hard 制約: 相対的固定制約（RelativeFixed） ────────────────────────
    for rf in data.get("relative_fixed", []):
        facts.append(
            RelativeFixed(
                student_id_a=rf["student_id_a"],
                student_id_b=rf["student_id_b"],
                d_row=rf["d_row"],
                d_col=rf["d_col"],
            )
        )

    # ── Hard 制約: 班分散グループ（LeaderGroup） ──────────────────────────
    for lg in data.get("leader_groups", []):
        for sid in lg["student_ids"]:
            facts.append(LeaderGroup(group_id=lg["group_id"], student_id=sid))

    # ── ソフト制約トグル（デフォルト False、UI 既定と一致）───────────────────
    soft_toggles = data.get("soft_toggles", {}) or {}
    if soft_toggles.get("gender_balance", False):
        facts.append(OptGenderBalance())
    if soft_toggles.get("loneliness", False):
        facts.append(OptLoneliness())

    # ── オプション: 前回座席差分強制 ──────────────────────────────────────────
    prev_options = data.get("prev_options", {}) or {}

    prev_assign_list = data.get("prev_assign", [])
    prev_assign_map: dict[int, int] = {
        pa["student_id"]: pa["seat_id"] for pa in prev_assign_list
    }
    seat_map: dict[int, dict] = {s["id"]: s for s in data.get("seats", [])}

    # S-05: 前回と異なる座席（有効時のみ opt ファクトを追加して弱制約を活性化）
    if prev_options.get("differ_seat"):
        facts.append(OptPrevSeatDiffer())

    # O-2: 前回と左右の隣を変える
    if prev_options.get("differ_neighbor"):
        facts.append(OptPrevNeighborDiffer())
        # 前回、横隣（同行・列差1）だったペアを計算して prev_row_neighbor ファクトを生成
        prev_entries = list(
            prev_assign_map.items()
        )  # [(student_id, seat_id), ...]
        for i, (s1, seat1) in enumerate(prev_entries):
            for s2, seat2 in prev_entries[i + 1 :]:
                sd1 = seat_map.get(seat1)
                sd2 = seat_map.get(seat2)
                if sd1 and sd2:
                    if (
                        sd1["row"] == sd2["row"]
                        and abs(sd1["col"] - sd2["col"]) == 1
                    ):
                        a, b = sorted([s1, s2])
                        facts.append(PrevRowNeighbor(a=a, b=b))

    # O-3: 前回と異なる班メンバーを強制
    if prev_options.get("differ_group"):
        facts.append(OptPrevGroupDiffer())
        # 前回の配置と現在の班レイアウトから prev_group_member/prev_group_id を生成
        for g in data.get("groups", []):
            gid = g["group_id"]
            group_seat_set = set(g["seat_ids"])
            members = [
                sid
                for sid, seat_id in prev_assign_map.items()
                if seat_id in group_seat_set
            ]
            if members:
                facts.append(PrevGroupId(group_id=gid))
                for sid in members:
                    facts.append(PrevGroupMember(group_id=gid, student_id=sid))

    return FactBase(facts)
