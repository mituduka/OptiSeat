"""
スコア計算ロジック

座席配置から制約違反数を計算し、合計ペナルティスコアを算出する。
"""

from __future__ import annotations

from typing import Any

from .schemas import ScoreBreakdown

# ソフト制約の重み（スコア計算用）
CONSTRAINT_WEIGHTS: dict[str, int] = {
    "front_preferred_violation": 3,
    "back_preferred_violation": 3,
    "group_gender_imbalance": 2,
    "loneliness_violation": 2,
    "prev_neighbor_same": 1,
    "prev_group_same": 1,
    "prev_assign_same": 1,
}


def compute_score(
    assignments: list[dict[str, int]],
    request_data: dict[str, Any],
) -> ScoreBreakdown:
    """
    座席配置から制約違反数を計算する

    soft.lp の弱制約と対応する違反カウントを返す:
      S-01: front_preferred タグ持ちが前側エリアにいない件数（距離は問わずエリア外の人数を数える）
      S-02: back_preferred タグ持ちが後側エリアにいない件数（距離は問わずエリア外の人数を数える）
      ※ soft.lp は行距離 D の gradual penalty を使うため数値は一致しないが、
        UI 表示は「エリア外かどうか」の判定で十分という設計判断による意図的差異。
      S-03: 班に男性0人または女性0人の件数（各条件を別カウント）
      S-04: 同性ピア（横隣∪同班）が0人の件数
      S-05: 前回と同じ座席に配置された件数

    Args:
        assignments: [{"student_id": 1, "seat_id": 5}, ...] 形式の配置リスト
        request_data: SolveRequest.model_dump() の dict

    Returns:
        ScoreBreakdown（各違反カウントを持つ Pydantic モデル）
    """
    assign_map: dict[int, int] = {
        a["student_id"]: a["seat_id"] for a in assignments
    }
    seat_map = {s["id"]: s for s in request_data["seats"]}
    student_map = {s["id"]: s for s in request_data["students"]}
    seat_to_student: dict[int, int] = {v: k for k, v in assign_map.items()}

    # (row, col) → student_id のマップ（隣接判定を O(1) 化）
    # seat_map に存在しない seat_id は無視する（手動調整後の不整合に対する安全策）
    pos_to_student: dict[tuple[int, int], int] = {
        (seat_map[seat_id]["row"], seat_map[seat_id]["col"]): student_id
        for seat_id, student_id in seat_to_student.items()
        if seat_id in seat_map
    }

    # M-1: 座席→班の事前マップ（loneliness 計算を O(N×G×S) → O(N×S) に削減）
    seat_to_group_seats: dict[int, set[int]] = {}
    for _group in request_data.get("groups", []):
        _seat_set = set(_group["seat_ids"])
        for _gsid in _seat_set:
            seat_to_group_seats[_gsid] = _seat_set

    classroom = request_data.get("classroom", {})
    front_rows = set(classroom.get("front_rows", [1]))
    # back_rows は None（未指定）なら最終行を自動設定、明示的な空リストは
    # 「後側エリアなし」（facts.py と同じ解釈）
    back_rows_raw = classroom.get("back_rows")
    if back_rows_raw is not None:
        back_rows = set(back_rows_raw)
    elif request_data.get("seats"):
        back_rows = {max(s["row"] for s in request_data["seats"])}
    else:
        back_rows = set()

    # S-01: front_preferred violations
    # エリア未設定（front_rows が空）の場合はソルバも最適化しないため対象外（0件）
    front_violations = 0
    if front_rows:
        for s in request_data["students"]:
            if "front_preferred" in s.get("tags", []):
                seat_id = assign_map.get(s["id"])
                seat = seat_map.get(seat_id) if seat_id is not None else None
                if seat is not None and seat["row"] not in front_rows:
                    front_violations += 1

    # S-02: back_preferred violations
    # エリア未設定（back_rows が空）の場合は対象外（S-01 と同じ扱い）
    back_violations = 0
    if back_rows:
        for s in request_data["students"]:
            if "back_preferred" in s.get("tags", []):
                seat_id = assign_map.get(s["id"])
                seat = seat_map.get(seat_id) if seat_id is not None else None
                if seat is not None and seat["row"] not in back_rows:
                    back_violations += 1

    # S-03: group gender imbalance
    # group_id に対して「男性0」または「女性0」それぞれをカウント（soft.lp の2ルールに対応）
    group_imbalance = 0
    for group in request_data.get("groups", []):
        group_seat_ids = set(group["seat_ids"])
        males = sum(
            1
            for s in request_data["students"]
            if assign_map.get(s["id"]) in group_seat_ids
            and s["gender"] == "male"
        )
        females = sum(
            1
            for s in request_data["students"]
            if assign_map.get(s["id"]) in group_seat_ids
            and s["gender"] == "female"
        )
        if males + females > 0:  # 空班は除外
            if males == 0:
                group_imbalance += 1
            if females == 0:
                group_imbalance += 1

    # S-04: loneliness violations
    loneliness = 0
    for s in request_data["students"]:
        sid = s["id"]
        seat_id = assign_map.get(sid)
        if seat_id is None:
            continue
        assigned_seat = seat_map.get(seat_id)
        if assigned_seat is None:
            continue
        gender = s["gender"]

        peers: set[int] = set()
        row, col = assigned_seat["row"], assigned_seat["col"]

        # ① 横隣（pos_to_student で O(1) 参照）
        for dc in (-1, 1):
            neighbor_sid = pos_to_student.get((row, col + dc))
            if neighbor_sid is not None:
                peers.add(neighbor_sid)

        # ② 同班の他メンバー（事前マップで O(1) 参照、M-1 最適化）
        for gseat_id in seat_to_group_seats.get(seat_id, set()):
            other_sid = seat_to_student.get(gseat_id)
            if other_sid is not None and other_sid != sid:
                peers.add(other_sid)

        has_same_gender = any(
            student_map[p]["gender"] == gender
            for p in peers
            if p in student_map
        )
        if not has_same_gender:
            loneliness += 1

    # S-05: prev_assign_same
    prev_same = 0
    prev_map = {
        p["student_id"]: p["seat_id"]
        for p in request_data.get("prev_assign", [])
    }
    for sid, seat_id in assign_map.items():
        if prev_map.get(sid) == seat_id:
            prev_same += 1

    # S-06: prev_neighbor_same（前回横隣が今回も横隣な件数）
    # 前回の (row,col)→student_id マップを構築
    prev_pos_to_sid: dict[tuple[int, int], int] = {}
    for pa in request_data.get("prev_assign", []):
        s = seat_map.get(pa["seat_id"])
        if s:
            prev_pos_to_sid[(s["row"], s["col"])] = pa["student_id"]

    # 前回の隣接ペア集合（右隣のみで重複排除）
    prev_neighbor_pairs: set[frozenset] = set()
    for (r, c), sid in prev_pos_to_sid.items():
        right_sid = prev_pos_to_sid.get((r, c + 1))
        if right_sid is not None:
            prev_neighbor_pairs.add(frozenset([sid, right_sid]))

    # 今回の隣接ペア集合（pos_to_student を再利用）
    cur_neighbor_pairs: set[frozenset] = set()
    for (r, c), sid in pos_to_student.items():
        right_sid = pos_to_student.get((r, c + 1))
        if right_sid is not None:
            cur_neighbor_pairs.add(frozenset([sid, right_sid]))

    prev_neighbor_same = len(prev_neighbor_pairs & cur_neighbor_pairs)

    # S-07: prev_group_same（前回と同班構成の班の件数）
    # prev_map（S-05 で構築済み）を再利用する
    prev_group_same = 0
    for group in request_data.get("groups", []):
        group_seat_set = set(group["seat_ids"])
        prev_members = frozenset(
            sid
            for sid, seat_id in prev_map.items()
            if seat_id in group_seat_set
        )
        cur_members = frozenset(
            seat_to_student[sid_seat]
            for sid_seat in group_seat_set
            if sid_seat in seat_to_student
        )
        if prev_members and prev_members == cur_members:
            prev_group_same += 1

    # 固定制約違反（ハード制約だが手動変更で発生しうる）
    fixed_violations = 0
    for f in request_data.get("constraints", {}).get("fixed", []):
        assigned_seat = assign_map.get(f["student_id"])
        if assigned_seat is not None and assigned_seat != f["seat_id"]:
            fixed_violations += 1

    # 座席性別制約違反（ハード制約だが手動変更で発生しうる）
    gender_violations = 0
    seat_gender_map = {
        sgc["seat_id"]: sgc["allowed_gender"]
        for sgc in request_data.get("constraints", {}).get("seat_gender", [])
    }
    for sid, seat_id in assign_map.items():
        allowed = seat_gender_map.get(seat_id)
        student = student_map.get(sid)
        if allowed and student is not None and student["gender"] != allowed:
            gender_violations += 1

    # 相対的固定制約違反（ハード制約だが手動変更で発生しうる）
    relative_fixed_violations = 0

    def seat_coord(seat_id: int | None) -> tuple[int, int] | None:
        """seat_map から (row, col) を引く。存在しない場合は None。"""
        seat = seat_map.get(seat_id) if seat_id is not None else None
        return (seat["row"], seat["col"]) if seat is not None else None

    coord_to_seat = {
        (s["row"], s["col"]): s["id"] for s in request_data["seats"]
    }
    for rf in request_data.get("constraints", {}).get("relative_fixed", []):
        coord_a = seat_coord(assign_map.get(rf["student_id_a"]))
        if coord_a is None:
            continue
        row_a, col_a = coord_a
        target = (row_a + rf["d_row"], col_a + rf["d_col"])
        target_seat = coord_to_seat.get(target)
        if target_seat is None:
            relative_fixed_violations += 1
        elif assign_map.get(rf["student_id_b"]) != target_seat:
            relative_fixed_violations += 1

    # 隣接禁止違反（ハード制約だが手動変更で発生しうる）
    forbidden_violations = 0
    for fb in request_data.get("constraints", {}).get("forbidden", []):
        sid_a = fb["student_id_a"]
        sid_b = fb["student_id_b"]
        seat_a = assign_map.get(sid_a)
        seat_b = assign_map.get(sid_b)
        if seat_a is None or seat_b is None:
            continue
        fb_type = fb.get("type", "adjacent8")
        if fb_type == "adjacent8":
            coord_a = seat_coord(seat_a)
            coord_b = seat_coord(seat_b)
            if coord_a is None or coord_b is None:
                continue
            row_a, col_a = coord_a
            row_b, col_b = coord_b
            if abs(row_a - row_b) <= 1 and abs(col_a - col_b) <= 1:
                forbidden_violations += 1
        elif fb_type == "same_group":
            for group in request_data.get("groups", []):
                seat_ids = set(group["seat_ids"])
                if seat_a in seat_ids and seat_b in seat_ids:
                    forbidden_violations += 1
                    break

    # 班分散グループ違反（ハード制約だが手動変更で発生しうる）
    #
    # 【数え方の仕様】班分散グループ×班ごとに「同じ班に入った超過人数
    # （メンバー数 − 1）」を合算する。例: 同一グループの3人が同じ班なら 2 件。
    # なお ASP（H-10）はペア単位の integrity constraint、SeatingGrid の
    # セル注釈はペアごとの違反テキスト表示であり、それぞれ目的が異なるため
    # 数え方は揃えない（ソルバ出力では常に 0 件なので実害はない）。
    leader_group_violations = 0
    for lg in request_data.get("constraints", {}).get("leader_groups", []):
        member_seats = [assign_map.get(sid) for sid in lg["student_ids"]]
        for group in request_data.get("groups", []):
            seat_ids = set(group["seat_ids"])
            members_in_group = [
                s for s in member_seats if s is not None and s in seat_ids
            ]
            if len(members_in_group) >= 2:
                leader_group_violations += len(members_in_group) - 1

    return ScoreBreakdown(
        front_preferred_violation=front_violations,
        back_preferred_violation=back_violations,
        group_gender_imbalance=group_imbalance,
        loneliness_violation=loneliness,
        prev_assign_same=prev_same,
        prev_neighbor_same=prev_neighbor_same,
        prev_group_same=prev_group_same,
        fixed_violation=fixed_violations,
        gender_constraint_violation=gender_violations,
        relative_fixed_violation=relative_fixed_violations,
        forbidden_violation=forbidden_violations,
        leader_group_violation=leader_group_violations,
    )


def breakdown_to_total(bd: ScoreBreakdown) -> int:
    """
    ScoreBreakdown から合計ペナルティスコアを計算する

    NOTE: ハード制約違反（fixed_violation, forbidden_violation 等）はソルバ出力では
    発生しないため合計に含めない。手動調整時の UI 表示には ScoreBreakdown の個別フィールドを使用する。
    """
    return sum(
        getattr(bd, key, 0) * weight
        for key, weight in CONSTRAINT_WEIGHTS.items()
    )
