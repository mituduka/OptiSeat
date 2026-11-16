import { coordsToSeatId } from '@/lib/seats'
import type { Group, PrevAssignment } from '@/types'

/**
 * 前回と同じメンバー構成になっている今回の班の ID を返す（S-07 前回同班）。
 *
 * backend の soft.lp（same_group_composition）と score.py の prev_group_same と同じ定義:
 * - 前回の班 = 現在の班レイアウトの各班の座席に前回座っていた生徒の集合。空の前回班は対象外。
 * - 今回の班のメンバー集合が前回のいずれかの班のメンバー集合と一致すれば違反。
 *   座席の位置は問わないため、班を丸ごと入れ替えた配置も違反になる。
 *
 * @param groups 現在の班レイアウト
 * @param prevAssign 前回の配置（座標ベース）
 * @param seatToStudentId 今回の配置（seat_id → student_id）
 * @param numCols 列数（座標 → seat_id 変換用）
 */
export function findPrevGroupSameIds(
  groups: Group[],
  prevAssign: PrevAssignment[],
  seatToStudentId: ReadonlyMap<number, number>,
  numCols: number,
): Set<number> {
  const result = new Set<number>()
  if (prevAssign.length === 0) return result

  const prevSeatToStudentId = new Map<number, number>()
  for (const p of prevAssign) prevSeatToStudentId.set(coordsToSeatId(p.row, p.col, numCols), p.student_id)

  const prevKeys = new Set<string>()
  const curKeys: { groupId: number; key: string }[] = []
  for (const group of groups) {
    const prevMembers: number[] = []
    const curMembers: number[] = []
    for (const { row, col } of group.seatCoords) {
      const seatId = coordsToSeatId(row, col, numCols)
      const prev = prevSeatToStudentId.get(seatId)
      if (prev !== undefined) prevMembers.push(prev)
      const cur = seatToStudentId.get(seatId)
      if (cur !== undefined) curMembers.push(cur)
    }
    if (prevMembers.length > 0) prevKeys.add(membersKey(prevMembers))
    curKeys.push({ groupId: group.groupId, key: membersKey(curMembers) })
  }

  for (const { groupId, key } of curKeys) {
    if (prevKeys.has(key)) result.add(groupId)
  }
  return result
}

/** メンバー集合の比較キー（重複除去・昇順） */
function membersKey(ids: number[]): string {
  return [...new Set(ids)].sort((a, b) => a - b).join(',')
}
