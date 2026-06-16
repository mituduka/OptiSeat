import {
  detectGenderFixedConflicts,
  detectRelativeFixedForbiddenConflicts,
  detectFixedSeatConflicts,
  detectFixedForbiddenConflicts,
  detectFixedRelativeConflicts,
  detectFixedSameGroupConflicts,
  detectRelativeForbiddenPositionConflicts,
  detectRelativeRelativeForbiddenConflicts,
} from './constraints'
import type { Student, Group } from '@/types'

const students: Student[] = [
  { id: 1, name: '山田 太郎', gender: 'male', tags: [] },
  { id: 2, name: '鈴木 花子', gender: 'female', tags: [] },
]

describe('detectGenderFixedConflicts', () => {
  it('性別が一致しない場合に矛盾を検出する', () => {
    const result = detectGenderFixedConflicts(
      [{ row: 1, col: 1, allowedGender: 'female' }],
      [{ studentId: 1, row: 1, col: 1 }],
      students,
    )
    expect(result).toHaveLength(1)
    expect(result[0].studentName).toBe('山田 太郎')
    expect(result[0].studentGender).toBe('male')
    expect(result[0].allowedGender).toBe('female')
    expect(result[0].row).toBe(1)
    expect(result[0].col).toBe(1)
  })

  it('性別が一致する場合は矛盾なし', () => {
    const result = detectGenderFixedConflicts(
      [{ row: 1, col: 1, allowedGender: 'male' }],
      [{ studentId: 1, row: 1, col: 1 }],
      students,
    )
    expect(result).toHaveLength(0)
  })

  it('固定がない席はスキップ', () => {
    const result = detectGenderFixedConflicts(
      [{ row: 1, col: 2, allowedGender: 'female' }],
      [],
      students,
    )
    expect(result).toHaveLength(0)
  })
})

describe('detectRelativeFixedForbiddenConflicts', () => {
  it('adjacent8禁止とrelative_fixedが重複するペアを検出する', () => {
    const result = detectRelativeFixedForbiddenConflicts(
      [{ studentIdA: 1, studentIdB: 2, type: 'adjacent8' }],
      [{ studentIdA: 1, studentIdB: 2, dRow: 0, dCol: 1 }]
    )
    expect(result).toEqual([{ studentIdA: 1, studentIdB: 2 }])
  })

  it('same_group禁止はコンフリクトにならない', () => {
    const result = detectRelativeFixedForbiddenConflicts(
      [{ studentIdA: 1, studentIdB: 2, type: 'same_group' }],
      [{ studentIdA: 1, studentIdB: 2, dRow: 0, dCol: 1 }]
    )
    expect(result).toHaveLength(0)
  })

  it('逆順ペアも検出する', () => {
    const result = detectRelativeFixedForbiddenConflicts(
      [{ studentIdA: 1, studentIdB: 2, type: 'adjacent8' }],
      [{ studentIdA: 2, studentIdB: 1, dRow: 0, dCol: -1 }]
    )
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({ studentIdA: 1, studentIdB: 2 })
  })

  it('重複エントリは1件にまとめる', () => {
    const result = detectRelativeFixedForbiddenConflicts(
      [{ studentIdA: 1, studentIdB: 2, type: 'adjacent8' }],
      [
        { studentIdA: 1, studentIdB: 2, dRow: 0, dCol: 1 },
        { studentIdA: 2, studentIdB: 1, dRow: 0, dCol: -1 },
      ]
    )
    expect(result).toHaveLength(1)
  })

  it('矛盾がない場合は空配列を返す', () => {
    expect(detectRelativeFixedForbiddenConflicts([], [])).toHaveLength(0)
  })
})

