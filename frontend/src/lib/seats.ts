import type { SeatInput, Group, GroupLayout, PrevAssignment, SeatGenderConstraint, FixedConstraint, ScoreBreakdown, ConstraintMeta, ConstraintToggles, LeaderGroup } from '@/types'

/**
 * 制約トグルと制約キーのマッピング（OFF の時に "無効" 扱い）
 */
export const CONSTRAINT_TOGGLE_DEPS: Partial<Record<string, keyof ConstraintToggles>> = {
  group_gender_imbalance: 'gender_balance',
  loneliness_violation: 'loneliness',
  prev_assign_same: 'differ_seat',
  prev_neighbor_same: 'differ_neighbor',
  prev_group_same: 'differ_group',
}

/**
 * 各優先度レベルの違反件数を集計する（無効項目は除外）。
 * 返り値: レベル降順のエントリ配列 [{level, count}, ...]
 */
export function violationsByLevel(
  breakdown: ScoreBreakdown,
  meta: ConstraintMeta[],
  toggles?: ConstraintToggles,
): { level: number; count: number }[] {
  const levelMap = new Map<number, number>()
  for (const m of meta) {
    if (m.priorityLevel === null) continue // ハード制約除外
    const dep = CONSTRAINT_TOGGLE_DEPS[m.key]
    if (dep && toggles && !toggles[dep]) continue
    const count = breakdown[m.key as keyof ScoreBreakdown] ?? 0
    levelMap.set(m.priorityLevel, (levelMap.get(m.priorityLevel) ?? 0) + count)
  }
  return [...levelMap.entries()]
    .map(([level, count]) => ({ level, count }))
    .sort((a, b) => b.level - a.level)
}

/**
 * ソフト制約とハード制約の違反件数を合算する。
 */
export function totalViolationCount(
  breakdown: ScoreBreakdown,
  meta: ConstraintMeta[],
  toggles?: ConstraintToggles,
): number {
  const softTotal = violationsByLevel(breakdown, meta, toggles)
    .reduce((sum, e) => sum + e.count, 0)
  const hardTotal = meta
    .filter((m) => m.priorityLevel === null)
    .reduce((sum, m) => sum + (breakdown[m.key as keyof ScoreBreakdown] ?? 0), 0)
  return softTotal + hardTotal
}

/**
 * 最高違反レベルとその件数を返す（バッジ表示用）。
 * 違反なしの場合は null。
 */
export function getHighestViolation(
  breakdown: ScoreBreakdown,
  meta: ConstraintMeta[],
  toggles?: ConstraintToggles,
): { level: number; count: number } | null {
  const levels = violationsByLevel(breakdown, meta, toggles)
  for (const entry of levels) {
    if (entry.count > 0) return entry
  }
  return null
}

/**
 * 辞書式比較（clingo と同じ順序）。
 * 高いレベルの違反件数を優先的に比較し、少ない方を良い解とする。
 * 戻り値: a < b → 負、a > b → 正、同じ → 0
 */
export function compareSolutionsLex(
  a: ScoreBreakdown,
  b: ScoreBreakdown,
  meta: ConstraintMeta[],
  toggles?: ConstraintToggles,
): number {
  const aLevels = violationsByLevel(a, meta, toggles)
  const bLevels = violationsByLevel(b, meta, toggles)
  const aMap = new Map(aLevels.map((e) => [e.level, e.count]))
  const bMap = new Map(bLevels.map((e) => [e.level, e.count]))
  const allLevels = [...new Set([...aMap.keys(), ...bMap.keys()])].sort((x, y) => y - x)
  for (const level of allLevels) {
    const diff = (aMap.get(level) ?? 0) - (bMap.get(level) ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

/**
 * numRows × numCols の座席一覧を生成する。
 * 行優先（左上から右へ、次の行へ）で連番 id を振る。
 * row: 前=1, col: 左=1
 */
export function generateSeats(numRows: number, numCols: number): SeatInput[] {
  const seats: SeatInput[] = []
  let id = 1
  for (let row = 1; row <= numRows; row++) {
    for (let col = 1; col <= numCols; col++) {
      seats.push({ id, row, col })
      id++
    }
  }
  return seats
}

/** seat_id から (row, col) を逆引きする */
export function seatIdToPosition(
  seatId: number,
  numCols: number,
): { row: number; col: number } {
  const row = Math.ceil(seatId / numCols)
  const col = ((seatId - 1) % numCols) + 1
  return { row, col }
}

/** (row, col) から seat_id を計算する */
export function coordsToSeatId(row: number, col: number, numCols: number): number {
  return (row - 1) * numCols + col
}

/**
 * prevAssign（row/col形式）→ API用 {student_id, seat_id}[]
 */
export function prevAssignToApi(
  prevAssign: PrevAssignment[],
  numCols: number,
): { student_id: number; seat_id: number }[] {
  return prevAssign.map((pa) => ({
    student_id: pa.student_id,
    seat_id: coordsToSeatId(pa.row, pa.col, numCols),
  }))
}

/**
 * fixedConstraints（row/col形式）→ API用 {student_id, seat_id}[]
 */
export function fixedToApi(
  constraints: FixedConstraint[],
  numCols: number,
): { student_id: number; seat_id: number }[] {
  return constraints.map((f) => ({
    student_id: f.studentId,
    seat_id: coordsToSeatId(f.row, f.col, numCols),
  }))
}

/**
 * seatGenderConstraints（row/col形式）→ API用 {seat_id, allowed_gender}[]
 */
export function seatGenderToApi(
  constraints: SeatGenderConstraint[],
  numCols: number,
): { seat_id: number; allowed_gender: 'male' | 'female' }[] {
  return constraints.map((c) => ({
    seat_id: coordsToSeatId(c.row, c.col, numCols),
    allowed_gender: c.allowedGender,
  }))
}

/**
 * LeaderGroup[] を API 送信用 {group_id, student_ids}[] に変換する。
 */
export function leaderGroupsToApi(
  leaderGroups: LeaderGroup[],
): { group_id: number; student_ids: number[] }[] {
  return leaderGroups.map((lg, index) => ({
    group_id: index,
    student_ids: lg.studentIds,
  }))
}

/**
 * Group[] を API 送信用 GroupLayout[] に変換する。
 * - numGroups で表示範囲を制限（非アクティブな班は除外）
 * - 範囲外の座標を除外（列数・行数変更対応）
 * - 有効な座席が存在しない班は除外
 */
export function groupsToApi(
  groups: Group[],
  numGroups: number,
  numRows: number,
  numCols: number,
): GroupLayout[] {
  return groups
    .filter((g) => g.groupId <= numGroups)
    .map((g) => ({
      group_id: g.groupId,
      seat_ids: g.seatCoords
        .filter((c) => c.row >= 1 && c.row <= numRows && c.col >= 1 && c.col <= numCols)
        .map((c) => coordsToSeatId(c.row, c.col, numCols)),
    }))
    .filter((g) => g.seat_ids.length > 0)
}
