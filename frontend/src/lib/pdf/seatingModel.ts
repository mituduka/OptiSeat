/**
 * 座席表データ（store 相当）を DOM 非依存の PDF 描画モデルに変換する。
 *
 * SeatingGrid.tsx の描画ロジック（React/DOM 依存）は流用せず、ここで純粋関数として
 * 座席→児童・生徒・班・班分散グループの対応を組み立てる。PDF と画面で同じ整形結果を保つため、
 * leaderGroup 名の省略ロジックは `truncateLeaderLabel` に集約する（SeatingGrid と同等）。
 */
import { generateSeats } from '@/lib/seats'
import type {
  AssignmentResult,
  Gender,
  Group,
  LeaderGroup,
  SeatSettings,
  Student,
} from '@/types'

export interface SeatCellModel {
  seatId: number
  row: number
  col: number
  /** 指定空席（emptySeats に含まれる）か */
  isExcluded: boolean
  /** 児童・生徒が配置されていない（空席）か */
  isEmpty: boolean
  studentName: string | null
  gender: Gender | null
  groupId: number | null
  /** 表示する班分散グループ名（省略済み） */
  leaderLabels: string[]
}

export interface SeatingModel {
  numRows: number
  numCols: number
  cells: SeatCellModel[]
}

export interface SeatingModelInput {
  students: Student[]
  seat: SeatSettings
  groups: Group[]
  leaderGroups: LeaderGroup[]
  assignments: AssignmentResult[]
}

/**
 * 班分散グループ名を表示用に省略する（SeatingGrid.tsx と同一ルール）。
 * 5 文字以上は先頭 4 文字 + … にする。
 */
export function truncateLeaderLabel(name: string): string {
  return name.length > 5 ? name.slice(0, 4) + '…' : name
}

export function buildSeatingModel(input: SeatingModelInput): SeatingModel {
  const { students, seat, groups, leaderGroups, assignments } = input
  const { numRows, numCols } = seat
  const seats = generateSeats(numRows, numCols)

  // seat_id → student
  const seatToStudent = new Map<number, Student>()
  for (const a of assignments) {
    const student = students.find((s) => s.id === a.student_id)
    if (student) seatToStudent.set(a.seat_id, student)
  }

  const cells: SeatCellModel[] = seats.map((s) => {
    const student = seatToStudent.get(s.id)
    const isExcluded = seat.emptySeats.some((c) => c.row === s.row && c.col === s.col)
    // 班色（座標ベース検索・SeatingGrid と同等）
    const seatGroup = groups.find((g) =>
      g.seatCoords.some((c) => c.row === s.row && c.col === s.col),
    )
    const leaderLabels = student
      ? leaderGroups
          .filter((lg) => lg.showLabel !== false && lg.studentIds.includes(student.id))
          .map((lg) => truncateLeaderLabel(lg.name))
      : []

    return {
      seatId: s.id,
      row: s.row,
      col: s.col,
      isExcluded,
      isEmpty: !student,
      studentName: student?.name ?? null,
      gender: student?.gender ?? null,
      groupId: seatGroup?.groupId ?? null,
      leaderLabels,
    }
  })

  return { numRows, numCols, cells }
}
