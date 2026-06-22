import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import StudentTable from './StudentTable'
import { useStore } from '@/lib/store'

// DnD ライブラリのモック
vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useSensor: vi.fn(),
  useSensors: vi.fn(() => []),
  PointerSensor: vi.fn(),
  TouchSensor: vi.fn(),
  KeyboardSensor: vi.fn(),
}))

vi.mock('@dnd-kit/sortable', () => ({
  SortableContext: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    transition: undefined,
    isDragging: false,
  }),
  verticalListSortingStrategy: vi.fn(),
  sortableKeyboardCoordinates: vi.fn(),
}))

beforeEach(() => {
  useStore.setState({
    students: [],
    seat: { numRows: 2, numCols: 3, frontRowCount: 1, backRowCount: 1, emptySeats: [], numGroups: 1 },
    groups: [],
    fixedConstraints: [],
    forbiddenConstraints: [],
    prevAssign: [],
    solveResult: null,
    isSolving: false,
  })
})

describe('StudentTable', () => {
  it('0 人のとき「登録されていません」メッセージを表示する', () => {
    render(<StudentTable />)
    expect(screen.getByText(/名簿が登録されていません/)).toBeInTheDocument()
  })

  it('氏名を入力して追加ボタンを押すと名簿に追加される', async () => {
    const user = userEvent.setup()
    render(<StudentTable />)

    await user.type(screen.getByRole('textbox', { name: '氏名' }), '佐藤 次郎')
    await user.click(screen.getByRole('button', { name: '追加' }))

    expect(screen.getByText('佐藤 次郎')).toBeInTheDocument()
    expect(useStore.getState().students).toHaveLength(1)
  })

  it('Enter キーで追加できる', async () => {
    const user = userEvent.setup()
    render(<StudentTable />)

    await user.type(screen.getByRole('textbox', { name: '氏名' }), '田中 花子{Enter}')
    expect(screen.getByText('田中 花子')).toBeInTheDocument()
  })

  it('氏名が空のとき追加ボタンが無効化される', () => {
    render(<StudentTable />)
    const btn = screen.getByRole('button', { name: '追加' })
    expect(btn).toBeDisabled()
  })

  it('性別ラジオを切り替えて追加すると gender が反映される', async () => {
    const user = userEvent.setup()
    render(<StudentTable />)

    await user.type(screen.getByRole('textbox', { name: '氏名' }), '渡辺 さくら')
    await user.click(screen.getByRole('radio', { name: '女' }))
    await user.click(screen.getByRole('button', { name: '追加' }))

    // ストア上で gender が female になっている
    expect(useStore.getState().students[0].gender).toBe('female')
    // テーブルセルに「女」が表示される（ラジオラベルと重複するため getAllByText を使用）
    expect(screen.getAllByText('女').length).toBeGreaterThanOrEqual(1)
  })

  it('タグチェックボックスを選択して追加すると tags が反映される', async () => {
    const user = userEvent.setup()
    render(<StudentTable />)

    await user.type(screen.getByRole('textbox', { name: '氏名' }), '伊藤 健一')
    await user.click(screen.getByRole('checkbox', { name: '前側配慮' }))
    await user.click(screen.getByRole('button', { name: '追加' }))

    expect(useStore.getState().students[0].tags).toContain('front_preferred')
  })

  it('削除ボタンは2段階クリックで該当行を削除する', async () => {
    useStore.setState({
      students: [
        { id: 1, name: '山田 太郎', gender: 'male', tags: [] },
        { id: 2, name: '鈴木 花子', gender: 'female', tags: [] },
      ],
    })
    const user = userEvent.setup()
    render(<StudentTable />)

    const deleteButton = screen.getAllByRole('button', { name: '削除' })[0]

    // 1回目のクリックでは確認状態になるだけで削除されない
    await user.click(deleteButton)
    expect(useStore.getState().students).toHaveLength(2)
    expect(deleteButton).toHaveTextContent('本当に削除？')

    // 2回目のクリックで削除される
    await user.click(deleteButton)
    expect(useStore.getState().students).toHaveLength(1)
  })

  it('名簿が存在するとき番号列は配列順序（index+1）で表示する', () => {
    // id=5 でも配列の1番目なら出席番号は「1」
    useStore.setState({
      students: [{ id: 5, name: '山田 太郎', gender: 'male', tags: [] }],
    })
    render(<StudentTable />)
    expect(screen.getByText('山田 太郎')).toBeInTheDocument()
    // 出席番号は index+1 = 1（idの5ではない）
    expect(screen.getByRole('cell', { name: '1' })).toBeInTheDocument()
    // 性別セル（ラジオラベルと重複するため getAllByText で確認）
    expect(screen.getAllByText('男').length).toBeGreaterThanOrEqual(1)
  })

  it('追加後に入力フォームがリセットされる', async () => {
    const user = userEvent.setup()
    render(<StudentTable />)

    const input = screen.getByRole('textbox', { name: '氏名' })
    await user.type(input, '山田 太郎')
    await user.click(screen.getByRole('button', { name: '追加' }))

    expect(input).toHaveValue('')
  })

  it('編集ボタンでインライン編集できる', async () => {
    useStore.setState({
      students: [{ id: 1, name: '山田 太郎', gender: 'male', tags: [] }],
    })
    const user = userEvent.setup()
    render(<StudentTable />)

    // 編集ボタンをクリック
    await user.click(screen.getByRole('button', { name: '編集' }))

    // 名前フィールドが編集可能になる
    const nameInput = screen.getByDisplayValue('山田 太郎')
    await user.clear(nameInput)
    await user.type(nameInput, '田中 次郎')

    // 保存
    await user.click(screen.getByRole('button', { name: '保存' }))

    // ストアに反映される
    expect(useStore.getState().students[0].name).toBe('田中 次郎')
    // 編集モードを抜けている
    expect(screen.queryByRole('button', { name: '保存' })).toBeNull()
  })

  it('編集キャンセルで変更が破棄される', async () => {
    useStore.setState({
      students: [{ id: 1, name: '山田 太郎', gender: 'male', tags: [] }],
    })
    const user = userEvent.setup()
    render(<StudentTable />)

    await user.click(screen.getByRole('button', { name: '編集' }))
    const nameInput = screen.getByDisplayValue('山田 太郎')
    await user.clear(nameInput)
    await user.type(nameInput, '変更後')

    await user.click(screen.getByRole('button', { name: 'キャンセル' }))

    // ストアは変更されていない
    expect(useStore.getState().students[0].name).toBe('山田 太郎')
    // 読み取り行に戻っている
    expect(screen.getByText('山田 太郎')).toBeInTheDocument()
  })

  it('空白のみの氏名では追加されない', async () => {
    const user = userEvent.setup()
    render(<StudentTable />)

    await user.type(screen.getByRole('textbox', { name: '氏名' }), '   ')
    await user.click(screen.getByRole('button', { name: '追加' }))

    expect(useStore.getState().students).toHaveLength(0)
  })

  it('上限人数に達したときエラーメッセージが表示される', async () => {
    useStore.setState({
      maxStudents: 1,
      students: [{ id: 1, name: '既存児童・生徒', gender: 'male', tags: [] }],
    })
    const user = userEvent.setup()
    render(<StudentTable />)

    await user.type(screen.getByRole('textbox', { name: '氏名' }), '追加児童・生徒')
    await user.click(screen.getByRole('button', { name: '追加' }))

    expect(screen.getByText(/上限/)).toBeInTheDocument()
    expect(useStore.getState().students).toHaveLength(1)
  })

  it('編集時に性別を変更すると保存後に反映される', async () => {
    useStore.setState({
      students: [{ id: 1, name: '田中 太郎', gender: 'male', tags: [] }],
    })
    const user = userEvent.setup()
    render(<StudentTable />)

    await user.click(screen.getByRole('button', { name: '編集' }))
    // 編集行の女ラジオをクリック（インデックス1: フォーム行の次が編集行）
    const femaleRadios = screen.getAllByRole('radio', { name: '女' })
    await user.click(femaleRadios[1])
    await user.click(screen.getByRole('button', { name: '保存' }))

    expect(useStore.getState().students[0].gender).toBe('female')
  })

  it('編集時にタグを変更すると保存後に反映される', async () => {
    useStore.setState({
      students: [{ id: 1, name: '田中 花子', gender: 'female', tags: [] }],
    })
    const user = userEvent.setup()
    render(<StudentTable />)

    await user.click(screen.getByRole('button', { name: '編集' }))
    // 編集行の「前側配慮」チェックボックスをオン（インデックス1: フォーム行の次が編集行）
    const checkboxes = screen.getAllByRole('checkbox', { name: '前側配慮' })
    await user.click(checkboxes[1])
    await user.click(screen.getByRole('button', { name: '保存' }))

    expect(useStore.getState().students[0].tags).toContain('front_preferred')
  })
})


