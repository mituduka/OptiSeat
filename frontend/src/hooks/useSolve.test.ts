import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useSolve } from './useSolve'
import { useStore } from '@/lib/store'
import type { SolveResponse, ScoreBreakdown } from '@/types'

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

// ---------------------------------------------------------------------------
// 配置パイプラインの保持と古い応答の破棄
// ---------------------------------------------------------------------------

const PIPELINE = [{ student_id: 1, seat_id: 1 }]
const FOUR_STUDENTS = [student(1), student(2), student(3), student(4)]
const OK_WITH_SOLUTION: SolveResponse = {
  status: 'ok',
  elapsed_ms: 1,
  solutions: [
    { rank: 1, score: { total: 0, breakdown: {} as ScoreBreakdown }, assignments: [{ student_id: 1, seat_id: 4 }] },
  ],
  error: null,
}

function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

describe('useSolve - 失敗時に確定済み配置を消さない', () => {
  beforeEach(() => {
    useStore.setState({
      ...BASE_STATE,
      students: FOUR_STUDENTS,
      adoptedAssignments: PIPELINE,
      adjustingAssignments: PIPELINE,
      finalizedAssignments: PIPELINE,
    })
  })

  it('solveSeatings が失敗したら採用・調整中・確定の配置は残る', async () => {
    vi.mocked(solveSeatings).mockRejectedValue(new Error('network'))
    const { result } = renderHook(() => useSolve())
    await act(async () => { await result.current.handleSolve() })
    const state = useStore.getState()
    expect(result.current.errorMsg).toBe('network')
    expect(state.adoptedAssignments).toEqual(PIPELINE)
    expect(state.adjustingAssignments).toEqual(PIPELINE)
    expect(state.finalizedAssignments).toEqual(PIPELINE)
  })

  it('解なし（unsatisfiable）の応答では結果はセットするが確定済みの配置は残す', async () => {
    const unsat: SolveResponse = { status: 'unsatisfiable', elapsed_ms: 1, solutions: [], error: null }
    vi.mocked(solveSeatings).mockResolvedValue(unsat)
    const { result } = renderHook(() => useSolve())
    await act(async () => { await result.current.handleSolve() })
    const state = useStore.getState()
    expect(state.solveResult).toEqual(unsat)
    expect(state.adoptedAssignments).toEqual(PIPELINE)
    expect(state.finalizedAssignments).toEqual(PIPELINE)
  })

  it('解が得られたら結果をセットし、古い採用・調整中・確定の配置をクリアする', async () => {
    vi.mocked(solveSeatings).mockResolvedValue(OK_WITH_SOLUTION)
    const { result } = renderHook(() => useSolve())
    await act(async () => { await result.current.handleSolve() })
    const state = useStore.getState()
    expect(state.solveResult).toEqual(OK_WITH_SOLUTION)
    expect(state.adoptedAssignments).toBeNull()
    expect(state.adjustingAssignments).toBeNull()
    expect(state.finalizedAssignments).toBeNull()
  })
})

describe('useSolve - 計算中に条件が変わったら応答を破棄する', () => {
  beforeEach(() => {
    useStore.setState({ ...BASE_STATE, students: FOUR_STUDENTS })
  })

  async function startPendingSolve() {
    const d = deferred<SolveResponse>()
    vi.mocked(solveSeatings).mockReturnValue(d.promise)
    const hook = renderHook(() => useSolve())
    let p!: Promise<void>
    act(() => { p = hook.result.current.handleSolve() })
    await waitFor(() => expect(solveSeatings).toHaveBeenCalledOnce())
    return { d, hook, done: () => p }
  }

  it('計算中に制約を追加すると、遅れて届いた旧条件の解はセットされない', async () => {
    const { d, hook, done } = await startPendingSolve()
    act(() => { useStore.getState().addFixed({ studentId: 1, row: 1, col: 1 }) })
    await act(async () => { d.resolve(OK_WITH_SOLUTION); await done() })
    expect(useStore.getState().solveResult).toBeNull()
    expect(useStore.getState().isSolving).toBe(false)
    expect(hook.result.current.solutions).toHaveLength(0)
  })

  it('計算中に生徒を削除すると、遅れて届いた旧条件の解はセットされない', async () => {
    const { d, done } = await startPendingSolve()
    act(() => { useStore.getState().removeStudent(4) })
    await act(async () => { d.resolve(OK_WITH_SOLUTION); await done() })
    expect(useStore.getState().solveResult).toBeNull()
    expect(useStore.getState().isSolving).toBe(false)
  })

  it('計算中に条件が変わり、その後に採用・確定された配置は旧条件の応答で消されない', async () => {
    const { d, done } = await startPendingSolve()
    act(() => {
      useStore.getState().addFixed({ studentId: 1, row: 1, col: 1 })
      useStore.setState({ finalizedAssignments: PIPELINE })
    })
    await act(async () => { d.resolve(OK_WITH_SOLUTION); await done() })
    expect(useStore.getState().finalizedAssignments).toEqual(PIPELINE)
  })

  it('求解に影響しない操作だけなら遅れて届いた解はセットされる', async () => {
    const { d, done } = await startPendingSolve()
    act(() => { useStore.getState().setChartTitle('1年1組') })
    await act(async () => { d.resolve(OK_WITH_SOLUTION); await done() })
    expect(useStore.getState().solveResult).toEqual(OK_WITH_SOLUTION)
    expect(useStore.getState().isSolving).toBe(false)
  })

  it('計算中に条件が変わった後で失敗しても isSolving は false に戻る', async () => {
    const { d, done } = await startPendingSolve()
    act(() => { useStore.getState().addFixed({ studentId: 1, row: 1, col: 1 }) })
    await act(async () => { d.reject(new Error('network')); await done() })
    expect(useStore.getState().isSolving).toBe(false)
  })
})

describe('useSolve - 多重実行の防止', () => {
  it('handleSolve を同一 tick で2回呼んでも solveSeatings は1回だけ', async () => {
    const d = deferred<SolveResponse>()
    vi.mocked(solveSeatings).mockReturnValue(d.promise)
    useStore.setState({ ...BASE_STATE, students: FOUR_STUDENTS })
    const { result } = renderHook(() => useSolve())
    let p1!: Promise<void>
    let p2!: Promise<void>
    act(() => {
      p1 = result.current.handleSolve()
      p2 = result.current.handleSolve()
    })
    await act(async () => { d.resolve(OK_WITH_SOLUTION); await Promise.all([p1, p2]) })
    expect(solveSeatings).toHaveBeenCalledOnce()
    expect(useStore.getState().isSolving).toBe(false)
    expect(useStore.getState().solveResult).toEqual(OK_WITH_SOLUTION)
  })
})