describe('detectFixedSeatConflicts', () => {
  it('同一座席に2名固定されていたら矛盾を返す', () => {
    const result = detectFixedSeatConflicts(
      [{ studentId: 1, row: 1, col: 1 }, { studentId: 2, row: 1, col: 1 }],
    )
    expect(result).toHaveLength(1)
    expect(result[0].row).toBe(1)
    expect(result[0].col).toBe(1)
    expect(result[0].studentIds).toContain(1)
    expect(result[0].studentIds).toContain(2)
  })

  it('異なる座席なら矛盾なし', () => {
    const result = detectFixedSeatConflicts(
      [{ studentId: 1, row: 1, col: 1 }, { studentId: 2, row: 1, col: 2 }],
    )
    expect(result).toHaveLength(0)
  })

  it('固定が1件以下なら矛盾なし', () => {
    expect(detectFixedSeatConflicts([])).toHaveLength(0)
    expect(detectFixedSeatConflicts([{ studentId: 1, row: 1, col: 1 }])).toHaveLength(0)
  })
})

describe('detectFixedForbiddenConflicts', () => {
  it('固定位置が隣接していてadj8禁止なら矛盾を検出する', () => {
    // (1,1) と (1,2) は隣接、禁止設定あり
    const result = detectFixedForbiddenConflicts(
      [{ studentId: 1, row: 1, col: 1 }, { studentId: 2, row: 1, col: 2 }],
      [{ studentIdA: 1, studentIdB: 2, type: 'adjacent8' }],
    )
    expect(result).toHaveLength(1)
    expect(result[0].studentIdA).toBe(1)
    expect(result[0].studentIdB).toBe(2)
  })

  it('固定位置が離れていれば矛盾なし', () => {
    // (1,1) と (3,3) は離れている
    const result = detectFixedForbiddenConflicts(
      [{ studentId: 1, row: 1, col: 1 }, { studentId: 2, row: 3, col: 3 }],
      [{ studentIdA: 1, studentIdB: 2, type: 'adjacent8' }],
    )
    expect(result).toHaveLength(0)
  })

  it('same_group禁止は対象外', () => {
    const result = detectFixedForbiddenConflicts(
      [{ studentId: 1, row: 1, col: 1 }, { studentId: 2, row: 1, col: 2 }],
      [{ studentIdA: 1, studentIdB: 2, type: 'same_group' }],
    )
    expect(result).toHaveLength(0)
  })

  it('片方しか固定されていなければ矛盾なし', () => {
    const result = detectFixedForbiddenConflicts(
      [{ studentId: 1, row: 1, col: 1 }],  // 2番は未固定
      [{ studentIdA: 1, studentIdB: 2, type: 'adjacent8' }],
    )
    expect(result).toHaveLength(0)
  })
})

describe('detectFixedRelativeConflicts', () => {
  it('固定位置がdRow/dColを満たさない場合に矛盾を検出する', () => {
    // A=(1,1), B=(1,3): relative_fixed は dRow=0,dCol=1 → B は (1,2) のはずだが実際は (1,3)
    const result = detectFixedRelativeConflicts(
      [{ studentId: 1, row: 1, col: 1 }, { studentId: 2, row: 1, col: 3 }],
      [{ studentIdA: 1, studentIdB: 2, dRow: 0, dCol: 1 }],
    )
    expect(result).toHaveLength(1)
    expect(result[0].studentIdA).toBe(1)
    expect(result[0].studentIdB).toBe(2)
    expect(result[0].rowA).toBe(1)
    expect(result[0].colA).toBe(1)
    expect(result[0].rowB).toBe(1)
    expect(result[0].colB).toBe(3)
  })

  it('固定位置がdRow/dColを満たす場合は矛盾なし', () => {
    // A=(1,1), B=(1,2): relative_fixed は dRow=0,dCol=1 → B は (1,2) ✓
    const result = detectFixedRelativeConflicts(
      [{ studentId: 1, row: 1, col: 1 }, { studentId: 2, row: 1, col: 2 }],
      [{ studentIdA: 1, studentIdB: 2, dRow: 0, dCol: 1 }],
    )
    expect(result).toHaveLength(0)
  })

  it('片方しか固定されていなければ矛盾なし', () => {
    const result = detectFixedRelativeConflicts(
      [{ studentId: 1, row: 1, col: 1 }],
      [{ studentIdA: 1, studentIdB: 2, dRow: 0, dCol: 1 }],
    )
    expect(result).toHaveLength(0)
  })
})

