'use client'

import { useState, useRef, useMemo } from 'react'
import {
  DndContext,
  DragOverlay,
  useSensors,
  useSensor,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  type DragEndEvent,
} from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { generateSeats } from '@/lib/seats'
import { CONSTRAINT_META } from '@/lib/constraintLabels'
import SeatingGrid from './SeatingGrid'
import ScoreBreakdownTable from './ScoreBreakdownTable'
import type {
  AssignmentResult,
  Student,
  Group,
  FixedConstraint,
  ForbiddenConstraint,
  SeatGenderConstraint,
  RelativeFixedConstraint,
  PrevAssignment,
  ConstraintToggles,
  ScoreBreakdown,
  LeaderGroup,
} from '@/types'

interface Props {
  numRows: number
  numCols: number
  frontRows: number[]
  backRows?: number[]
  assignments: AssignmentResult[]
  students: Student[]
  scoreBreakdown: ScoreBreakdown | null
  scoreTotal: number
  groups?: Group[]
  fixedConstraints?: FixedConstraint[]
  forbiddenConstraints?: ForbiddenConstraint[]
  seatGenderConstraints?: SeatGenderConstraint[]
  relativeFixedConstraints?: RelativeFixedConstraint[]
  prevAssign?: PrevAssignment[]
  /** 制約空席（seat.emptySeats）の座標リスト: ドラッグ&ドロップ不可にする */
  emptySeats?: { row: number; col: number }[]
  /** DnD モード: true のとき座席をドラッグ&ドロップで交換できる */
  draggable?: boolean
  /** DnD でスワップした際のコールバック */
  onSeatSwap?: (seatIdA: number, seatIdB: number) => void
  /** タップ交換モード: ON のとき DnD ではなくタップ2回で交換（モバイル向け） */
  tapMode?: boolean
  /** 最後の solve 実行時の制約トグル状態（有効/無効表示に使用） */
  constraintToggles?: ConstraintToggles
  leaderGroups?: LeaderGroup[]
  /** true のとき showLabel=false のグループも含め全グループ名を表示（実行・調整画面用） */
  showAllLeaderGroups?: boolean
  /** true のとき: セル内バッジ・! マーカー・ツールチップ・制約テーブルの i アイコンを表示する */
  showViolationDetail?: boolean
}

