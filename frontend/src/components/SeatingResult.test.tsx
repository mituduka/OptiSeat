import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import SeatingResult from './SeatingResult'
import type { ScoreBreakdown } from '@/types'

// DragOverlay に渡された props を検証用にキャプチャ
let capturedDragOverlayProps: Record<string, unknown> = {}

// @dnd-kit は JSDOM で動作しないためモック
vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DragOverlay: (props: Record<string, unknown>) => {
    capturedDragOverlayProps = props
    return null
  },
  useDraggable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    isDragging: false,
    transform: null,
  }),
  useDroppable: () => ({ setNodeRef: vi.fn(), isOver: false }),
  useSensors: () => [],
  useSensor: vi.fn(),
  PointerSensor: class {},
  TouchSensor: class {},
  KeyboardSensor: class {},
}))
vi.mock('@dnd-kit/utilities', () => ({
  CSS: { Transform: { toString: () => '' }, Translate: { toString: () => '' } },
}))

const ZERO_BREAKDOWN: ScoreBreakdown = {
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

const BASE_PROPS = {
  numRows: 1,
  numCols: 1,
  frontRows: [],
  assignments: [{ student_id: 1, seat_id: 1 }],
  students: [{ id: 1, name: 'テスト', gender: 'male' as const, tags: [] }],
  scoreBreakdown: ZERO_BREAKDOWN,
  scoreTotal: 0,
}

// ---------------------------------------------------------------------------

describe('SeatingResult ScoreBreakdownTable の表示制御', () => {
  it('scoreBreakdown が非 null のとき制約違反テーブルを表示する', () => {
    render(<SeatingResult {...BASE_PROPS} scoreBreakdown={ZERO_BREAKDOWN} />)
    expect(screen.getByText('制約違反')).toBeInTheDocument()
  })

  it('scoreBreakdown が null のとき制約違反テーブルを表示しない', () => {
    render(<SeatingResult {...BASE_PROPS} scoreBreakdown={null} />)
    expect(screen.queryByText('制約違反')).not.toBeInTheDocument()
  })
})

describe('SeatingResult 座席グリッドの表示', () => {
  it('グリッドの「黒板（前）」ラベルを常に表示する', () => {
    render(<SeatingResult {...BASE_PROPS} />)
    expect(screen.getByText('黒板（前）')).toBeInTheDocument()
  })

  it('学生名がグリッドに表示される', () => {
    render(<SeatingResult {...BASE_PROPS} />)
    expect(screen.getByText('テスト')).toBeInTheDocument()
  })
})

describe('SeatingResult DragOverlay の dropAnimation', () => {
  it('sideEffects を null にしてドラッグ元セルを隠さない（FLIP スライドを可視に保つ）', () => {
    // dnd-kit デフォルトの sideEffects はドロップアニメ中アクティブノードを
    // opacity:0 にするが、そのセルには交換相手が FLIP でスライドしてくるため、
    // 隠すとスライドアニメーションが丸ごと不可視になる
    render(<SeatingResult {...BASE_PROPS} draggable />)
    const dropAnimation = capturedDragOverlayProps.dropAnimation as { sideEffects: unknown }
    expect(dropAnimation.sideEffects).toBeNull()
  })
})
