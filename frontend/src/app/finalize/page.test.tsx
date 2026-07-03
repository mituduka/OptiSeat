import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import FinalizePage from './page'
import { useStore } from '@/lib/store'

// SeatingResult と HelpPanel をスタブ化（@dnd-kit 等の複雑な依存を回避）
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let capturedSeatingResultProps: Record<string, any> = {}
vi.mock('@/components/SeatingResult', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  default: (props: Record<string, any>) => {
    capturedSeatingResultProps = props
    return <div data-testid="seating-result" />
  },
}))
vi.mock('@/components/HelpPanel', () => ({
  default: () => <div data-testid="help-panel" />,
}))
vi.mock('@/components/PageHeader', () => ({
  default: () => <div data-testid="page-header" />,
}))

// スコア API をスタブ化
const scoreAssignmentsMock = vi.fn()
vi.mock('@/lib/api', () => ({
  scoreAssignments: (...args: unknown[]) => scoreAssignmentsMock(...args),
}))

vi.mock('next/navigation', () => ({
  usePathname: () => '/finalize',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))

// hydration 状態を制御可能にする
let hydratedValue = false
vi.mock('@/hooks/useHasHydrated', () => ({
  useHasHydrated: () => hydratedValue,
}))

const ASSIGNMENTS = [{ student_id: 1, seat_id: 1 }]

beforeEach(() => {
  hydratedValue = false
  capturedSeatingResultProps = {}
  scoreAssignmentsMock.mockReset()
  scoreAssignmentsMock.mockResolvedValue({ score: { total: 0, breakdown: {} } })
  useStore.setState({
    students: [],
    adoptedAssignments: null,
    adjustingAssignments: null,
    finalizedAssignments: null,
  })
})

describe('FinalizePage hydration', () => {
  it('hydration 完了前は何も描画しない', () => {
    const { container } = render(<FinalizePage />)
    expect(container).toBeEmptyDOMElement()
  })

  it('hydration 前に描画が始まっても、復元された配置が空配列で確定しない', async () => {
    // 直接ロード相当: hydration 前（ストアは初期状態）に1回レンダーされる
    const { rerender } = render(<FinalizePage />)

    // hydration 完了: localStorage から採用済み配置が復元される
    useStore.setState({
      students: [{ id: 1, name: '佐藤 健太', gender: 'male', tags: [] }],
      adoptedAssignments: ASSIGNMENTS,
    })
    hydratedValue = true
    rerender(<FinalizePage />)

    // useState が hydration 前の空ストアを初期値に取り込んでいると assignments が [] になる
    expect(screen.getByTestId('seating-result')).toBeInTheDocument()
    expect(capturedSeatingResultProps.assignments).toEqual(ASSIGNMENTS)

    // マウント時の自動スコア計算も復元済みの配置で実行される
    await waitFor(() => expect(scoreAssignmentsMock).toHaveBeenCalled())
    expect(scoreAssignmentsMock.mock.calls[0][0].assignments).toEqual(ASSIGNMENTS)
  })

  it('hydration 完了後、配置がなければ「採用された配置がありません」を表示する', () => {
    hydratedValue = true
    render(<FinalizePage />)
    expect(screen.getByText(/採用された配置がありません/)).toBeInTheDocument()
  })
})
