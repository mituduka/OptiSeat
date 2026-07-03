'use client'

import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Pin } from 'lucide-react'
import { generateSeats } from '@/lib/seats'
import { getGroupStyle } from '@/lib/groupColors'
import { violationText } from '@/lib/constraintLabels'
import GridScrollArea from '@/components/GridScrollArea'
import { DraggableSeat } from './DraggableSeat'
import type {
  AssignmentResult,
  Student,
  SeatInput,
  Group,
  FixedConstraint,
  ForbiddenConstraint,
  SeatGenderConstraint,
  RelativeFixedConstraint,
  PrevAssignment,
  ConstraintToggles,
  LeaderGroup,
} from '@/types'

interface SeatingGridProps {
  numRows: number
  numCols: number
  frontRows: number[]
  backRows?: number[]
  assignments: AssignmentResult[]
  students: Student[]
  groups?: Group[]
  fixedConstraints?: FixedConstraint[]
  forbiddenConstraints?: ForbiddenConstraint[]
  seatGenderConstraints?: SeatGenderConstraint[]
  relativeFixedConstraints?: RelativeFixedConstraint[]
  prevAssign?: PrevAssignment[]
  emptySeats?: { row: number; col: number }[]
  leaderGroups?: LeaderGroup[]
  showAllLeaderGroups?: boolean
  draggable?: boolean
  showViolationDetail?: boolean
  constraintToggles?: ConstraintToggles
  flipAnim: { seatId: number; dx: number; dy: number } | null
  onFlipDone: () => void
  /** タップ交換モード: ON のときセルクリックで選択・交換 */
  tapMode?: boolean
  /** タップ交換モードで選択中のセル ID */
  selectedSeatId?: number | null
  /** タップ交換モードでセルがクリックされたときのコールバック */
  onSeatTap?: (seatId: number) => void
}

