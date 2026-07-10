import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import SeatingGrid from './SeatingGrid'
import type { Student } from '@/types'

// DraggableSeat が @dnd-kit を使うためモック
vi.mock('@dnd-kit/core', () => ({
  useDraggable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    isDragging: false,
    transform: null,
  }),
  useDroppable: () => ({ setNodeRef: vi.fn(), isOver: false }),
}))
vi.mock('@dnd-kit/utilities', () => ({
  CSS: { Translate: { toString: () => '' } },
}))

const MALE: Student = { id: 1, name: 'テスト太郎', gender: 'male', tags: [] }
const FEMALE: Student = { id: 2, name: 'テスト花子', gender: 'female', tags: [] }

// 2×2 グリッドの seat_id: (row-1)*numCols + col
// (1,1)→1  (1,2)→2  (2,1)→3  (2,2)→4
const BASE_PROPS = {
  numRows: 2,
  numCols: 2,
  frontRows: [1],
  backRows: [2] as number[],
  assignments: [] as { student_id: number; seat_id: number }[],
  students: [] as Student[],
  flipAnim: null as null,
  onFlipDone: vi.fn(),
}

// ---------------------------------------------------------------------------

describe('SeatingGrid 空席', () => {
  it('配置なしの座席は「空席」と表示する', () => {
    render(<SeatingGrid {...BASE_PROPS} />)
    // 2×2 = 4 座席すべてが空席
    expect(screen.getAllByText('空席')).toHaveLength(4)
  })

  it('emptySeats 指定の座席は「空席（指定）」と表示する', () => {
    render(
      <SeatingGrid
        {...BASE_PROPS}
        emptySeats={[{ row: 1, col: 1 }]}
      />,
    )
    expect(screen.getByText('空席（指定）')).toBeInTheDocument()
    // 残り 3 席は通常の空席
    expect(screen.getAllByText('空席')).toHaveLength(3)
  })
})

describe('SeatingGrid 学生の表示', () => {
  it('配置済みの学生名を表示する', () => {
    render(
      <SeatingGrid
        {...BASE_PROPS}
        students={[MALE]}
        assignments={[{ student_id: 1, seat_id: 1 }]}
      />,
    )
    expect(screen.getByText('テスト太郎')).toBeInTheDocument()
  })

  it('配置された座席以外は「空席」のままである', () => {
    render(
      <SeatingGrid
        {...BASE_PROPS}
        students={[MALE]}
        assignments={[{ student_id: 1, seat_id: 1 }]}
      />,
    )
    // 4 座席中 1 つに学生 → 残り 3 つが空席
    expect(screen.getAllByText('空席')).toHaveLength(3)
  })
})

describe('SeatingGrid ヘッダー・ラベル', () => {
  it('列番号ヘッダーを表示する', () => {
    render(<SeatingGrid {...BASE_PROPS} numCols={3} />)
    expect(screen.getByText('1列')).toBeInTheDocument()
    expect(screen.getByText('2列')).toBeInTheDocument()
    expect(screen.getByText('3列')).toBeInTheDocument()
  })

  it('行番号ラベルを表示する', () => {
    render(<SeatingGrid {...BASE_PROPS} />)
    expect(screen.getByText('1行')).toBeInTheDocument()
    expect(screen.getByText('2行')).toBeInTheDocument()
  })

  it('frontRows に含まれる行の右側に「前側」を表示する', () => {
    render(<SeatingGrid {...BASE_PROPS} frontRows={[1]} />)
    expect(screen.getByText('前側')).toBeInTheDocument()
  })

  it('backRows に含まれる行の右側に「後側」を表示する', () => {
    render(<SeatingGrid {...BASE_PROPS} backRows={[2]} />)
    expect(screen.getByText('後側')).toBeInTheDocument()
  })
})

describe('SeatingGrid 違反バッジ（showViolationDetail=true）', () => {
  it('front_preferred の学生が前列にいるとき「前」バッジをアンバーで表示する', () => {
    const student: Student = { ...MALE, tags: ['front_preferred'] }
    render(
      <SeatingGrid
        {...BASE_PROPS}
        students={[student]}
        assignments={[{ student_id: 1, seat_id: 1 }]}  // row=1 = frontRows
        showViolationDetail={true}
      />,
    )
    const badge = screen.getByText('前')
    // 充足時はアンバー系（配慮・制約注釈の統一色。基調の緑/性別の青と区別）
    expect(badge.className).toContain('bg-amber-100')
  })

  it('front_preferred の学生が前列でないとき「前」バッジを赤で表示する', () => {
    const student: Student = { ...MALE, tags: ['front_preferred'] }
    render(
      <SeatingGrid
        {...BASE_PROPS}
        students={[student]}
        assignments={[{ student_id: 1, seat_id: 3 }]}  // row=2 ≠ frontRows
        showViolationDetail={true}
      />,
    )
    const badge = screen.getByText('前')
    // 違反なら bg-red-100 クラスが付く
    expect(badge.className).toContain('bg-error-soft')
  })

  it('back_preferred の学生が後列でないとき「後」バッジを赤で表示する', () => {
    const student: Student = { ...FEMALE, tags: ['back_preferred'] }
    render(
      <SeatingGrid
        {...BASE_PROPS}
        students={[student]}
        assignments={[{ student_id: 2, seat_id: 1 }]}  // row=1 ≠ backRows([2])
        showViolationDetail={true}
      />,
    )
    const badge = screen.getByText('後')
    expect(badge.className).toContain('bg-error-soft')
  })
})

