import type { ForbiddenConstraint, FixedConstraint, SeatGenderConstraint, RelativeFixedConstraint, Student, Group } from '@/types'

// --- 型 ---

export interface GenderFixedConflict {
  row: number
  col: number
  studentName: string
  studentGender: 'male' | 'female'
  allowedGender: 'male' | 'female'
}

export interface RfFbConflict {
  studentIdA: number  // min(a, b)
  studentIdB: number  // max(a, b)
}

export interface FixedSeatConflict {
  row: number
  col: number
  studentIds: number[]  // 同一座席に固定されたIDリスト
}

export interface FixedForbiddenConflict {
  studentIdA: number
  studentIdB: number
  rowA: number
  colA: number
  rowB: number
  colB: number
}

export interface FixedRelativeConflict {
  studentIdA: number  // 基準
  studentIdB: number
  rowA: number
  colA: number  // 実際のA位置
  rowB: number
  colB: number  // 実際のB位置
  dRow: number
  dCol: number  // 要求されていた相対オフセット
}

// --- 検出関数 ---

/**
 * 性別配置制約と座席固定の矛盾を返す。
 */
export function detectGenderFixedConflicts(
  seatGenderConstraints: SeatGenderConstraint[],
  fixedConstraints: FixedConstraint[],
  students: Student[],
): GenderFixedConflict[] {
  return seatGenderConstraints.flatMap((sgc) => {
    const fixed = fixedConstraints.find((f) => f.row === sgc.row && f.col === sgc.col)
    if (!fixed) return []
    const student = students.find((s) => s.id === fixed.studentId)
    if (!student || student.gender === sgc.allowedGender) return []
    return [{
      row: sgc.row,
      col: sgc.col,
      studentName: student.name,
      studentGender: student.gender,
      allowedGender: sgc.allowedGender,
    }]
  })
}

/**
 * 隣接固定と隣接禁止（adjacent8）が矛盾するペアを返す。
 * 重複排除済み、ペアは正規化（小さいID が A）。
 */
export function detectRelativeFixedForbiddenConflicts(
  forbidden: ForbiddenConstraint[],
  relativeFixed: RelativeFixedConstraint[]
): RfFbConflict[] {
  const adjacent8Set = new Set(
    forbidden
      .filter((fb) => fb.type === 'adjacent8')
      .map((fb) => `${Math.min(fb.studentIdA, fb.studentIdB)}-${Math.max(fb.studentIdA, fb.studentIdB)}`)
  )

  const seen = new Set<string>()
  const conflicts: RfFbConflict[] = []

  for (const rf of relativeFixed) {
    const key = `${Math.min(rf.studentIdA, rf.studentIdB)}-${Math.max(rf.studentIdA, rf.studentIdB)}`
    if (adjacent8Set.has(key) && !seen.has(key)) {
      seen.add(key)
      conflicts.push({
        studentIdA: Math.min(rf.studentIdA, rf.studentIdB),
        studentIdB: Math.max(rf.studentIdA, rf.studentIdB),
      })
    }
  }

  return conflicts
}

/**
 * 同一座席に複数の固定制約が存在するケースを返す。
 */
export function detectFixedSeatConflicts(
  fixedConstraints: FixedConstraint[],
): FixedSeatConflict[] {
  const bySeat = new Map<string, { row: number; col: number; studentIds: number[] }>()
  for (const f of fixedConstraints) {
    const key = `${f.row},${f.col}`
    if (!bySeat.has(key)) bySeat.set(key, { row: f.row, col: f.col, studentIds: [] })
    bySeat.get(key)!.studentIds.push(f.studentId)
  }
  const conflicts: FixedSeatConflict[] = []
  for (const entry of bySeat.values()) {
    if (entry.studentIds.length > 1) {
      conflicts.push({ row: entry.row, col: entry.col, studentIds: entry.studentIds })
    }
  }
  return conflicts
}

/**
 * 固定済みペアの座席が互いに隣接しているが adjacent8 禁止されているケースを返す。
 */
