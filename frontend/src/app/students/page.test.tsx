import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import StudentsPage from './page'
import { useStore } from '@/lib/store'

vi.mock('@/components/StudentTable', () => ({
  default: () => <div data-testid="student-table" />,
}))
vi.mock('@/components/HelpPanel', () => ({
  default: () => <div data-testid="help-panel" />,
}))

const openDataModalMock = vi.fn()

beforeEach(() => {
  useStore.setState({
    students: [],
    seat: { numRows: 2, numCols: 3, frontRowCount: 1, backRowCount: 1, emptySeats: [], numGroups: 1 },
    openDataModal: openDataModalMock,
  })
  openDataModalMock.mockClear()
})

describe('StudentsPage', () => {
  it('名簿が空のときインポート誘導バナーが表示される', () => {
    render(<StudentsPage />)
    expect(screen.getByText(/前回のデータがある場合は、インポート機能から復元できます/)).toBeInTheDocument()
  })

  it('名簿に1名以上いるときインポート誘導バナーが表示されない', () => {
    useStore.setState({ students: [{ id: 1, name: '山田 太郎', gender: 'male', tags: [] }] })
    render(<StudentsPage />)
    expect(screen.queryByText(/前回のデータがある場合は、インポート機能から復元できます/)).not.toBeInTheDocument()
  })

  it('名簿が空のとき「全削除」ボタンが表示されない', () => {
    render(<StudentsPage />)
    expect(screen.queryByRole('button', { name: '全削除' })).not.toBeInTheDocument()
  })

  it('名簿に1名以上いるとき「全削除」ボタンが表示される', () => {
    useStore.setState({ students: [{ id: 1, name: '山田 太郎', gender: 'male', tags: [] }] })
    render(<StudentsPage />)
    expect(screen.getByRole('button', { name: '全削除' })).toBeInTheDocument()
  })

  it('「全削除」ボタンクリックで openDataModal("reset") が呼ばれる', async () => {
    useStore.setState({ students: [{ id: 1, name: '山田 太郎', gender: 'male', tags: [] }] })
    const user = userEvent.setup()
    render(<StudentsPage />)
    await user.click(screen.getByRole('button', { name: '全削除' }))
    expect(openDataModalMock).toHaveBeenCalledWith('reset')
  })

  it('「インポートを開く →」クリックで openDataModal("import") が呼ばれる', async () => {
    const user = userEvent.setup()
    render(<StudentsPage />)
    await user.click(screen.getByRole('button', { name: /インポートを開く/ }))
    expect(openDataModalMock).toHaveBeenCalledWith('import')
  })
})