describe('SeatingGrid セル違反ツールチップ', () => {
  it('showViolationDetail=true で違反のある座席をホバーするとツールチップが表示される', () => {
    const student: Student = { ...MALE, tags: ['front_preferred'] }
    render(
      <SeatingGrid
        {...BASE_PROPS}
        students={[student]}
        assignments={[{ student_id: 1, seat_id: 3 }]}  // row=2 → 前側配慮違反
        showViolationDetail={true}
      />,
    )

    // DraggableSeat の内側 div（onMouseEnter を持つ）に対して発火する
    const studentEl = screen.getByText('テスト太郎')
    fireEvent.mouseEnter(studentEl.parentElement!)

    // 違反ツールチップのテキスト（CONSTRAINT_DEFS.front_preferred.violationLabel）
    expect(screen.getByText('前側配慮違反')).toBeInTheDocument()
  })

  it('ツールチップ表示の再レンダーで FLIP アニメーションが再発火しない', () => {
    // FLIP effect は発火のたびに transitionend リスナーを登録するため、
    // その追加回数でアニメーションのやり直し（バグ）を検出する
    const addListenerSpy = vi.spyOn(EventTarget.prototype, 'addEventListener')
    const student2: Student = { ...FEMALE, tags: ['front_preferred'] }
    render(
      <SeatingGrid
        {...BASE_PROPS}
        students={[MALE, student2]}
        assignments={[
          { student_id: 1, seat_id: 1 },
          { student_id: 2, seat_id: 3 },  // row=2 → 前側配慮違反
        ]}
        flipAnim={{ seatId: 1, dx: 80, dy: 0 }}
        showViolationDetail={true}
      />,
    )
    const countFlipListeners = () =>
      addListenerSpy.mock.calls.filter((c) => c[0] === 'transitionend').length
    const before = countFlipListeners()

    // 違反セルのホバーでツールチップが表示され SeatingGrid が再レンダーされる
    const studentEl = screen.getByText('テスト花子')
    fireEvent.mouseEnter(studentEl.parentElement!)
    expect(screen.getByText('前側配慮違反')).toBeInTheDocument()

    // FLIP effect が再実行されていない（リスナーの再登録なし）
    expect(countFlipListeners()).toBe(before)
    addListenerSpy.mockRestore()
  })

  it('showViolationDetail=false のときセルをホバーしてもツールチップが表示されない', () => {
    const student: Student = { ...MALE, tags: ['front_preferred'] }
    render(
      <SeatingGrid
        {...BASE_PROPS}
        students={[student]}
        assignments={[{ student_id: 1, seat_id: 3 }]}  // 違反がある座席
        showViolationDetail={false}
      />,
    )

    const studentEl = screen.getByText('テスト太郎')
    fireEvent.mouseEnter(studentEl.parentElement!)

    // tooltip は表示されない（onMouseEnter が undefined のため）
    // 「前側配慮違反」はツールチップではなく制約テーブルのラベルとして出ることもないため確認
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })
})

describe('SeatingGrid 前後配慮エリア未設定（0行）', () => {
  it('frontRows が空のとき front_preferred のバッジを表示しない（対象外）', () => {
    const student: Student = { ...MALE, tags: ['front_preferred'] }
    render(
      <SeatingGrid
        {...BASE_PROPS}
        frontRows={[]}
        students={[student]}
        assignments={[{ student_id: 1, seat_id: 3 }]}
        showViolationDetail={true}
      />,
    )
    expect(screen.queryByText('前')).not.toBeInTheDocument()
  })

  it('backRows が空のとき back_preferred のバッジを表示しない（対象外）', () => {
    const student: Student = { ...FEMALE, tags: ['back_preferred'] }
    render(
      <SeatingGrid
        {...BASE_PROPS}
        backRows={[]}
        students={[student]}
        assignments={[{ student_id: 2, seat_id: 1 }]}
        showViolationDetail={true}
      />,
    )
    expect(screen.queryByText('後')).not.toBeInTheDocument()
  })
})
