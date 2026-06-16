import { describe, it, expect } from 'vitest'
import { generateSeats, seatIdToPosition, fixedToApi, totalViolationCount, getHighestViolation, compareSolutionsLex, coordsToSeatId, prevAssignToApi, seatGenderToApi, groupsToApi, violationsByLevel } from './seats'
import type { ScoreBreakdown, ConstraintMeta, ConstraintToggles, PrevAssignment, SeatGenderConstraint, Group } from '@/types'

const EMPTY_BREAKDOWN: ScoreBreakdown = {
  front_preferred_violation: 0,
  back_preferred_violation: 0,
  group_gender_imbalance: 0,
  loneliness_violation: 0,
  prev_assign_same: 0,
  prev_neighbor_same: 0,
  prev_group_same: 0,
  fixed_violation: 0,
  gender_constraint_violation: 0,
  relative_fixed_violation: 0,
  forbidden_violation: 0,
}

const SOFT_META: ConstraintMeta = { key: 'front_preferred_violation', label: '前側配慮違反', description: '前側配慮が満たされていない件数', weight: 3, priorityLevel: 5 }
const HARD_FIXED_META: ConstraintMeta = { key: 'fixed_violation', label: '座席固定違反', description: '固定制約を違反した件数', weight: null, priorityLevel: null }
const HARD_FORB_META: ConstraintMeta = { key: 'forbidden_violation', label: '隣接禁止違反', description: '隣接禁止制約に違反した件数', weight: null, priorityLevel: null }

describe('generateSeats', () => {
  it('座席数が numRows × numCols になる', () => {
    const seats = generateSeats(2, 3)
    expect(seats).toHaveLength(6)
  })

  it('id が 1 始まりの連番になる', () => {
    const seats = generateSeats(2, 3)
    expect(seats.map((s) => s.id)).toEqual([1, 2, 3, 4, 5, 6])
  })

  it('行優先で row / col が正しく設定される', () => {
    const seats = generateSeats(2, 3)
    // 1行目
    expect(seats[0]).toMatchObject({ id: 1, row: 1, col: 1 })
    expect(seats[1]).toMatchObject({ id: 2, row: 1, col: 2 })
    expect(seats[2]).toMatchObject({ id: 3, row: 1, col: 3 })
    // 2行目
    expect(seats[3]).toMatchObject({ id: 4, row: 2, col: 1 })
    expect(seats[5]).toMatchObject({ id: 6, row: 2, col: 3 })
  })

  it('1×1 グリッドは座席1つ', () => {
    const seats = generateSeats(1, 1)
    expect(seats).toHaveLength(1)
    expect(seats[0]).toMatchObject({ id: 1, row: 1, col: 1 })
  })

  it('3×4 グリッドは 12 座席', () => {
    expect(generateSeats(3, 4)).toHaveLength(12)
  })
})

describe('seatIdToPosition', () => {
  it('先頭の座席は row=1, col=1', () => {
    expect(seatIdToPosition(1, 3)).toEqual({ row: 1, col: 1 })
  })

  it('2行目先頭は row=2, col=1', () => {
    expect(seatIdToPosition(4, 3)).toEqual({ row: 2, col: 1 })
  })

  it('最終列は col=numCols', () => {
    expect(seatIdToPosition(3, 3)).toEqual({ row: 1, col: 3 })
    expect(seatIdToPosition(6, 3)).toEqual({ row: 2, col: 3 })
  })

  it('generateSeats の結果と整合する', () => {
    const seats = generateSeats(3, 4)
    for (const seat of seats) {
      expect(seatIdToPosition(seat.id, 4)).toEqual({
        row: seat.row,
        col: seat.col,
      })
    }
  })
})

describe('fixedToApi', () => {
  it('row/col を seat_id に変換して API 形式にする', () => {
    const result = fixedToApi([
      { studentId: 1, row: 1, col: 1 },
      { studentId: 2, row: 2, col: 3 },
    ], 3)
    expect(result).toEqual([
      { student_id: 1, seat_id: 1 },
      { student_id: 2, seat_id: 6 },
    ])
  })

  it('空配列を渡すと空配列を返す', () => {
    expect(fixedToApi([], 3)).toEqual([])
  })
})

