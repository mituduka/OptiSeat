import { computeConflicts } from './ConflictAlerts'
import type {
  Student,
  FixedConstraint,
  ForbiddenConstraint,
  SeatGenderConstraint,
  RelativeFixedConstraint,
  Group,
} from '@/types'

const students: Student[] = [
  { id: 1, name: '山田 太郎', gender: 'male', tags: [] },
  { id: 2, name: '鈴木 花子', gender: 'female', tags: [] },
  { id: 3, name: '佐藤 次郎', gender: 'male', tags: [] },
]

const noConflicts = {
  students,
  fixedConstraints: [] as FixedConstraint[],
  forbiddenConstraints: [] as ForbiddenConstraint[],
  seatGenderConstraints: [] as SeatGenderConstraint[],
  relativeFixedConstraints: [] as RelativeFixedConstraint[],
  groups: [] as Group[],
  numGroups: 0,
}

// ---------------------------------------------------------------------------
// 矛盾なし
// ---------------------------------------------------------------------------

describe('computeConflicts: 矛盾なし', () => {
  it('制約が全て空のとき hasConflicts=false', () => {
    const result = computeConflicts(noConflicts)
    expect(result.hasConflicts).toBe(false)
    expect(result.genderFixed).toHaveLength(0)
    expect(result.rfFb).toHaveLength(0)
    expect(result.fixedSeat).toHaveLength(0)
    expect(result.fixedForbidden).toHaveLength(0)
    expect(result.fixedRelative).toHaveLength(0)
    expect(result.fixedSameGroup).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// 性別制約 × 固定制約の矛盾
// ---------------------------------------------------------------------------

describe('computeConflicts: 性別制約と固定制約の矛盾', () => {
  it('男性を女性専用席に固定すると矛盾を検出する', () => {
    const result = computeConflicts({
      ...noConflicts,
      seatGenderConstraints: [{ row: 1, col: 1, allowedGender: 'female' }],
      fixedConstraints: [{ studentId: 1, row: 1, col: 1 }],  // studentId=1 は male
    })
    expect(result.hasConflicts).toBe(true)
    expect(result.genderFixed).toHaveLength(1)
    expect(result.genderFixed[0].studentName).toBe('山田 太郎')
  })

  it('性別が一致していれば矛盾なし', () => {
    const result = computeConflicts({
      ...noConflicts,
      seatGenderConstraints: [{ row: 1, col: 1, allowedGender: 'male' }],
      fixedConstraints: [{ studentId: 1, row: 1, col: 1 }],
    })
    expect(result.hasConflicts).toBe(false)
    expect(result.genderFixed).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// 固定制約の座席衝突
// ---------------------------------------------------------------------------

describe('computeConflicts: 同一座席への複数固定', () => {
  it('2人が同じ座席に固定されると矛盾を検出する', () => {
    const result = computeConflicts({
      ...noConflicts,
      fixedConstraints: [
        { studentId: 1, row: 1, col: 1 },
        { studentId: 2, row: 1, col: 1 },
      ],
    })
    expect(result.hasConflicts).toBe(true)
    expect(result.fixedSeat).toHaveLength(1)
  })

  it('異なる座席への固定は矛盾なし', () => {
    const result = computeConflicts({
      ...noConflicts,
      fixedConstraints: [
        { studentId: 1, row: 1, col: 1 },
        { studentId: 2, row: 1, col: 2 },
      ],
    })
    expect(result.hasConflicts).toBe(false)
    expect(result.fixedSeat).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// 隣接固定 × 隣接禁止の矛盾
// ---------------------------------------------------------------------------

describe('computeConflicts: 隣接固定と隣接禁止の矛盾', () => {
  it('同一ペアに relative_fixed と forbidden8 が共存すると矛盾を検出する', () => {
    const result = computeConflicts({
      ...noConflicts,
      relativeFixedConstraints: [
        { studentIdA: 1, studentIdB: 2, dRow: 0, dCol: 1 },
      ],
      forbiddenConstraints: [
        { studentIdA: 1, studentIdB: 2, type: 'adjacent8' },
      ],
    })
    expect(result.hasConflicts).toBe(true)
    expect(result.rfFb).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// 固定 × 隣接禁止の矛盾
// ---------------------------------------------------------------------------

describe('computeConflicts: 固定位置が隣接禁止ペアに違反', () => {
  it('隣接禁止ペアが固定位置で隣接していると矛盾を検出する', () => {
    const result = computeConflicts({
      ...noConflicts,
      fixedConstraints: [
        { studentId: 1, row: 1, col: 1 },
        { studentId: 2, row: 1, col: 2 },  // 隣接
      ],
      forbiddenConstraints: [
        { studentIdA: 1, studentIdB: 2, type: 'adjacent8' },
      ],
    })
    expect(result.hasConflicts).toBe(true)
    expect(result.fixedForbidden).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// パターン A: 固定+導出→隣接禁止の矛盾
// ---------------------------------------------------------------------------

describe('computeConflicts: パターンA（固定+導出→隣接禁止）', () => {
  it('A固定・rf A→B・B-C forbidden・C固定で隣接→矛盾を検出する', () => {
    // A(1,1)固定, rf A→B(d=0,+1)→B=(1,2), C(1,3)固定, B-C adjacent8
    const result = computeConflicts({
      ...noConflicts,
      fixedConstraints: [
        { studentId: 1, row: 1, col: 1 },
        { studentId: 3, row: 1, col: 3 },
      ],
      relativeFixedConstraints: [
        { studentIdA: 1, studentIdB: 2, dRow: 0, dCol: 1 },
      ],
      forbiddenConstraints: [
        { studentIdA: 2, studentIdB: 3, type: 'adjacent8' },
      ],
    })
    expect(result.hasConflicts).toBe(true)
    expect(result.relativePositionForbidden).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// パターン B: 同一基準の2つの導出位置が相互に隣接禁止と矛盾
// ---------------------------------------------------------------------------

describe('computeConflicts: パターンB（同一基準の導出位置が隣接禁止と矛盾）', () => {
  it('rf A→B(d=-1,-1)・rf A→C(d=0,-1)・B-C forbidden→矛盾を検出する', () => {
    const result = computeConflicts({
      ...noConflicts,
      relativeFixedConstraints: [
        { studentIdA: 1, studentIdB: 2, dRow: -1, dCol: -1 },
        { studentIdA: 1, studentIdB: 3, dRow: 0, dCol: -1 },
      ],
      forbiddenConstraints: [
        { studentIdA: 2, studentIdB: 3, type: 'adjacent8' },
      ],
    })
    expect(result.hasConflicts).toBe(true)
    expect(result.relativeRelativeForbidden).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// 複数種類の矛盾が同時に存在する場合
// ---------------------------------------------------------------------------

describe('computeConflicts: 複数種類の矛盾', () => {
  it('hasConflicts=true かつ各配列に件数が入る', () => {
    const result = computeConflicts({
      ...noConflicts,
      // 同一座席への複数固定
      fixedConstraints: [
        { studentId: 1, row: 1, col: 1 },
        { studentId: 2, row: 1, col: 1 },
      ],
      // 性別制約との矛盾（student1=male → female席）
      seatGenderConstraints: [{ row: 1, col: 1, allowedGender: 'female' }],
    })
    expect(result.hasConflicts).toBe(true)
    expect(result.fixedSeat.length + result.genderFixed.length).toBeGreaterThan(0)
  })
})