export function detectFixedForbiddenConflicts(
  fixedConstraints: FixedConstraint[],
  forbiddenConstraints: ForbiddenConstraint[],
): FixedForbiddenConflict[] {
  const fixedByStudent = new Map(fixedConstraints.map((f) => [f.studentId, { row: f.row, col: f.col }]))
  const conflicts: FixedForbiddenConflict[] = []
  for (const fb of forbiddenConstraints) {
    if (fb.type !== 'adjacent8') continue
    const posA = fixedByStudent.get(fb.studentIdA)
    const posB = fixedByStudent.get(fb.studentIdB)
    if (!posA || !posB) continue
    if (Math.abs(posA.row - posB.row) <= 1 && Math.abs(posA.col - posB.col) <= 1) {
      conflicts.push({
        studentIdA: fb.studentIdA,
        studentIdB: fb.studentIdB,
        rowA: posA.row,
        colA: posA.col,
        rowB: posB.row,
        colB: posB.col,
      })
    }
  }
  return conflicts
}

/**
 * 固定済みペアの座席が隣接固定の相対条件（dRow, dCol）を満たさないケースを返す。
 */
export function detectFixedRelativeConflicts(
  fixedConstraints: FixedConstraint[],
  relativeFixedConstraints: RelativeFixedConstraint[],
): FixedRelativeConflict[] {
  const fixedByStudent = new Map(fixedConstraints.map((f) => [f.studentId, { row: f.row, col: f.col }]))
  const conflicts: FixedRelativeConflict[] = []
  for (const rf of relativeFixedConstraints) {
    const posA = fixedByStudent.get(rf.studentIdA)
    const posB = fixedByStudent.get(rf.studentIdB)
    if (!posA || !posB) continue
    if (posB.row !== posA.row + rf.dRow || posB.col !== posA.col + rf.dCol) {
      conflicts.push({
        studentIdA: rf.studentIdA,
        studentIdB: rf.studentIdB,
        rowA: posA.row,
        colA: posA.col,
        rowB: posB.row,
        colB: posB.col,
        dRow: rf.dRow,
        dCol: rf.dCol,
      })
    }
  }
  return conflicts
}

export interface RelativeForbiddenPositionConflict {
  baseStudentId: number
  derivedStudentId: number
  conflictStudentId: number
  baseRow: number
  baseCol: number
  derivedRow: number
  derivedCol: number
  conflictRow: number
  conflictCol: number
}

/**
 * A が固定・B が導出（rf A→B）・C が固定の状況で、B の導出位置が C と adjacent8 禁止かつ隣接するケースを返す。
 * A・B 両方固定は detectFixedForbiddenConflicts、rf と禁止の直接ペアは detectRelativeFixedForbiddenConflicts が担当。
 */
export function detectRelativeForbiddenPositionConflicts(
  fixedConstraints: FixedConstraint[],
  forbiddenConstraints: ForbiddenConstraint[],
  relativeFixedConstraints: RelativeFixedConstraint[],
): RelativeForbiddenPositionConflict[] {
  const fixedByStudent = new Map(fixedConstraints.map((f) => [f.studentId, { row: f.row, col: f.col }]))
  const conflicts: RelativeForbiddenPositionConflict[] = []

  for (const rf of relativeFixedConstraints) {
    const posA = fixedByStudent.get(rf.studentIdA)
    const posB = fixedByStudent.get(rf.studentIdB)

    if (posA && posB) continue   // 両方固定 → 他の関数が担当
    if (!posA && !posB) continue // どちらも未固定 → 位置が確定しない

    let baseStudentId: number, derivedStudentId: number
    let baseRow: number, baseCol: number, derivedRow: number, derivedCol: number

    if (posA) {
      baseStudentId = rf.studentIdA
      derivedStudentId = rf.studentIdB
      baseRow = posA.row; baseCol = posA.col
      derivedRow = posA.row + rf.dRow; derivedCol = posA.col + rf.dCol
    } else {
      baseStudentId = rf.studentIdB
      derivedStudentId = rf.studentIdA
      baseRow = posB!.row; baseCol = posB!.col
      derivedRow = posB!.row - rf.dRow; derivedCol = posB!.col - rf.dCol
    }

    for (const fb of forbiddenConstraints) {
      if (fb.type !== 'adjacent8') continue
      let conflictStudentId: number | null = null
      if (fb.studentIdA === derivedStudentId) conflictStudentId = fb.studentIdB
      else if (fb.studentIdB === derivedStudentId) conflictStudentId = fb.studentIdA
      if (conflictStudentId === null || conflictStudentId === baseStudentId) continue

      const posC = fixedByStudent.get(conflictStudentId)
      if (!posC) continue

      if (Math.abs(derivedRow - posC.row) <= 1 && Math.abs(derivedCol - posC.col) <= 1) {
        conflicts.push({
          baseStudentId, derivedStudentId, conflictStudentId,
          baseRow, baseCol, derivedRow, derivedCol,
          conflictRow: posC.row, conflictCol: posC.col,
        })
      }
    }
  }

  return conflicts
}