describe('detectRelativeForbiddenPositionConflicts', () => {
  it('A固定→B導出、C固定と隣接する場合に矛盾を検出する', () => {
    // A(1,1)固定, rf A→B(d=0,+1)→B=(1,2), C(1,3)固定, B-C adjacent8
    const result = detectRelativeForbiddenPositionConflicts(
      [{ studentId: 1, row: 1, col: 1 }, { studentId: 3, row: 1, col: 3 }],
      [{ studentIdA: 2, studentIdB: 3, type: 'adjacent8' }],
      [{ studentIdA: 1, studentIdB: 2, dRow: 0, dCol: 1 }],
    )
    expect(result).toHaveLength(1)
    expect(result[0].baseStudentId).toBe(1)
    expect(result[0].derivedStudentId).toBe(2)
    expect(result[0].conflictStudentId).toBe(3)
    expect(result[0].derivedRow).toBe(1)
    expect(result[0].derivedCol).toBe(2)
  })

  it('B固定→A導出、C固定と隣接する場合に矛盾を検出する', () => {
    // B(2,2)固定, rf A→B(d=+1,0)→A=(1,2), C(1,1)固定, A-C adjacent8
    const result = detectRelativeForbiddenPositionConflicts(
      [{ studentId: 2, row: 2, col: 2 }, { studentId: 3, row: 1, col: 1 }],
      [{ studentIdA: 1, studentIdB: 3, type: 'adjacent8' }],
      [{ studentIdA: 1, studentIdB: 2, dRow: 1, dCol: 0 }],
    )
    expect(result).toHaveLength(1)
    expect(result[0].baseStudentId).toBe(2)
    expect(result[0].derivedStudentId).toBe(1)
    expect(result[0].conflictStudentId).toBe(3)
    expect(result[0].derivedRow).toBe(1)
    expect(result[0].derivedCol).toBe(2)
  })

  it('導出位置と固定位置が非隣接なら矛盾なし', () => {
    // A(1,1)固定, B導出(1,2), C(1,4)固定: colDiff=2 > 1
    const result = detectRelativeForbiddenPositionConflicts(
      [{ studentId: 1, row: 1, col: 1 }, { studentId: 3, row: 1, col: 4 }],
      [{ studentIdA: 2, studentIdB: 3, type: 'adjacent8' }],
      [{ studentIdA: 1, studentIdB: 2, dRow: 0, dCol: 1 }],
    )
    expect(result).toHaveLength(0)
  })

  it('A・B両方が直接固定の場合はスキップされ矛盾なし', () => {
    // A(1,1)・B(1,2)直接固定, B-C adjacent8, C(1,3)固定
    const result = detectRelativeForbiddenPositionConflicts(
      [{ studentId: 1, row: 1, col: 1 }, { studentId: 2, row: 1, col: 2 }, { studentId: 3, row: 1, col: 3 }],
      [{ studentIdA: 2, studentIdB: 3, type: 'adjacent8' }],
      [{ studentIdA: 1, studentIdB: 2, dRow: 0, dCol: 1 }],
    )
    expect(result).toHaveLength(0)
  })
})

