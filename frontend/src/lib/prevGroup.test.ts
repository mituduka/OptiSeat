import { describe, it, expect } from 'vitest'
import { findPrevGroupSameIds } from './prevGroup'
import type { Group, PrevAssignment } from '@/types'

// 2×2 教室: seat_id = (row-1)*2 + col。班1=座席{1,2}（1行目）、班2=座席{3,4}（2行目）
const NUM_COLS = 2
const GROUPS_2X2: Group[] = [
  { groupId: 1, seatCoords: [{ row: 1, col: 1 }, { row: 1, col: 2 }] },
  { groupId: 2, seatCoords: [{ row: 2, col: 1 }, { row: 2, col: 2 }] },
]

/** student_id → seat_id から座標ベースの前回配置を作る */
function prev(pairs: Record<number, number>): PrevAssignment[] {
  return Object.entries(pairs).map(([sid, seatId]) => ({
    student_id: Number(sid),
    row: Math.floor((seatId - 1) / NUM_COLS) + 1,
    col: ((seatId - 1) % NUM_COLS) + 1,
  }))
}

/** student_id → seat_id から今回の seat_id → student_id マップを作る */
function current(pairs: Record<number, number>): Map<number, number> {
  return new Map(Object.entries(pairs).map(([sid, seatId]) => [seatId, Number(sid)]))
}

const PREV_IDENTITY = prev({ 1: 1, 2: 2, 3: 3, 4: 4 })

describe('findPrevGroupSameIds', () => {
  it('班を丸ごと入れ替えた配置も前回同班として検出する', () => {
    const ids = findPrevGroupSameIds(GROUPS_2X2, PREV_IDENTITY, current({ 1: 3, 2: 4, 3: 1, 4: 2 }), NUM_COLS)
    expect([...ids].sort()).toEqual([1, 2])
  })

  it('同じ班の中で座席を入れ替えただけなら前回同班', () => {
    const ids = findPrevGroupSameIds(GROUPS_2X2, PREV_IDENTITY, current({ 1: 2, 2: 1, 3: 4, 4: 3 }), NUM_COLS)
    expect([...ids].sort()).toEqual([1, 2])
  })

  it('メンバーが混ざっていれば違反なし', () => {
    const ids = findPrevGroupSameIds(GROUPS_2X2, PREV_IDENTITY, current({ 1: 1, 2: 3, 3: 2, 4: 4 }), NUM_COLS)
    expect(ids.size).toBe(0)
  })

  it('空の前回班は比較対象にせず、空の今回班は違反にならない', () => {
    // 前回: 班1={1,2}、班2=空。今回: 班1=空、班2={1,2}
    const ids = findPrevGroupSameIds(GROUPS_2X2, prev({ 1: 1, 2: 2 }), current({ 1: 3, 2: 4 }), NUM_COLS)
    expect([...ids]).toEqual([2])
  })

  it('前回班の一部だけが揃っている班は違反にならない', () => {
    // 前回: 班1={1,2}、班2={3}。今回: 班1={3,4}、班2={1,2}
    const ids = findPrevGroupSameIds(GROUPS_2X2, prev({ 1: 1, 2: 2, 3: 3 }), current({ 1: 3, 2: 4, 3: 1, 4: 2 }), NUM_COLS)
    expect([...ids]).toEqual([2])
  })

  it('前回配置がなければ空集合', () => {
    const ids = findPrevGroupSameIds(GROUPS_2X2, [], current({ 1: 1, 2: 2, 3: 3, 4: 4 }), NUM_COLS)
    expect(ids.size).toBe(0)
  })
})