describe('totalViolationCount', () => {
  it('ソフト制約とハード制約の違反件数を合算する', () => {
    const breakdown: ScoreBreakdown = { ...EMPTY_BREAKDOWN, front_preferred_violation: 2, fixed_violation: 1, forbidden_violation: 3 }
    const meta: ConstraintMeta[] = [SOFT_META, HARD_FIXED_META, HARD_FORB_META]
    expect(totalViolationCount(breakdown, meta)).toBe(6)
  })

  it('ハード制約のみの場合も正しく集計する', () => {
    const breakdown: ScoreBreakdown = { ...EMPTY_BREAKDOWN, fixed_violation: 2, forbidden_violation: 1 }
    const meta: ConstraintMeta[] = [HARD_FIXED_META, HARD_FORB_META]
    expect(totalViolationCount(breakdown, meta)).toBe(3)
  })

  it('違反なし（全 0）のとき 0 を返す', () => {
    const meta: ConstraintMeta[] = [SOFT_META, HARD_FIXED_META]
    expect(totalViolationCount(EMPTY_BREAKDOWN, meta)).toBe(0)
  })

  it('トグル OFF の項目はソフト制約側の合計から除外する', () => {
    const breakdown: ScoreBreakdown = { ...EMPTY_BREAKDOWN, front_preferred_violation: 2, loneliness_violation: 5 }
    const lonessMeta: ConstraintMeta = { key: 'loneliness_violation', label: '孤立違反', description: '', weight: 2, priorityLevel: 3 }
    const meta: ConstraintMeta[] = [SOFT_META, lonessMeta]
    const toggles: ConstraintToggles = { gender_balance: true, loneliness: false, differ_seat: true, differ_neighbor: true, differ_group: true }
    // loneliness は OFF なのでカウントされない → 2 のみ
    expect(totalViolationCount(breakdown, meta, toggles)).toBe(2)
  })
})

// ---------------------------------------------------------------------------

const META_L5: ConstraintMeta = { key: 'front_preferred_violation', label: '前側配慮違反', description: '', weight: 3, priorityLevel: 5 }
const META_L3: ConstraintMeta = { key: 'prev_neighbor_same', label: '前回左右一致', description: '', weight: 1, priorityLevel: 3 }

describe('getHighestViolation', () => {
  it('違反なしの場合は null を返す', () => {
    expect(getHighestViolation(EMPTY_BREAKDOWN, [META_L5, META_L3])).toBeNull()
  })

  it('最高レベルに違反がある場合はそのエントリを返す', () => {
    const breakdown = { ...EMPTY_BREAKDOWN, front_preferred_violation: 3 }
    expect(getHighestViolation(breakdown, [META_L5, META_L3])).toEqual({ level: 5, count: 3 })
  })

  it('高レベルが 0 件・低レベルに違反がある場合は低レベルのエントリを返す', () => {
    const breakdown = { ...EMPTY_BREAKDOWN, front_preferred_violation: 0, prev_neighbor_same: 2 }
    expect(getHighestViolation(breakdown, [META_L5, META_L3])).toEqual({ level: 3, count: 2 })
  })

  it('トグル OFF の制約は除外され、その違反は無視される', () => {
    const lonessMeta: ConstraintMeta = { key: 'loneliness_violation', label: '近隣同性なし', description: '', weight: 2, priorityLevel: 4 }
    const breakdown = { ...EMPTY_BREAKDOWN, loneliness_violation: 5 }
    const toggles: ConstraintToggles = { gender_balance: true, loneliness: false, differ_seat: true, differ_neighbor: true, differ_group: true }
    expect(getHighestViolation(breakdown, [lonessMeta], toggles)).toBeNull()
  })
})

describe('compareSolutionsLex', () => {
  it('a の高レベル違反が少ない場合は負値（a が優れている）を返す', () => {
    const a = { ...EMPTY_BREAKDOWN, front_preferred_violation: 1 }
    const b = { ...EMPTY_BREAKDOWN, front_preferred_violation: 2 }
    expect(compareSolutionsLex(a, b, [META_L5])).toBeLessThan(0)
  })

  it('a の高レベル違反が多い場合は正値（b が優れている）を返す', () => {
    const a = { ...EMPTY_BREAKDOWN, front_preferred_violation: 3 }
    const b = { ...EMPTY_BREAKDOWN, front_preferred_violation: 1 }
    expect(compareSolutionsLex(a, b, [META_L5])).toBeGreaterThan(0)
  })

  it('全レベルで同一件数の場合は 0 を返す', () => {
    const a = { ...EMPTY_BREAKDOWN, front_preferred_violation: 2 }
    const b = { ...EMPTY_BREAKDOWN, front_preferred_violation: 2 }
    expect(compareSolutionsLex(a, b, [META_L5])).toBe(0)
  })

  it('高レベルが同数のとき、低レベルの差で比較する', () => {
    const a = { ...EMPTY_BREAKDOWN, front_preferred_violation: 1, prev_neighbor_same: 0 }
    const b = { ...EMPTY_BREAKDOWN, front_preferred_violation: 1, prev_neighbor_same: 3 }
    expect(compareSolutionsLex(a, b, [META_L5, META_L3])).toBeLessThan(0)
  })

  it('高レベルの差を優先し、低レベルが大きくても高レベルが少ない方が優れている', () => {
    // a: L5=0, L3=10   b: L5=1, L3=0  → L5 で b が劣るので a < b
    const a = { ...EMPTY_BREAKDOWN, front_preferred_violation: 0, prev_neighbor_same: 10 }
    const b = { ...EMPTY_BREAKDOWN, front_preferred_violation: 1, prev_neighbor_same: 0 }
    expect(compareSolutionsLex(a, b, [META_L5, META_L3])).toBeLessThan(0)
  })
})

