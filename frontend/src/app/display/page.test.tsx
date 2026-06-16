import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import DisplayPage from './page'
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

// PDF 生成（pdf-lib 依存）をスタブ化
const generateSeatingPdfMock = vi.fn()
vi.mock('@/lib/pdf/seatingPdf', () => ({
  generateSeatingPdf: (...args: unknown[]) => generateSeatingPdfMock(...args),
}))

// router.push をモック
const pushMock = vi.fn()
vi.mock('next/navigation', () => ({
  usePathname: () => '/display',
  useRouter: () => ({ push: pushMock, replace: vi.fn() }),
  redirect: vi.fn(),
}))

const ASSIGNMENTS = [{ student_id: 1, seat_id: 1 }]
const openDataModalMock = vi.fn()

// URL.createObjectURL / revokeObjectURL / a.click をモック
const createObjectURLMock = vi.fn(() => 'blob:mock')
const revokeObjectURLMock = vi.fn()
const clickMock = vi.fn()

beforeEach(() => {
  useStore.setState({
    students: [{ id: 1, name: '佐藤 健太', gender: 'male', tags: [] }],
    seat: { numRows: 5, numCols: 5, frontRowCount: 1, backRowCount: 1, emptySeats: [], numGroups: 1 },
    groups: [],
    fixedConstraints: [],
    forbiddenConstraints: [],
    leaderGroups: [],
    finalizedAssignments: null,
    openDataModal: openDataModalMock,
  })
  capturedSeatingResultProps = {}
  pushMock.mockClear()
  openDataModalMock.mockClear()
  generateSeatingPdfMock.mockReset()
  generateSeatingPdfMock.mockResolvedValue(new Blob(['pdf'], { type: 'application/pdf' }))
  createObjectURLMock.mockClear()
  revokeObjectURLMock.mockClear()
  clickMock.mockClear()
  Object.defineProperty(URL, 'createObjectURL', { value: createObjectURLMock, writable: true })
  Object.defineProperty(URL, 'revokeObjectURL', { value: revokeObjectURLMock, writable: true })
  // jsdom の <a>.click を抑止
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(clickMock)
})

describe('DisplayPage', () => {
  it('finalizedAssignments が null のとき「確定された配置がありません」を表示する', () => {
    render(<DisplayPage />)
    expect(screen.getByText(/確定された配置がありません/)).toBeInTheDocument()
  })

  it('finalizedAssignments がある → SeatingResult が描画される', () => {
    useStore.setState({ finalizedAssignments: ASSIGNMENTS })
    render(<DisplayPage />)
    expect(screen.getByTestId('seating-result')).toBeInTheDocument()
  })

  it('finalizedAssignments がある → 「PDFをダウンロード」ボタンが表示される', () => {
    useStore.setState({ finalizedAssignments: ASSIGNMENTS })
    render(<DisplayPage />)
    expect(screen.getByRole('button', { name: 'PDFをダウンロード' })).toBeInTheDocument()
  })

  it('「PDFをダウンロード」クリックで generateSeatingPdf が store データで呼ばれる', async () => {
    useStore.setState({ finalizedAssignments: ASSIGNMENTS })
    const user = userEvent.setup()
    render(<DisplayPage />)
    await user.click(screen.getByRole('button', { name: 'PDFをダウンロード' }))
    await waitFor(() => expect(generateSeatingPdfMock).toHaveBeenCalledOnce())
    const arg = generateSeatingPdfMock.mock.calls[0][0]
    expect(arg.assignments).toEqual(ASSIGNMENTS)
    expect(arg.students).toHaveLength(1)
  })

  it('PDF ダウンロードが発火し、ファイル名が 座席表YYYYMMDD.pdf', async () => {
    useStore.setState({ finalizedAssignments: ASSIGNMENTS })
    const user = userEvent.setup()
    render(<DisplayPage />)
    await user.click(screen.getByRole('button', { name: 'PDFをダウンロード' }))
    await waitFor(() => expect(clickMock).toHaveBeenCalledOnce())
    expect(createObjectURLMock).toHaveBeenCalledOnce()
    expect(revokeObjectURLMock).toHaveBeenCalledOnce()
  })

  it('生成中はボタンが disabled になる', async () => {
    useStore.setState({ finalizedAssignments: ASSIGNMENTS })
    // 解決を保留して生成中状態を観測
    let resolve!: (b: Blob) => void
    generateSeatingPdfMock.mockReturnValue(new Promise<Blob>((r) => { resolve = r }))
    const user = userEvent.setup()
    render(<DisplayPage />)
    const btn = screen.getByRole('button', { name: 'PDFをダウンロード' })
    await user.click(btn)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'PDF生成中…' })).toBeDisabled(),
    )
    resolve(new Blob(['x'], { type: 'application/pdf' }))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'PDFをダウンロード' })).toBeEnabled(),
    )
  })

  it('生成失敗時にエラーメッセージを表示する', async () => {
    useStore.setState({ finalizedAssignments: ASSIGNMENTS })
    generateSeatingPdfMock.mockRejectedValue(new Error('boom'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const user = userEvent.setup()
    render(<DisplayPage />)
    await user.click(screen.getByRole('button', { name: 'PDFをダウンロード' }))
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(screen.getByRole('alert')).toHaveTextContent(/PDFの生成に失敗/)
  })

  it('「配置調整に戻る」クリックで /finalize に遷移する', async () => {
    useStore.setState({ finalizedAssignments: ASSIGNMENTS })
    const user = userEvent.setup()
    render(<DisplayPage />)
    await user.click(screen.getByRole('button', { name: '配置調整に戻る' }))
    expect(pushMock).toHaveBeenCalledWith('/finalize')
  })

  it('「データをエクスポート」ボタンが表示される', () => {
    useStore.setState({ finalizedAssignments: ASSIGNMENTS })
    render(<DisplayPage />)
    expect(screen.getByRole('button', { name: /データをエクスポート/ })).toBeInTheDocument()
  })

  it('「データをエクスポート」クリックで openDataModal("export") が呼ばれる', async () => {
    useStore.setState({ finalizedAssignments: ASSIGNMENTS })
    const user = userEvent.setup()
    render(<DisplayPage />)
    await user.click(screen.getByRole('button', { name: /データをエクスポート/ }))
    expect(openDataModalMock).toHaveBeenCalledWith('export')
  })

  it('ストアに forbiddenConstraints があっても SeatingResult に渡さない（X マーク非描画）', () => {
    useStore.setState({
      finalizedAssignments: ASSIGNMENTS,
      forbiddenConstraints: [{ studentIdA: 1, studentIdB: 2, type: 'adjacent8' }],
    })
    render(<DisplayPage />)
    expect(capturedSeatingResultProps.forbiddenConstraints ?? []).toHaveLength(0)
  })

  it('SeatingResult に渡す frontRows は空配列（前側ラベル非表示）', () => {
    useStore.setState({ finalizedAssignments: ASSIGNMENTS })
    render(<DisplayPage />)
    expect(capturedSeatingResultProps.frontRows).toEqual([])
  })
})
