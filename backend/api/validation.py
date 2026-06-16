"""
制約整合性チェックロジック

ソルバを実行せずに制約の整合性を検証し、ValidationWarning のリストを返す。
"""

from __future__ import annotations

from .schemas import ValidateRequest, ValidationWarning


def run_validation(request: ValidateRequest) -> list[ValidationWarning]:
    """
    制約の整合性チェック（ソルバ実行なし）

    チェック内容:
      - fixed/forbidden の student_id が students に存在するか
      - fixed の seat_id が seats に存在するか
      - fixed で同じ座席に複数人が固定されていないか
      - seat_gender と fixed の矛盾
      - relative_fixed の student_id が students に存在するか
      - relative_fixed と forbidden8 の矛盾
    """
    warnings: list[ValidationWarning] = []
    student_ids = {s.id for s in request.students}
    seat_ids = {s.id for s in request.seats}
    seat_pos = {s.id: (s.row, s.col) for s in request.seats}

    def seat_label(seat_id: int) -> str:
        if seat_id in seat_pos:
            r, c = seat_pos[seat_id]
            return f"{r}行{c}列"
        return f"座席{seat_id}"

    # fixed 制約のチェック
    fixed_seat_usage: dict[int, list[int]] = {}  # seat_id → [student_id, ...]
    for f in request.constraints.fixed:
        if f.student_id not in student_ids:
            warnings.append(
                ValidationWarning(
                    code="UNKNOWN_STUDENT_ID",
                    message=f"固定制約: ID:{f.student_id} は名簿に存在しません。",
                )
            )
        if f.seat_id not in seat_ids:
            warnings.append(
                ValidationWarning(
                    code="UNKNOWN_SEAT_ID",
                    message=f"固定制約: {seat_label(f.seat_id)} は存在しません。",
                )
            )
        fixed_seat_usage.setdefault(f.seat_id, []).append(f.student_id)

    # 同一座席への複数固定チェック
    for seat_id, sids in fixed_seat_usage.items():
        if len(sids) > 1:
            warnings.append(
                ValidationWarning(
                    code="FIXED_SEAT_CONFLICT",
                    message=(
                        f"{seat_label(seat_id)} に複数人が固定されています: "
                        f"{'、'.join(f'ID:{s}' for s in sids)}"
                    ),
                )
            )

    # forbidden 制約のチェック
    for fb in request.constraints.forbidden:
        if fb.student_id_a not in student_ids:
            warnings.append(
                ValidationWarning(
                    code="UNKNOWN_STUDENT_ID",
                    message=f"隣接禁止制約: ID:{fb.student_id_a} は名簿に存在しません。",
                )
            )
        if fb.student_id_b not in student_ids:
            warnings.append(
                ValidationWarning(
                    code="UNKNOWN_STUDENT_ID",
                    message=f"隣接禁止制約: ID:{fb.student_id_b} は名簿に存在しません。",
                )
            )

    # seat_gender 制約のチェック
    fixed_map = {f.seat_id: f.student_id for f in request.constraints.fixed}
    student_gender_map = {s.id: s.gender for s in request.students}
    for sgc in request.constraints.seat_gender:
        if sgc.seat_id not in seat_ids:
            warnings.append(
                ValidationWarning(
                    code="UNKNOWN_SEAT_ID",
                    message=f"性別制約: {seat_label(sgc.seat_id)} は存在しません。",
                )
            )
        # 固定制約との矛盾チェック
        fixed_sid = fixed_map.get(sgc.seat_id)
        if fixed_sid is not None:
            student_gender = student_gender_map.get(fixed_sid)
            if (
                student_gender is not None
                and student_gender != sgc.allowed_gender
            ):
                warnings.append(
                    ValidationWarning(
                        code="GENDER_FIXED_CONFLICT",
                        message=(
                            f"{seat_label(sgc.seat_id)} に固定されたID:{fixed_sid} の性別が"
                            f"性別制約（{'男性' if sgc.allowed_gender == 'male' else '女性'}のみ）と矛盾します。"
                        ),
                    )
                )

    # relative_fixed 制約のチェック
    for rf in request.constraints.relative_fixed:
        if rf.student_id_a not in student_ids:
            warnings.append(
                ValidationWarning(
                    code="UNKNOWN_STUDENT_ID",
                    message=f"隣接固定制約: ID:{rf.student_id_a} は名簿に存在しません。",
                )
            )
        if rf.student_id_b not in student_ids:
            warnings.append(
                ValidationWarning(
                    code="UNKNOWN_STUDENT_ID",
                    message=f"隣接固定制約: ID:{rf.student_id_b} は名簿に存在しません。",
                )
            )

    # leader_groups 制約のチェック
    for lg in request.constraints.leader_groups:
        for sid in lg.student_ids:
            if sid not in student_ids:
                warnings.append(
                    ValidationWarning(
                        code="UNKNOWN_STUDENT_ID",
                        message=f"班分散グループ(ID:{lg.group_id}): ID:{sid} は名簿に存在しません。",
                    )
                )

    # relative_fixed と forbidden8 の矛盾チェック
    # relative_fixed は常に隣接配置を要求するため forbidden8 と同一ペアに共存できない
    normalized_forbidden8: set[tuple[int, int]] = {
        (
            min(fb.student_id_a, fb.student_id_b),
            max(fb.student_id_a, fb.student_id_b),
        )
        for fb in request.constraints.forbidden
        if fb.type == "adjacent8"
    }
    seen_rf_conflicts: set[tuple[int, int]] = set()
    for rf in request.constraints.relative_fixed:
        pair = (
            min(rf.student_id_a, rf.student_id_b),
            max(rf.student_id_a, rf.student_id_b),
        )
        if pair in normalized_forbidden8 and pair not in seen_rf_conflicts:
            seen_rf_conflicts.add(pair)
            warnings.append(
                ValidationWarning(
                    code="RELATIVE_FIXED_FORBIDDEN_CONFLICT",
                    message=(
                        f"隣接固定と隣接禁止（8方向）が矛盾しています: "
                        f"ID:{rf.student_id_a} と ID:{rf.student_id_b}"
                    ),
                )
            )

    return warnings