export default function SeatingGrid({
  numRows,
  numCols,
  frontRows,
  backRows = [],
  assignments,
  students,
  groups = [],
  fixedConstraints = [],
  forbiddenConstraints = [],
  seatGenderConstraints = [],
  relativeFixedConstraints = [],
  prevAssign = [],
  leaderGroups = [],
  showAllLeaderGroups = false,
  emptySeats = [],
  draggable = false,
  showViolationDetail = false,
  constraintToggles,
  flipAnim,
  onFlipDone,
  tapMode = false,
  selectedSeatId = null,
  onSeatTap,
}: SeatingGridProps) {
  const [tooltip, setTooltip] = useState<{ texts: string[]; x: number; y: number } | null>(null)

  // FLIP 用オフセットは参照を安定させる。毎レンダー新規オブジェクトを渡すと、
  // ツールチップ表示（setTooltip）の再レンダーで DraggableSeat 側の
  // アニメーション effect が再発火し、途中のアニメーションが最初からやり直しになる
  const flipDelta = useMemo(
    () => (flipAnim ? { x: flipAnim.dx, y: flipAnim.dy } : null),
    [flipAnim],
  )

  const seats = generateSeats(numRows, numCols)

  // seat_id → student のマップ
  const seatToStudent = new Map<number, Student>()
  for (const a of assignments) {
    const student = students.find((s) => s.id === a.student_id)
    if (student) seatToStudent.set(a.seat_id, student)
  }

  // seatById マップ（矢印描画用）
  const seatById = new Map<number, SeatInput>(seats.map((s) => [s.id, s]))
  // student_id → SeatInput マップ（矢印描画用）
  const studentSeat = new Map<number, SeatInput>()
  for (const a of assignments) {
    const seat = seatById.get(a.seat_id)
    if (seat) studentSeat.set(a.student_id, seat)
  }

  // セル座標ヘルパー（SVG 矢印描画用）
  const CELL_W = 80, CELL_H = 64, GAP_CELL = 2, LABEL_W = 32, LABEL_GAP = 2, ROW_GAP = 8
  const ARROW_INSET = 10  // 始点をセル辺から内側にオフセットする量（px）
  const cellX = (col: number) => LABEL_W + LABEL_GAP + (col - 1) * (CELL_W + GAP_CELL)
  const cellY = (row: number) => (row - 1) * (CELL_H + ROW_GAP)
  const edgeFrom = (row: number, col: number, dRow: number, dCol: number) => ({
    x: dCol === 1 ? cellX(col) + CELL_W - ARROW_INSET : dCol === -1 ? cellX(col) + ARROW_INSET : cellX(col) + CELL_W / 2,
    y: dRow === 1 ? cellY(row) + CELL_H - ARROW_INSET : dRow === -1 ? cellY(row) + ARROW_INSET : cellY(row) + CELL_H / 2,
  })
  const edgeTo = (row: number, col: number, dRow: number, dCol: number) => ({
    x: dCol === 1 ? cellX(col) : dCol === -1 ? cellX(col) + CELL_W : cellX(col) + CELL_W / 2,
    y: dRow === 1 ? cellY(row) : dRow === -1 ? cellY(row) + CELL_H : cellY(row) + CELL_H / 2,
  })

  // student_id → seat_id のマップ（ツールチップ違反チェック用）
  const studentToSeat = new Map<number, number>()
  for (const a of assignments) studentToSeat.set(a.student_id, a.seat_id)

  // 8方向隣接チェック（斜め含む）
  function isAdjacent8(seatIdA: number, seatIdB: number): boolean {
    const a = seatById.get(seatIdA), b = seatById.get(seatIdB)
    if (!a || !b) return false
    return Math.abs(a.row - b.row) <= 1 && Math.abs(a.col - b.col) <= 1 && seatIdA !== seatIdB
  }
  // 同班チェック
  function isSameGroup(seatIdA: number, seatIdB: number): boolean {
    const sA = seatById.get(seatIdA), sB = seatById.get(seatIdB)
    if (!sA || !sB) return false
    return groups.some((g) =>
      g.seatCoords.some((c) => c.row === sA.row && c.col === sA.col) &&
      g.seatCoords.some((c) => c.row === sB.row && c.col === sB.col),
    )
  }

  // 前回横隣ペアのセット（"minId,maxId" 形式）
  const prevNeighborPairSet = new Set<string>()
  if (prevAssign.length > 0) {
    const prevStudentToSeat = new Map(prevAssign.map((p) => [p.student_id, (p.row - 1) * numCols + p.col]))
    for (const [s1, sid1] of prevStudentToSeat) {
      const sd1 = seatById.get(sid1)
      if (!sd1) continue
      for (const [s2, sid2] of prevStudentToSeat) {
        if (s1 >= s2) continue
        const sd2 = seatById.get(sid2)
        if (!sd2) continue
        if (sd1.row === sd2.row && Math.abs(sd1.col - sd2.col) === 1) prevNeighborPairSet.add(`${s1},${s2}`)
      }
    }
  }

  // 現在と前回で班構成が一致するグループIDのセット
  const prevGroupSameIds = new Set<number>()
  if (prevAssign.length > 0) {
    for (const group of groups) {
      const groupSeatIds = new Set(group.seatCoords.map(({ row, col }) => (row - 1) * numCols + col))
      const prevMembers = new Set(prevAssign.filter((p) => groupSeatIds.has((p.row - 1) * numCols + p.col)).map((p) => p.student_id))
      const curMembers = new Set<number>()
      for (const sid of groupSeatIds) { const s = seatToStudent.get(sid); if (s) curMembers.add(s.id) }
      if (prevMembers.size > 0 && prevMembers.size === curMembers.size && [...prevMembers].every((id) => curMembers.has(id)))
        prevGroupSameIds.add(group.groupId)
    }
  }

  // 行ごとにグルーピング
  const rows: SeatInput[][] = []
  for (let r = 1; r <= numRows; r++) {
    rows.push(seats.filter((s) => s.row === r))
  }

  return (
    <>
      <div className="card p-4">
        <GridScrollArea innerClassName="flex flex-col gap-2">
            <div className="w-full text-center text-xs text-ink-muted border-b-4 border-ink-soft pb-1 mb-1">
              黒板（前）
            </div>

            {/* 列番号ヘッダー */}
            <div className="flex items-center gap-0.5">
              <span className="w-8 shrink-0" />
              <div className="flex gap-0.5">
                {Array.from({ length: numCols }, (_, i) => i + 1).map((c) => (
                  <span key={c} className="w-20 text-center text-xs text-slate-400 font-medium">
                    {c}列
                  </span>
                ))}
              </div>
            </div>

            <div style={{ position: 'relative' }} className="flex flex-col gap-2">
              {(relativeFixedConstraints.length > 0 || forbiddenConstraints.length > 0) && (() => {
                const svgW = LABEL_W + LABEL_GAP + numCols * CELL_W + (numCols - 1) * GAP_CELL
                const svgH = numRows * CELL_H + (numRows - 1) * ROW_GAP
                const X_SIZE = 5
                const forbiddenLines = forbiddenConstraints.flatMap((fc, fi) => {
                  const seatA = studentSeat.get(fc.studentIdA)
                  const seatB = studentSeat.get(fc.studentIdB)
                  if (!seatA || !seatB) return []
                  const violated =
                    fc.type === 'adjacent8' ? isAdjacent8(seatA.id, seatB.id) :
                    fc.type === 'same_group' ? isSameGroup(seatA.id, seatB.id) : false
                  if (!violated) return []
                  const ax = cellX(seatA.col) + CELL_W / 2, ay = cellY(seatA.row) + CELL_H / 2
                  const bx = cellX(seatB.col) + CELL_W / 2, by = cellY(seatB.row) + CELL_H / 2
                  // 線を中央 50% のみ描画（両端 25% をカット）
                  const lx1 = ax + 0.25 * (bx - ax), ly1 = ay + 0.25 * (by - ay)
                  const lx2 = ax + 0.75 * (bx - ax), ly2 = ay + 0.75 * (by - ay)
                  const mx = (ax + bx) / 2, my = (ay + by) / 2
                  return [
                    <line key={`fl-${fi}`} x1={lx1} y1={ly1} x2={lx2} y2={ly2}
                      stroke="#ea580c" strokeWidth={1.5} opacity={0.7} />,
                    <line key={`fx1-${fi}`} x1={mx - X_SIZE} y1={my - X_SIZE} x2={mx + X_SIZE} y2={my + X_SIZE}
                      stroke="#ea580c" strokeWidth={2} opacity={0.9} />,
                    <line key={`fx2-${fi}`} x1={mx - X_SIZE} y1={my + X_SIZE} x2={mx + X_SIZE} y2={my - X_SIZE}
                      stroke="#ea580c" strokeWidth={2} opacity={0.9} />,
                  ]
                })
                const arrows = relativeFixedConstraints.flatMap((rf, i) => {
                  const seatA = studentSeat.get(rf.studentIdA)
                  if (!seatA) return []
                  const expectedRow = seatA.row + rf.dRow
                  const expectedCol = seatA.col + rf.dCol
                  const expectedInBounds = expectedRow >= 1 && expectedRow <= numRows && expectedCol >= 1 && expectedCol <= numCols
                  const seatB = studentSeat.get(rf.studentIdB)
                  const ok = expectedInBounds && seatB !== undefined && seatB.row === expectedRow && seatB.col === expectedCol

                  const from = edgeFrom(seatA.row, seatA.col, rf.dRow, rf.dCol)

                  if (ok) {
                    // 制約満足: A 辺 → B 辺（緑・実線）
                    const to = edgeTo(expectedRow, expectedCol, rf.dRow, rf.dCol)
                    return [
                      <line key={i} x1={from.x} y1={from.y} x2={to.x} y2={to.y}
                        stroke="#439d73" strokeWidth={2} markerEnd="url(#rf-arrow-g)" opacity={0.7} />,
                    ]
                  } else if (seatB) {
                    // 制約違反: A 辺 → B の実際位置の最近辺（赤・点線）
                    const dRow_ab = Math.sign(seatB.row - seatA.row)
                    const dCol_ab = Math.sign(seatB.col - seatA.col)
                    const to = edgeTo(seatB.row, seatB.col, dRow_ab, dCol_ab)
                    return [
                      <line key={i} x1={from.x} y1={from.y} x2={to.x} y2={to.y}
                        stroke="#bf4040" strokeWidth={2} strokeDasharray="6 3" markerEnd="url(#rf-arrow-r)" opacity={0.7} />,
                    ]
                  } else if (expectedInBounds) {
                    // B 未配置: 期待セル辺まで（赤・点線）
                    const to = edgeTo(expectedRow, expectedCol, rf.dRow, rf.dCol)
                    return [
                      <line key={i} x1={from.x} y1={from.y} x2={to.x} y2={to.y}
                        stroke="#bf4040" strokeWidth={2} strokeDasharray="6 3" markerEnd="url(#rf-arrow-r)" opacity={0.7} />,
                    ]
                  } else {
                    return []
                  }
                })
                return (
                  <svg
                    className="print:hidden"
                    width={svgW}
                    height={svgH}
                    style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none', overflow: 'visible', zIndex: 20 }}
                  >
                    <defs>
                      <marker id="rf-arrow-g" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto" markerUnits="userSpaceOnUse">
                        <polygon points="0 0, 8 3, 0 6" fill="#439d73" />
                      </marker>
                      <marker id="rf-arrow-r" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto" markerUnits="userSpaceOnUse">
                        <polygon points="0 0, 8 3, 0 6" fill="#bf4040" />
                      </marker>
                    </defs>
                    {forbiddenLines}
                    {arrows}
                  </svg>
                )
              })()}
            {rows.map((rowSeats, ri) => {
              const rowNum = ri + 1
              const isFront = frontRows.includes(rowNum)
              const isBack = backRows.includes(rowNum)
              return (
                <div key={rowNum} className="flex items-center gap-0.5">
                  {/* 行番号ラベル */}
                  <span className="w-8 text-xs text-center font-medium shrink-0 text-slate-400">
                    {rowNum}行
                  </span>
                  <div className="flex gap-0.5">
                    {rowSeats.map((seat) => {
                      const student = seatToStudent.get(seat.id)
                      const isEmpty = !student
                      // 制約空席（seat.emptySeats）判定: ドラッグ&ドロップ禁止
                      const isExcluded = emptySeats.some((c) => c.row === seat.row && c.col === seat.col)

                      // 班色（座標ベース検索）
                      const seatGroup = groups.find((g) =>
                        g.seatCoords.some((c) => c.row === seat.row && c.col === seat.col),
                      )
                      const seatGroupId = seatGroup?.groupId
                      const groupStyle: React.CSSProperties = seatGroupId !== undefined
                        ? (() => { const gs = getGroupStyle(seatGroupId); return { backgroundColor: gs.backgroundColor, borderColor: gs.borderColor } })()
                        : {}

                      // 男女の背景色
                      const genderBg = student?.gender === 'male' ? 'bg-blue-100' : 'bg-rose-100'

                      // バッジ計算・違反テキスト収集（showViolationDetail=true のときのみ）
                      const badges: Array<{ label: React.ReactNode; ok: boolean }> = []
                      const violationTexts: string[] = []

                      if (student && showViolationDetail) {
                        // ①固定バッジ + 違反テキスト
                        const fixedC = fixedConstraints.find((f) => f.studentId === student.id)
                        if (fixedC) {
                          const fixedOk = fixedC.row === seat.row && fixedC.col === seat.col
                          badges.push({ label: <Pin size={9} className="block" />, ok: fixedOk })
                          if (!fixedOk) violationTexts.push(violationText.fixedMismatch(fixedC.row, fixedC.col, seat.row, seat.col))
                        }

                        // ②前側配慮バッジ + 違反テキスト
                        if (student.tags.includes('front_preferred')) {
                          badges.push({ label: '前', ok: frontRows.includes(seat.row) })
                          if (!frontRows.includes(seat.row)) violationTexts.push(violationText.frontPreferred())
                        }

                        // ③後側配慮バッジ + 違反テキスト
                        if (student.tags.includes('back_preferred')) {
                          badges.push({ label: '後', ok: backRows.includes(seat.row) })
                          if (!backRows.includes(seat.row)) violationTexts.push(violationText.backPreferred())
                        }

                        // ④隣接禁止違反テキスト
                        const forbViolations = forbiddenConstraints
                          .filter((f) => {
                            if (f.studentIdA !== student.id && f.studentIdB !== student.id) return false
                            const otherId = f.studentIdA === student.id ? f.studentIdB : f.studentIdA
                            const otherSeatId = studentToSeat.get(otherId)
                            if (otherSeatId === undefined) return false
                            const t = f.type ?? 'adjacent8'
                            if (t === 'same_group') return isSameGroup(seat.id, otherSeatId)
                            return isAdjacent8(seat.id, otherSeatId)
                          })
                          .map((f) => {
                            const otherId = f.studentIdA === student.id ? f.studentIdB : f.studentIdA
                            const other = students.find((s) => s.id === otherId)
                            return violationText.forbiddenViolation(f.type ?? 'adjacent8', student.name, other?.name ?? `ID${otherId}`)
                          })
                        violationTexts.push(...forbViolations)

                        // ⑤同性ピアなし（横隣∪同班）— トグル OFF 時は非表示
                        if (constraintToggles?.loneliness !== false) {
                          const adjacentSameGender = seats.filter((s) => s.row === seat.row && Math.abs(s.col - seat.col) === 1)
                            .some((s) => { const n = seatToStudent.get(s.id); return n && n.gender === student.gender })
                          const groupSameGender = seatGroup
                            ? seats.filter((s) => seatGroup.seatCoords.some((c) => c.row === s.row && c.col === s.col) && s.id !== seat.id)
                              .some((s) => { const m = seatToStudent.get(s.id); return m && m.gender === student.gender })
                            : false
                          if (!adjacentSameGender && !groupSameGender) violationTexts.push(violationText.lonelinessViolation())
                        }

                        // ⑥班内男女偏り — トグル OFF 時は非表示
                        if (seatGroup && constraintToggles?.gender_balance !== false) {
                          const groupStudents = seats
                            .filter((s) => seatGroup.seatCoords.some((c) => c.row === s.row && c.col === s.col))
                            .map((s) => seatToStudent.get(s.id)).filter((s): s is Student => s !== undefined)
                          const males = groupStudents.filter((s) => s.gender === 'male').length
                          const females = groupStudents.filter((s) => s.gender === 'female').length
                          if (groupStudents.length > 0 && (males === 0 || females === 0)) violationTexts.push(violationText.groupGenderImbalance(seatGroup.groupId))
                        }

                        // ⑦前回同席（differ_seat=false なら警告スキップ）
                        const prevEntry = prevAssign.find((p) => p.student_id === student.id)
                        const prevSeatId = prevEntry ? (prevEntry.row - 1) * numCols + prevEntry.col : undefined
                        if (prevSeatId !== undefined && prevSeatId === seat.id && (constraintToggles === undefined || constraintToggles.differ_seat))
                          violationTexts.push(violationText.prevSameSeat())

                        // ⑧性別配置制約違反
                        const genderC = seatGenderConstraints.find((c) => c.row === seat.row && c.col === seat.col)
                        if (genderC && student.gender !== genderC.allowedGender)
                          violationTexts.push(violationText.genderConstraintViolation(genderC.allowedGender))

                        // ⑨隣接固定制約違反
                        for (const rf of relativeFixedConstraints.filter((c) => c.studentIdA === student.id)) {
                          const expectedSeat = seats.find((s) => s.row === seat.row + rf.dRow && s.col === seat.col + rf.dCol)
                          const actualStudent = expectedSeat ? seatToStudent.get(expectedSeat.id) : undefined
                          const bName = students.find((s) => s.id === rf.studentIdB)?.name ?? `ID${rf.studentIdB}`
                          if (!expectedSeat) violationTexts.push(violationText.relativeFixedOutOfRange(bName))
                          else if (!actualStudent || actualStudent.id !== rf.studentIdB) violationTexts.push(violationText.relativeFixedMissing(bName))
                        }

                        // ⑩前回横隣一致（differ_neighbor=false なら警告スキップ）
                        if (prevAssign.length > 0 && (constraintToggles === undefined || constraintToggles.differ_neighbor)) {
                          for (const ns of seats.filter((s) => s.row === seat.row && Math.abs(s.col - seat.col) === 1)) {
                            const neighbor = seatToStudent.get(ns.id)
                            if (!neighbor) continue
                            const pairKey = `${Math.min(student.id, neighbor.id)},${Math.max(student.id, neighbor.id)}`
                            if (prevNeighborPairSet.has(pairKey)) violationTexts.push(violationText.prevNeighborSame(neighbor.name))
                          }
                        }

                        // ⑪前回同班（differ_group=false なら警告スキップ）
                        if (prevAssign.length > 0 && seatGroup && prevGroupSameIds.has(seatGroup.groupId) && (constraintToggles === undefined || constraintToggles.differ_group))
                          violationTexts.push(violationText.prevGroupSame(seatGroup.groupId))

                        // ⑫ 班分散グループ違反
                        if (leaderGroups.length > 0 && seatGroup) {
                          for (const lg of leaderGroups) {
                            if (!lg.studentIds.includes(student.id)) continue
                            for (const otherId of lg.studentIds) {
                              if (otherId === student.id) continue
                              const otherSeatId = studentToSeat.get(otherId)
                              if (otherSeatId == null) continue
                              const otherSeat = seats.find((s) => s.id === otherSeatId)
                              if (!otherSeat) continue
                              if (seatGroup.seatCoords.some((c) => c.row === otherSeat.row && c.col === otherSeat.col)) {
                                const other = students.find((s) => s.id === otherId)
                                if (other) violationTexts.push(violationText.leaderGroupViolation(lg.name, other.name))
                              }
                            }
                          }
                        }
                      }

                      const cellClassName = [
                        'w-20 h-16 rounded-sm border text-xs flex flex-col items-center justify-center gap-0.5 p-1 relative overflow-hidden',
                        isExcluded
                          ? 'bg-slate-100 border-slate-200 text-slate-300'
                          : isEmpty
                            ? 'bg-slate-50 border-slate-200 text-slate-300'
                            : seatGroupId !== undefined
                              ? 'border'
                              : 'bg-white border-slate-200',
                      ].join(' ')

                      return (
                        <DraggableSeat
                          key={seat.id}
                          seatId={seat.id}
                          isDraggable={draggable && !isExcluded && !tapMode}
                          isDropDisabled={isExcluded}
                          flipDelta={flipAnim?.seatId === seat.id ? flipDelta : null}
                          onFlipDone={onFlipDone}
                          style={!isEmpty && !isExcluded ? groupStyle : {}}
                          className={cellClassName}
                          onTap={tapMode && !isExcluded ? () => onSeatTap?.(seat.id) : undefined}
                          isSelected={tapMode && selectedSeatId === seat.id}
                          onMouseEnter={showViolationDetail ? (e) => {
                            if (violationTexts.length > 0) {
                              const rect = e.currentTarget.getBoundingClientRect()
                              setTooltip({ texts: violationTexts, x: rect.left + rect.width / 2, y: rect.top })
                            }
                          } : undefined}
                          onMouseLeave={showViolationDetail ? () => setTooltip(null) : undefined}
                          focusable={showViolationDetail && violationTexts.length > 0}
                          ariaLabel={showViolationDetail && student && violationTexts.length > 0
                            ? `${student.name}。違反: ${violationTexts.join('。')}`
                            : undefined}
                          onFocus={showViolationDetail && violationTexts.length > 0 ? (e) => {
                            const rect = e.currentTarget.getBoundingClientRect()
                            setTooltip({ texts: violationTexts, x: rect.left + rect.width / 2, y: rect.top })
                          } : undefined}
                          onBlur={showViolationDetail ? () => setTooltip(null) : undefined}
                          onKeyDown={showViolationDetail ? (e) => {
                            if (e.key === 'Escape') setTooltip(null)
                          } : undefined}
                        >
                          {isExcluded ? (
                            <span className="text-slate-300 text-[10px]">空席（指定）</span>
                          ) : isEmpty ? (
                            <span className="text-slate-300">空席</span>
                          ) : (
                            <>
                              {showViolationDetail && violationTexts.length > 0 && (
                                <div className="absolute top-0.5 left-0.5 w-3.5 h-3.5 bg-error rounded-full flex items-center justify-center z-10 pointer-events-none">
                                  <span className="text-white text-[8px] font-bold leading-none">!</span>
                                </div>
                              )}
                              {/* 氏名ゾーン: 固定高にして注釈の有無でセル間の氏名位置がずれないようにする */}
                              <div className="h-9 shrink-0 w-full flex items-center">
                                <span className={`font-medium text-center leading-tight text-slate-800 px-0.5 rounded-sm w-full line-clamp-2 ${genderBg}`}>
                                  {student.name}
                                </span>
                              </div>
                              {/* 注釈ゾーン: チップ・バッジを1行に統合し、あふれた分は非表示 */}
                              <div className="flex-1 min-h-0 w-full min-w-0 flex flex-wrap gap-0.5 justify-center content-start overflow-hidden">
                                {(() => {
                                  const names = leaderGroups.filter((lg) => (showAllLeaderGroups || lg.showLabel !== false) && lg.studentIds.includes(student.id)).map((lg) => lg.name)
                                  if (names.length === 0) return null
                                  // 表示後の最大文字数に応じて最大フォントを選択（2つ横並びを保証）
                                  const displayed = names.map((n) => n.length > 5 ? n.slice(0, 4) + '…' : n)
                                  const maxLen = Math.max(...displayed.map((n) => n.length))
                                  const textSize = maxLen >= 5 ? 'text-[6px]' : maxLen >= 4 ? 'text-[7px]' : 'text-[9px]'
                                  return displayed.map((label, i) => (
                                    <span key={names[i]} className={`${textSize} px-0.5 rounded-sm font-bold text-purple-700 bg-purple-100`}>
                                      {label}
                                    </span>
                                  ))
                                })()}
                                {badges.map((b, bi) => (
                                  <span
                                    key={bi}
                                    className={`text-[9px] px-0.5 rounded font-bold inline-flex items-center ${b.ok
                                      ? 'text-amber-800 bg-amber-100'
                                      : 'text-error-strong bg-error-soft'
                                      }`}
                                  >
                                    {b.label}
                                  </span>
                                ))}
                              </div>
                            </>
                          )}
                        </DraggableSeat>
                      )
                    })}
                  </div>
                  {/* 右側ラベル */}
                  {isFront && (
                    <span className="ml-1 text-xs text-amber-700 shrink-0">前側</span>
                  )}
                  {isBack && (
                    <span className="ml-1 text-xs text-teal-700 shrink-0">後側</span>
                  )}
                </div>
              )
            })}
            </div>
        </GridScrollArea>
      </div>

      {showViolationDetail && tooltip && createPortal(
        <div
          style={{
            position: 'fixed',
            top: tooltip.y,
            left: Math.max(200, Math.min(tooltip.x, window.innerWidth - 80)),
            transform: 'translate(-50%, calc(-100% - 4px))',
            zIndex: 9999,
          }}
          aria-hidden="true"
          className="bg-ink text-white text-sm rounded-sm px-2 py-1.5 max-w-xs pointer-events-none"
        >
          {tooltip.texts.map((t, i) => (
            <div key={i}>{t}</div>
          ))}
        </div>,
        document.body,
      )}
    </>
  )
}
