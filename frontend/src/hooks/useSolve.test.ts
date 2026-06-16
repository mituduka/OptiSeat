import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useSolve } from './useSolve'
import { useStore } from '@/lib/store'

vi.mock('@/lib/api', () => ({
  solveSeatings: vi.fn(),
  validateConstraints: vi.fn(),
}))

import { solveSeatings, validateConstraints } from '@/lib/api'

const student = (id: number) => ({ id, name: `児童・生徒${id}`, gender: 'male' as const, tags: [] })

const BASE_STATE = {
  students: [],
  seat: { numRows: 2, numCols: 2, frontRowCount: 1, backRowCount: 0, emptySeats: [], numGroups: 1 },
  groups: [],
  fixedConstraints: [],
  forbiddenConstraints: [],
  seatGenderConstraints: [],
  relativeFixedConstraints: [],
  prevAssign: [],
  solveResult: null,
  isSolving: false,
  adoptedAssignments: null,
  adjustingAssignments: null,
  finalizedAssignments: null,
  constraintToggles: {
    gender_balance: true,
    loneliness: true,
    differ_seat: false,
    differ_neighbor: false,
    differ_group: false,
  },
  solverMaxSolutionsDefault: 5,
  solverTimeoutDefault: 30,
}

beforeEach(() => {
  useStore.setState(BASE_STATE)
  vi.clearAllMocks()
  vi.mocked(validateConstraints).mockResolvedValue({ warnings: [] })
  vi.mocked(solveSeatings).mockResolvedValue({ status: 'ok', elapsed_ms: 1, solutions: [], error: null })
})

describe('useSolve - handleSolve バリデーション', () => {
  it('名簿が空のときエラーメッセージを設定し API を呼ばない', async () => {
    const { result } = renderHook(() => useSolve())
    await act(async () => { await result.current.handleSolve() })
    expect(result.current.errorMsg).toBe('名簿が登録されていません')
    expect(solveSeatings).not.toHaveBeenCalled()
  })

  it('児童・生徒数が有効座席数を超えるときエラーメッセージを設定し API を呼ばない', async () => {
    // 2×2=4席のうち2席を空席にして有効座席=2、児童・生徒3人
    useStore.setState({
      ...BASE_STATE,
      students: [student(1), student(2), student(3)],
      seat: {
        numRows: 2,
        numCols: 2,
        frontRowCount: 1,
        backRowCount: 0,
        emptySeats: [{ row: 2, col: 1 }, { row: 2, col: 2 }],
        numGroups: 1,
      },
    })
    const { result } = renderHook(() => useSolve())
    await act(async () => { await result.current.handleSolve() })
    expect(result.current.errorMsg).toBe('児童・生徒数（3人）が有効座席数（2席）を超えています')
    expect(solveSeatings).not.toHaveBeenCalled()
  })

  it('児童・生徒数と有効座席数が等しいとき API が呼ばれる', async () => {
    // 2×2=4席（空席なし）、児童・生徒4人
    useStore.setState({ ...BASE_STATE, students: [student(1), student(2), student(3), student(4)] })
    const { result } = renderHook(() => useSolve())
    await act(async () => { await result.current.handleSolve() })
    expect(result.current.errorMsg).toBeNull()
    expect(solveSeatings).toHaveBeenCalledOnce()
  })

  it('児童・生徒数が有効座席数より少ないとき API が呼ばれる', async () => {
    // 2×2=4席（空席なし）、児童・生徒2人
    useStore.setState({ ...BASE_STATE, students: [student(1), student(2)] })
    const { result } = renderHook(() => useSolve())
    await act(async () => { await result.current.handleSolve() })
    expect(result.current.errorMsg).toBeNull()
    expect(solveSeatings).toHaveBeenCalledOnce()
  })
})

describe('useSolve - validateConstraints', () => {
  it('validateConstraints が warnings を返すとき warnings state に反映される', async () => {
    const warning = { code: 'UNKNOWN_STUDENT_ID', message: 'ID:999 は名簿に存在しません。' }
    vi.mocked(validateConstraints).mockResolvedValue({ warnings: [warning] })
    useStore.setState({ ...BASE_STATE, students: [student(1), student(2), student(3), student(4)] })
    const { result } = renderHook(() => useSolve())
    await act(async () => { await result.current.handleSolve() })
    expect(result.current.warnings).toEqual([warning])
    expect(solveSeatings).toHaveBeenCalledOnce()
  })

  it('validateConstraints が例外を投げても solveSeatings が呼ばれる', async () => {
    vi.mocked(validateConstraints).mockRejectedValue(new Error('network error'))
    useStore.setState({ ...BASE_STATE, students: [student(1), student(2), student(3), student(4)] })
    const { result } = renderHook(() => useSolve())
    await act(async () => { await result.current.handleSolve() })
    expect(solveSeatings).toHaveBeenCalledOnce()
    expect(result.current.errorMsg).toBeNull()
  })
})

describe('useSolve - solveSeatings', () => {
  it('solveSeatings が成功すると isSolving が false になり solveResult が設定される', async () => {
    const mockResult = { status: 'ok' as const, elapsed_ms: 100, solutions: [], error: null }
    vi.mocked(solveSeatings).mockResolvedValue(mockResult)
    useStore.setState({ ...BASE_STATE, students: [student(1), student(2), student(3), student(4)] })
    const { result } = renderHook(() => useSolve())
    await act(async () => { await result.current.handleSolve() })
    expect(result.current.isSolving).toBe(false)
    expect(result.current.solveResult).toEqual(mockResult)
  })

  it('solveSeatings が Error を投げると errorMsg に err.message が設定される', async () => {
    vi.mocked(solveSeatings).mockRejectedValue(new Error('サーバーエラー'))
    useStore.setState({ ...BASE_STATE, students: [student(1), student(2), student(3), student(4)] })
    const { result } = renderHook(() => useSolve())
    await act(async () => { await result.current.handleSolve() })
    expect(result.current.errorMsg).toBe('サーバーエラー')
  })

  it('solveSeatings が非 Error を投げると errorMsg が "不明なエラーが発生しました" になる', async () => {
    vi.mocked(solveSeatings).mockRejectedValue('文字列エラー')
    useStore.setState({ ...BASE_STATE, students: [student(1), student(2), student(3), student(4)] })
    const { result } = renderHook(() => useSolve())
    await act(async () => { await result.current.handleSolve() })
    expect(result.current.errorMsg).toBe('不明なエラーが発生しました')
  })

  it('solveSeatings が失敗しても finally で isSolving が false になる', async () => {
    vi.mocked(solveSeatings).mockRejectedValue(new Error('network'))
    useStore.setState({ ...BASE_STATE, students: [student(1), student(2), student(3), student(4)] })
    const { result } = renderHook(() => useSolve())
    await act(async () => { await result.current.handleSolve() })
    expect(result.current.isSolving).toBe(false)
  })
})
