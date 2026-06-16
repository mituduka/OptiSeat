import { describe, it, expect } from 'vitest'
import { buildSeatingModel, truncateLeaderLabel } from './seatingModel'
import type { Group, LeaderGroup, SeatSettings, Student } from '@/types'

const students: Student[] = [
  { id: 1, name: '佐藤 健太', gender: 'male', tags: [] },
  { id: 2, name: '鈴木 美咲', gender: 'female', tags: [] },
]

const seat: SeatSettings = {
  numRows: 2,
  numCols: 2,
  frontRowCount: 1,
  backRowCount: 1,
  emptySeats: [{ row: 2, col: 2 }],
  numGroups: 1,
}

const groups: Group[] = [
  { groupId: 1, seatCoords: [{ row: 1, col: 1 }, { row: 1, col: 2 }] },
]

const leaderGroups: LeaderGroup[] = [
  { id: 'a', name: '班長', studentIds: [1], showLabel: true },
  { id: 'b', name: '消極的グループ', studentIds: [1], showLabel: false },
]

// seat_id: 1=(1,1) 2=(1,2) 3=(2,1) 4=(2,2)
const assignments = [
  { student_id: 1, seat_id: 1 },
  { student_id: 2, seat_id: 2 },
]

describe('truncateLeaderLabel', () => {
  it('5文字以下はそのまま', () => {
    expect(truncateLeaderLabel('班長')).toBe('班長')
    expect(truncateLeaderLabel('あいうえお')).toBe('あいうえお')
  })
  it('5文字超は先頭4文字+…', () => {
    expect(truncateLeaderLabel('消極的グループ')).toBe('消極的グ…')
  })
})

describe('buildSeatingModel', () => {
  const model = buildSeatingModel({ students, seat, groups, leaderGroups, assignments })

  it('全座席ぶんのセルを生成する', () => {
    expect(model.numRows).toBe(2)
    expect(model.numCols).toBe(2)
    expect(model.cells).toHaveLength(4)
  })

  it('seat→student 対応と gender を反映する', () => {
    const c1 = model.cells.find((c) => c.seatId === 1)!
    expect(c1.studentName).toBe('佐藤 健太')
    expect(c1.gender).toBe('male')
    expect(c1.isEmpty).toBe(false)
  })

  it('座標ベースで班 ID を解決する', () => {
    expect(model.cells.find((c) => c.seatId === 1)!.groupId).toBe(1)
    expect(model.cells.find((c) => c.seatId === 3)!.groupId).toBeNull()
  })

  it('指定空席は isExcluded、未配置は isEmpty', () => {
    const excluded = model.cells.find((c) => c.row === 2 && c.col === 2)!
    expect(excluded.isExcluded).toBe(true)
    const empty = model.cells.find((c) => c.seatId === 3)!
    expect(empty.isEmpty).toBe(true)
    expect(empty.isExcluded).toBe(false)
  })

  it('showLabel!==false の班分散グループのみ省略名で表示する', () => {
    const c1 = model.cells.find((c) => c.seatId === 1)!
    expect(c1.leaderLabels).toEqual(['班長']) // '消極的グループ' は showLabel:false で除外
  })

  it('未配置セルには leaderLabels を付けない', () => {
    expect(model.cells.find((c) => c.seatId === 3)!.leaderLabels).toEqual([])
  })
})