// ---------------------------------------------------------------------------

describe('coordsToSeatId', () => {
  it('row=1, col=1, numCols=4 → 1', () => {
    expect(coordsToSeatId(1, 1, 4)).toBe(1)
  })

  it('row=2, col=1, numCols=4 → 5', () => {
    expect(coordsToSeatId(2, 1, 4)).toBe(5)
  })

  it('row=1, col=numCols=4 → 4', () => {
    expect(coordsToSeatId(1, 4, 4)).toBe(4)
  })
})

describe('prevAssignToApi', () => {
  it('空配列 → []', () => {
    expect(prevAssignToApi([], 4)).toEqual([])
  })

  it('1件: row=2, col=3, numCols=4 → seat_id=7', () => {
    const prev: PrevAssignment[] = [{ student_id: 1, row: 2, col: 3 }]
    expect(prevAssignToApi(prev, 4)).toEqual([{ student_id: 1, seat_id: 7 }])
  })

  it('複数件を正しく変換する', () => {
    const prev: PrevAssignment[] = [
      { student_id: 1, row: 1, col: 1 },
      { student_id: 2, row: 3, col: 2 },
    ]
    expect(prevAssignToApi(prev, 3)).toEqual([
      { student_id: 1, seat_id: 1 },
      { student_id: 2, seat_id: 8 },
    ])
  })
})

describe('seatGenderToApi', () => {
  it('空配列 → []', () => {
    expect(seatGenderToApi([], 4)).toEqual([])
  })

  it('female 制約の row/col → seat_id 変換', () => {
    const constraints: SeatGenderConstraint[] = [{ row: 1, col: 2, allowedGender: 'female' }]
    expect(seatGenderToApi(constraints, 4)).toEqual([{ seat_id: 2, allowed_gender: 'female' }])
  })

  it('male 制約の row/col → seat_id 変換', () => {
    const constraints: SeatGenderConstraint[] = [{ row: 2, col: 1, allowedGender: 'male' }]
    expect(seatGenderToApi(constraints, 3)).toEqual([{ seat_id: 4, allowed_gender: 'male' }])
  })
})

describe('groupsToApi', () => {
  it('空配列 → []', () => {
    expect(groupsToApi([], 2, 3, 4)).toEqual([])
  })

  it('group_id > numGroups の班は除外される', () => {
    const groups: Group[] = [
      { groupId: 1, seatCoords: [{ row: 1, col: 1 }] },
      { groupId: 2, seatCoords: [{ row: 1, col: 2 }] },
    ]
    const result = groupsToApi(groups, 1, 3, 4)
    expect(result).toHaveLength(1)
    expect(result[0].group_id).toBe(1)
  })

  it('範囲外の座標は除外される', () => {
    const groups: Group[] = [
      { groupId: 1, seatCoords: [{ row: 1, col: 1 }, { row: 5, col: 1 }] },
    ]
    const result = groupsToApi(groups, 1, 3, 4)
    expect(result[0].seat_ids).toEqual([coordsToSeatId(1, 1, 4)])
  })

  it('有効な座席が 0 件の班は除外される', () => {
    const groups: Group[] = [
      { groupId: 1, seatCoords: [{ row: 5, col: 5 }] },
    ]
    expect(groupsToApi(groups, 1, 3, 4)).toHaveLength(0)
  })
})

describe('violationsByLevel', () => {
  it('meta が空のとき [] を返す', () => {
    expect(violationsByLevel(EMPTY_BREAKDOWN, [])).toEqual([])
  })

  it('同一レベルの制約が複数あるとき count を合算する', () => {
    const meta1: ConstraintMeta = { key: 'front_preferred_violation', label: '', description: '', weight: 3, priorityLevel: 5 }
    const meta2: ConstraintMeta = { key: 'back_preferred_violation', label: '', description: '', weight: 3, priorityLevel: 5 }
    const breakdown: ScoreBreakdown = { ...EMPTY_BREAKDOWN, front_preferred_violation: 1, back_preferred_violation: 2 }
    expect(violationsByLevel(breakdown, [meta1, meta2])).toEqual([{ level: 5, count: 3 }])
  })

  it('toggles でオフの制約はレベルマップから除外される', () => {
    const meta: ConstraintMeta = { key: 'loneliness_violation', label: '', description: '', weight: 2, priorityLevel: 4 }
    const breakdown: ScoreBreakdown = { ...EMPTY_BREAKDOWN, loneliness_violation: 5 }
    const toggles: ConstraintToggles = { gender_balance: true, loneliness: false, differ_seat: true, differ_neighbor: true, differ_group: true }
    expect(violationsByLevel(breakdown, [meta], toggles)).toEqual([])
  })

  it('priorityLevel=null のハード制約は計上されない', () => {
    expect(violationsByLevel({ ...EMPTY_BREAKDOWN, fixed_violation: 3 }, [HARD_FIXED_META])).toEqual([])
  })
})