export interface RelativeRelativeForbiddenConflict {
  baseStudentId: number
  studentIdB: number
  studentIdC: number
  dRowB: number
  dColB: number
  dRowC: number
  dColC: number
}

/**
 * 同一基準 A から導出される B・C が adjacent8 禁止かつ幾何的に隣接するケースを返す。
 * |d1.row - d2.row| ≤ 1 かつ |d1.col - d2.col| ≤ 1 → どこに A を置いても B-C は隣接。
 */
export function detectRelativeRelativeForbiddenConflicts(
  forbiddenConstraints: ForbiddenConstraint[],
  relativeFixedConstraints: RelativeFixedConstraint[],
): RelativeRelativeForbiddenConflict[] {
  const adjacent8Set = new Set(
    forbiddenConstraints
      .filter((fb) => fb.type === 'adjacent8')
      .map((fb) => `${Math.min(fb.studentIdA, fb.studentIdB)}-${Math.max(fb.studentIdA, fb.studentIdB)}`)
  )

  const byBase = new Map<number, RelativeFixedConstraint[]>()
  for (const rf of relativeFixedConstraints) {
    if (!byBase.has(rf.studentIdA)) byBase.set(rf.studentIdA, [])
    byBase.get(rf.studentIdA)!.push(rf)
  }

  const seen = new Set<string>()
  const conflicts: RelativeRelativeForbiddenConflict[] = []

  for (const [baseStudentId, rfs] of byBase) {
    for (let i = 0; i < rfs.length; i++) {
      for (let j = i + 1; j < rfs.length; j++) {
        const rf1 = rfs[i], rf2 = rfs[j]
        const b = rf1.studentIdB, c = rf2.studentIdB
        if (b === c) continue

        const pairKey = `${Math.min(b, c)}-${Math.max(b, c)}`
        if (!adjacent8Set.has(pairKey) || seen.has(pairKey)) continue

        if (Math.abs(rf1.dRow - rf2.dRow) <= 1 && Math.abs(rf1.dCol - rf2.dCol) <= 1) {
          seen.add(pairKey)
          const bFirst = b < c
          conflicts.push({
            baseStudentId,
            studentIdB: bFirst ? b : c,
            studentIdC: bFirst ? c : b,
            dRowB: bFirst ? rf1.dRow : rf2.dRow,
            dColB: bFirst ? rf1.dCol : rf2.dCol,
            dRowC: bFirst ? rf2.dRow : rf1.dRow,
            dColC: bFirst ? rf2.dCol : rf1.dCol,
          })
        }
      }
    }
  }

  return conflicts
}

export interface FixedSameGroupConflict {
  studentIdA: number
  studentIdB: number
  rowA: number
  colA: number
  rowB: number
  colB: number
  groupId: number
}

/**
 * 固定済みペアの座席が同じ班に属し、かつ same_group 禁止されているケースを返す。
 */
export function detectFixedSameGroupConflicts(
  fixedConstraints: FixedConstraint[],
  forbiddenConstraints: ForbiddenConstraint[],
  groups: Group[],
  numGroups: number
): FixedSameGroupConflict[] {
  const fixedByStudent = new Map(fixedConstraints.map((f) => [f.studentId, { row: f.row, col: f.col }]))
  const activeGroups = groups.filter((g) => g.groupId <= numGroups)
  const conflicts: FixedSameGroupConflict[] = []

  for (const fb of forbiddenConstraints) {
    if (fb.type !== 'same_group') continue
    const posA = fixedByStudent.get(fb.studentIdA)
    const posB = fixedByStudent.get(fb.studentIdB)
    if (!posA || !posB) continue

    for (const g of activeGroups) {
      const inA = g.seatCoords.some((c) => c.row === posA.row && c.col === posA.col)
      const inB = g.seatCoords.some((c) => c.row === posB.row && c.col === posB.col)
      if (inA && inB) {
        conflicts.push({
          studentIdA: fb.studentIdA, studentIdB: fb.studentIdB,
          rowA: posA.row, colA: posA.col, rowB: posB.row, colB: posB.col,
          groupId: g.groupId,
        })
        break
      }
    }
  }
  return conflicts
}
