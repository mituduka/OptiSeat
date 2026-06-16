import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import DataManagementModal from './DataManagementModal'
import { useStore } from '@/lib/store'

// URL stub
vi.stubGlobal('URL', {
  createObjectURL: vi.fn(() => 'blob:mock'),
  revokeObjectURL: vi.fn(),
})

// router.push をモック
const pushMock = vi.fn()
vi.mock('next/navigation', () => ({
  usePathname: () => '/students',
  useRouter: () => ({ push: pushMock, replace: vi.fn() }),
  redirect: vi.fn(),
}))

beforeEach(() => {
  useStore.setState({
    students: [],
    seat: { numRows: 2, numCols: 3, frontRowCount: 1, backRowCount: 1, emptySeats: [], numGroups: 1 },
    groups: [],
    fixedConstraints: [],
    forbiddenConstraints: [],
    seatGenderConstraints: [],
    relativeFixedConstraints: [],
    constraintToggles: { gender_balance: true, loneliness: true, differ_seat: false, differ_neighbor: false, differ_group: false },
    adoptedAssignments: null,
    finalizedAssignments: null,
  })
  pushMock.mockClear()
})

describe('DataManagementModal', () => {
  it('defaultTab 未指定（デフォルト）でエクスポートタブが表示される', () => {
    render(<DataManagementModal onClose={vi.fn()} />)
    expect(screen.getByText('エクスポートする項目を選択してください。')).toBeInTheDocument()
  })

  it('defaultTab="import" のときインポートタブが表示される', () => {
    render(<DataManagementModal onClose={vi.fn()} defaultTab="import" />)
    expect(screen.getByText(/エクスポートした JSON ファイルを読み込みます/)).toBeInTheDocument()
  })

  it('defaultTab="reset" のときリセットタブが表示される', () => {
    render(<DataManagementModal onClose={vi.fn()} defaultTab="reset" />)
    expect(screen.getByText(/すべてのデータを初期状態に戻します/)).toBeInTheDocument()
  })

  it('「JSON としてダウンロード」クリック後 onClose が呼ばれる', async () => {
    const onClose = vi.fn()
    // a.click をスタブ化
    const clickSpy = vi.fn()
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = document.createElement.wrappedFunction?.(tag) ?? Object.assign(document.createElementNS('http://www.w3.org/1999/xhtml', tag) as HTMLElement, {})
      if (tag === 'a') {
        el.click = clickSpy
      }
      return el
    })
    const user = userEvent.setup()
    render(<DataManagementModal onClose={onClose} />)
    await user.click(screen.getByRole('button', { name: 'JSON としてダウンロード' }))
    expect(onClose).toHaveBeenCalledOnce()
    vi.restoreAllMocks()
  })

  it('インポートタブでファイル未選択時「インポート実行」ボタンが表示されない', () => {
    render(<DataManagementModal onClose={vi.fn()} defaultTab="import" />)
    expect(screen.queryByRole('button', { name: 'インポート実行' })).not.toBeInTheDocument()
  })
})

// FileReader をモックして onerror / onload をテスト用に制御するヘルパー
function setupMockFileReader() {
  let capturedOnLoad: ((e: { target: { result: string } }) => void) | null = null
  let capturedOnError: (() => void) | null = null

  class MockFileReader {
    set onload(fn: (e: { target: { result: string } }) => void) { capturedOnLoad = fn }
    set onerror(fn: () => void) { capturedOnError = fn }
    readAsText = vi.fn()
  }
  vi.stubGlobal('FileReader', MockFileReader)

  return {
    triggerLoad: (result: string) => { capturedOnLoad?.({ target: { result } }) },
    triggerError: () => { capturedOnError?.() },
  }
}

function selectFile(filename = 'test.json') {
  const fileInput = document.getElementById('import-file-input') as HTMLInputElement
  const file = new File(['{}'], filename, { type: 'application/json' })
  Object.defineProperty(fileInput, 'files', { value: [file], writable: false, configurable: true })
  fireEvent.change(fileInput)
}

describe('DataManagementModal FileReader エラー処理', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('FileReader.onerror が呼ばれたときエラーメッセージが表示される', async () => {
    const { triggerError } = setupMockFileReader()
    render(<DataManagementModal onClose={vi.fn()} defaultTab="import" />)

    selectFile()

    await act(async () => { triggerError() })

    expect(screen.getByText('ファイルの読み込みに失敗しました')).toBeInTheDocument()
  })

  it('性別フィールドが不正な場合、ファイル読み込み時点でエラーが表示される', async () => {
    const { triggerLoad } = setupMockFileReader()
    render(<DataManagementModal onClose={vi.fn()} defaultTab="import" />)

    selectFile()

    const invalidJson = JSON.stringify({
      version: 1,
      exportedAt: new Date().toISOString(),
      students: [{ id: 1, name: '山田', gender: 'unknown', tags: [] }],
    })

    await act(async () => { triggerLoad(invalidJson) })

    // 検証はファイル読み込み時に行われ、インポート実行ボタンは表示されない
    expect(screen.getByText(/無効な性別値/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'インポート実行' })).not.toBeInTheDocument()
  })

  it('構造が不正なファイル（students が配列でない）はエラーになりインポートできない', async () => {
    const { triggerLoad } = setupMockFileReader()
    render(<DataManagementModal onClose={vi.fn()} defaultTab="import" />)

    selectFile()

    const invalidJson = JSON.stringify({
      version: 1,
      exportedAt: new Date().toISOString(),
      students: { broken: true },
    })

    await act(async () => { triggerLoad(invalidJson) })

    expect(screen.getByText('students が配列ではありません')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'インポート実行' })).not.toBeInTheDocument()
  })

  it('正常なJSONのインポートが成功して onClose が呼ばれる', async () => {
    const { triggerLoad } = setupMockFileReader()
    const onClose = vi.fn()
    render(<DataManagementModal onClose={onClose} defaultTab="import" />)

    selectFile()

    const validJson = JSON.stringify({
      version: 1,
      exportedAt: new Date().toISOString(),
      students: [{ id: 1, name: '山田', gender: 'male', tags: [] }],
    })

    await act(async () => { triggerLoad(validJson) })

    const importBtn = await screen.findByRole('button', { name: 'インポート実行' })
    await userEvent.click(importBtn)

    expect(onClose).toHaveBeenCalledOnce()
  })
})