export default function SeatingResult({
  numRows,
  numCols,
  frontRows,
  backRows = [],
  assignments,
  students,
  scoreBreakdown,
  scoreTotal,
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
  onSeatSwap,
  tapMode = false,
  constraintToggles,
  showViolationDetail = false,
}: Props) {
  const constraintMeta = CONSTRAINT_META

  const [activeId, setActiveId] = useState<number | null>(null)
  // ドロップ先セルのビューポート座標（dropAnimation.keyframes で参照）
  const dropTargetRectRef = useRef<{ left: number; top: number } | null>(null)
  // 入れ替わる学生の FLIP アニメーション情報
  const [flipAnim, setFlipAnim] = useState<{ seatId: number; dx: number; dy: number } | null>(null)
  // タップ交換モードで選択中の座席
  const [selectedSeatId, setSelectedSeatId] = useState<number | null>(null)

  function handleSeatTap(seatId: number) {
    if (selectedSeatId === null) {
      setSelectedSeatId(seatId)
      return
    }
    if (selectedSeatId === seatId) {
      setSelectedSeatId(null)
      return
    }
    onSeatSwap?.(selectedSeatId, seatId)
    setSelectedSeatId(null)
  }

  // seat_id → student のマップ（DnD ハンドラ・DragOverlay 用）
  const seats = generateSeats(numRows, numCols)
  const seatToStudent = useMemo(() => {
    const map = new Map<number, Student>()
    for (const a of assignments) {
      const student = students.find((s) => s.id === a.student_id)
      if (student) map.set(a.seat_id, student)
    }
    return map
  }, [assignments, students])

  // DnD センサー設定（PC マウス + タッチ対応）
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    // Enter/Space でドラッグ開始、矢印キーで移動（キーボード操作対応）
    useSensor(KeyboardSensor),
  )

  function handleDragStart(event: { active: { id: string | number } }) {
    const id = Number(event.active.id)
    if (isNaN(id)) return
    setActiveId(id)
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    // ドロップ先の座標を先に保存（dropAnimation.keyframes が参照する）
    dropTargetRectRef.current = over ? { left: over.rect.left, top: over.rect.top } : null
    if (over && active.id !== over.id) {
      // over 側に学生がいる場合のみ FLIP アニメーションを設定
      const activeRect = active.rect.current.initial
      if (activeRect && seatToStudent.has(Number(over.id))) {
        setFlipAnim({
          seatId: Number(active.id),
          dx: over.rect.left - activeRect.left,
          dy: over.rect.top - activeRect.top,
        })
      }
      onSeatSwap?.(Number(active.id), Number(over.id))
    }
    setActiveId(null)
  }

  // アクティブドラッグ中の学生（DragOverlay 用）
  const activeStudent = activeId != null ? seatToStudent.get(activeId) : undefined

  return (
    <div className="space-y-4">
      {/* 座席グリッド（DnD コンテキストで囲む。tapMode のときセンサーを無効化してタップ交換に切り替え） */}
      <DndContext
        sensors={tapMode ? [] : sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <SeatingGrid
          numRows={numRows}
          numCols={numCols}
          frontRows={frontRows}
          backRows={backRows}
          assignments={assignments}
          students={students}
          groups={groups}
          fixedConstraints={fixedConstraints}
          forbiddenConstraints={forbiddenConstraints}
          seatGenderConstraints={seatGenderConstraints}
          relativeFixedConstraints={relativeFixedConstraints}
          prevAssign={prevAssign}
          leaderGroups={leaderGroups}
          showAllLeaderGroups={showAllLeaderGroups}
          emptySeats={emptySeats}
          draggable={draggable}
          showViolationDetail={showViolationDetail}
          constraintToggles={constraintToggles}
          flipAnim={flipAnim}
          onFlipDone={() => setFlipAnim(null)}
          tapMode={tapMode}
          selectedSeatId={selectedSeatId}
          onSeatTap={handleSeatTap}
        />
        <DragOverlay dropAnimation={{
          duration: 250,
          easing: 'ease-out',
          keyframes({ transform, dragOverlay }) {
            const overRect = dropTargetRectRef.current
            const initial = CSS.Transform.toString(transform.initial)
            if (overRect) {
              // ドロップ先セルへスライドしてフェードアウト
              const dx = overRect.left - dragOverlay.rect.left
              const dy = overRect.top - dragOverlay.rect.top
              const final = CSS.Transform.toString({
                x: transform.initial.x + dx,
                y: transform.initial.y + dy,
                scaleX: transform.initial.scaleX,
                scaleY: transform.initial.scaleY,
              })
              return [
                { transform: initial, opacity: 0.9, offset: 0 },
                { transform: final, opacity: 0.9, offset: 0.7 },
                { transform: final, opacity: 0, offset: 1 },
              ]
            }
            // ドロップ先なし（キャンセル）はその場でフェードアウト
            return [
              { transform: initial, opacity: 0.9 },
              { transform: initial, opacity: 0 },
            ]
          },
        }}>
          {activeId !== null && (
            <div className="w-20 h-16 rounded-sm border bg-white shadow-lg text-xs flex items-center justify-center font-medium text-slate-800 opacity-90">
              {activeStudent ? activeStudent.name : '空席'}
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {/* 制約違反テーブル */}
      {scoreBreakdown !== null && (
        <ScoreBreakdownTable
          scoreBreakdown={scoreBreakdown}
          constraintMeta={constraintMeta}
          constraintToggles={constraintToggles}
          showViolationDetail={showViolationDetail}
        />
      )}
    </div>
  )
}
