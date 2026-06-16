import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import SolutionTabs from './SolutionTabs'
import type { Solution, ConstraintToggles, ScoreBreakdown } from '@/types'

// SeatingResult は dnd-kit に依存するため丸ごとモック
vi.mock('@/components/SeatingResult', () => ({
  default: () => <div data-testid="seating-result" />,
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

const ALL_TOGGLES: ConstraintToggles = {
  gender_balance: true,
  loneliness: true,
  differ_seat: true,
  differ_neighbor: true,
  differ_group: true,
}

const BASE_SOLUTION: Solution = {
  rank: 1,
  assignments: [{ student_id: 1, seat_id: 1 }],
  score: { total: 0, breakdown: ZERO_BREAKDOWN },
}

const BASE_PROPS = {
  solutions: [BASE_SOLUTION],
  activeTab: 0,
  onTabChange: vi.fn(),
  onAdopt: vi.fn(),
  numRows: 1,
  numCols: 1,
  frontRows: [] as number[],
  backRows: [] as number[],
  students: [],
  groups: [],
  numGroups: 0,
  fixedConstraints: [],
  forbiddenConstraints: [],
  seatGenderConstraints: [],
  relativeFixedConstraints: [],
  prevAssign: [],
  constraintToggles: ALL_TOGGLES,
}

// ---------------------------------------------------------------------------

describe('SolutionTabs 空状態', () => {
  it('solutions が空のとき何もレンダーしない', () => {
    const { container } = render(<SolutionTabs {...BASE_PROPS} solutions={[]} />)
    expect(container.firstChild).toBeNull()
  })
})

describe('SolutionTabs タブ表示', () => {
  it('解候補の数だけ「案 N」ボタンを表示する', () => {
    render(<SolutionTabs {...BASE_PROPS} solutions={[BASE_SOLUTION, BASE_SOLUTION]} />)
    expect(screen.getByText('案 1')).toBeInTheDocument()
    expect(screen.getByText('案 2')).toBeInTheDocument()
  })

  it('違反なしの解のバッジに「違反なし」を表示する', () => {
    render(<SolutionTabs {...BASE_PROPS} />)
    expect(screen.getByText('違反なし')).toBeInTheDocument()
  })

  it('違反がある場合はバッジに「Pレベル: 件数」を表示する', () => {
    // front_preferred_violation は priorityLevel=5
    const solution: Solution = {
      ...BASE_SOLUTION,
      score: { total: 4, breakdown: { ...ZERO_BREAKDOWN, front_preferred_violation: 2 } },
    }
    render(<SolutionTabs {...BASE_PROPS} solutions={[solution]} />)
    expect(screen.getByText('P5: 2')).toBeInTheDocument()
  })
})

describe('SolutionTabs インタラクション', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('タブをクリックすると onTabChange が正しいインデックスで呼ばれる', () => {
    const onTabChange = vi.fn()
    render(
      <SolutionTabs
        {...BASE_PROPS}
        solutions={[BASE_SOLUTION, BASE_SOLUTION, BASE_SOLUTION]}
        onTabChange={onTabChange}
      />,
    )
    fireEvent.click(screen.getByText('案 3'))
    expect(onTabChange).toHaveBeenCalledWith(2)
  })

  it('「この配置を採用して次へ」をクリックすると onAdopt がアクティブタブのインデックスで呼ばれる', () => {
    const onAdopt = vi.fn()
    render(<SolutionTabs {...BASE_PROPS} onAdopt={onAdopt} activeTab={0} />)
    fireEvent.click(screen.getByText('この配置を採用して次へ'))
    expect(onAdopt).toHaveBeenCalledWith(0)
  })
})

describe('SolutionTabs 配置表示', () => {
  it('アクティブな解の SeatingResult コンポーネントを表示する', () => {
    render(<SolutionTabs {...BASE_PROPS} />)
    expect(screen.getByTestId('seating-result')).toBeInTheDocument()
  })
})