describe('detectRelativeRelativeForbiddenConflicts', () => {
  it('同一基準AでB・C導出位置が隣接かつ禁止の場合に矛盾を検出する', () => {
    // rf A→B(d=-1,-1), rf A→C(d=0,-1), B-C adjacent8 → |d差|=(1,0)
    const result = detectRelativeRelativeForbiddenConflicts(
      [{ studentIdA: 2, studentIdB: 3, type: 'adjacent8' }],
      [
        { studentIdA: 1, studentIdB: 2, dRow: -1, dCol: -1 },
        { studentIdA: 1, studentIdB: 3, dRow: 0, dCol: -1 },
      ],
    )
    expect(result).toHaveLength(1)
    expect(result[0].baseStudentId).toBe(1)
    expect(result[0].studentIdB).toBe(2)
    expect(result[0].studentIdC).toBe(3)
  })

  it('同一基準AでB・C導出位置が非隣接なら矛盾なし', () => {
    // rf A→B(d=0,+1), rf A→C(d=0,-1), B-C adjacent8 → |d差|=(0,2)
    const result = detectRelativeRelativeForbiddenConflicts(
      [{ studentIdA: 2, studentIdB: 3, type: 'adjacent8' }],
      [
        { studentIdA: 1, studentIdB: 2, dRow: 0, dCol: 1 },
        { studentIdA: 1, studentIdB: 3, dRow: 0, dCol: -1 },
      ],
    )
    expect(result).toHaveLength(0)
  })

  it('B-C間にadjacent8禁止がない場合は矛盾なし', () => {
    // rf A→B・rf A→C の導出位置が隣接だが B-C は same_group 禁止のみ
    const result = detectRelativeRelativeForbiddenConflicts(
      [{ studentIdA: 2, studentIdB: 3, type: 'same_group' }],
      [
        { studentIdA: 1, studentIdB: 2, dRow: -1, dCol: -1 },
        { studentIdA: 1, studentIdB: 3, dRow: 0, dCol: -1 },
      ],
    )
    expect(result).toHaveLength(0)
  })

  it('基準Aが異なる場合は検出しない', () => {
    // rf X→B と rf Y→C（X≠Y）, B-C adjacent8, 導出位置隣接
    const result = detectRelativeRelativeForbiddenConflicts(
      [{ studentIdA: 2, studentIdB: 3, type: 'adjacent8' }],
      [
        { studentIdA: 1, studentIdB: 2, dRow: -1, dCol: -1 },
        { studentIdA: 4, studentIdB: 3, dRow: 0, dCol: -1 },
      ],
    )
    expect(result).toHaveLength(0)
  })
})

// 班1: 1行目(seat 1,2,3)、班2: 2行目(seat 4,5,6)
const testGroups: Group[] = [
  { groupId: 1, seatCoords: [{ row: 1, col: 1 }, { row: 1, col: 2 }, { row: 1, col: 3 }] },
  { groupId: 2, seatCoords: [{ row: 2, col: 1 }, { row: 2, col: 2 }, { row: 2, col: 3 }] },
]

describe('detectFixedSameGroupConflicts', () => {
  it('両者が同じ班の座席に固定されていてsame_group禁止なら矛盾を検出する', () => {
    const result = detectFixedSameGroupConflicts(
      [{ studentId: 1, row: 1, col: 1 }, { studentId: 2, row: 1, col: 2 }],
      [{ studentIdA: 1, studentIdB: 2, type: 'same_group' }],
      testGroups,
      2
    )
    expect(result).toHaveLength(1)
    expect(result[0].studentIdA).toBe(1)
    expect(result[0].studentIdB).toBe(2)
    expect(result[0].groupId).toBe(1)
  })

  it('異なる班の座席に固定されていれば矛盾なし', () => {
    // (1,1) → 班1、(2,1) → 班2
    const result = detectFixedSameGroupConflicts(
      [{ studentId: 1, row: 1, col: 1 }, { studentId: 2, row: 2, col: 1 }],
      [{ studentIdA: 1, studentIdB: 2, type: 'same_group' }],
      testGroups,
      2
    )
    expect(result).toHaveLength(0)
  })

  it('片方しか固定されていなければ矛盾なし', () => {
    const result = detectFixedSameGroupConflicts(
      [{ studentId: 1, row: 1, col: 1 }],
      [{ studentIdA: 1, studentIdB: 2, type: 'same_group' }],
      testGroups,
      2
    )
    expect(result).toHaveLength(0)
  })

  it('adjacent8禁止は対象外', () => {
    const result = detectFixedSameGroupConflicts(
      [{ studentId: 1, row: 1, col: 1 }, { studentId: 2, row: 1, col: 2 }],
      [{ studentIdA: 1, studentIdB: 2, type: 'adjacent8' }],
      testGroups,
      2
    )
    expect(result).toHaveLength(0)
  })

  it('numGroups外の班は無視される', () => {
    // numGroups=1 なので班2は無効。(2,1)(2,2) は班2だが無視される
    const result = detectFixedSameGroupConflicts(
      [{ studentId: 1, row: 2, col: 1 }, { studentId: 2, row: 2, col: 2 }],
      [{ studentIdA: 1, studentIdB: 2, type: 'same_group' }],
      testGroups,
      1
    )
    expect(result).toHaveLength(0)
  })
})
