import { describe, it, expect, vi, beforeEach } from 'vitest'
import { solveSeatings, scoreAssignments, validateConstraints, fetchConfig } from './api'
import type { SolveRequest, SolveResponse, ScoreRequest, ScoreResponse, ValidateRequest, ValidateResponse } from '@/types'

const MOCK_REQUEST: SolveRequest = {
  students: [{ id: 1, gender: 'male', tags: [] }],
  seats: [{ id: 1, row: 1, col: 1 }],
  classroom: { num_rows: 1, num_cols: 1, front_rows: [1] },
  groups: [],
  constraints: { fixed: [], forbidden: [] },
  prev_assign: [],
  options: { max_solutions: 5, timeout: 30 },
}

const MOCK_RESPONSE: SolveResponse = {
  status: 'ok',
  elapsed_ms: 42,
  solutions: [
    {
      rank: 1,
      score: {
        total: 0,
        breakdown: {
          front_preferred_violation: 0,
          back_preferred_violation: 0,
          group_gender_imbalance: 0,
          loneliness_violation: 0,
          prev_assign_same: 0,
        },
      },
      assignments: [{ student_id: 1, seat_id: 1 }],
    },
  ],
  error: null,
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('solveSeatings', () => {
  it('POST /api/v1/solve を呼び出し SolveResponse を返す', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(MOCK_RESPONSE),
      }),
    )

    const result = await solveSeatings(MOCK_REQUEST)
    expect(result).toEqual(MOCK_RESPONSE)

    const fetchMock = vi.mocked(fetch)
    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, options] = fetchMock.mock.calls[0]
    expect(url).toContain('/api/v1/solve')
    expect(options?.method).toBe('POST')
    expect(JSON.parse(options?.body as string)).toEqual(MOCK_REQUEST)
  })

  it('Content-Type: application/json ヘッダーを送信する', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(MOCK_RESPONSE),
      }),
    )

    await solveSeatings(MOCK_REQUEST)
    const [, options] = vi.mocked(fetch).mock.calls[0]
    expect((options?.headers as Record<string, string>)['Content-Type']).toBe(
      'application/json',
    )
  })

  it('HTTP エラー時に Error をスローする', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        text: () => Promise.resolve('Unprocessable Entity'),
      }),
    )

    await expect(solveSeatings(MOCK_REQUEST)).rejects.toThrow('API エラー 422')
  })

  it('ネットワークエラー時に Error をスローする', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('Network Error')),
    )

    await expect(solveSeatings(MOCK_REQUEST)).rejects.toThrow('Network Error')
  })
})

const MOCK_SCORE_REQUEST: ScoreRequest = {
  assignments: [{ student_id: 1, seat_id: 1 }],
  students: [{ id: 1, gender: 'male', tags: [] }],
  seats: [{ id: 1, row: 1, col: 1 }],
  classroom: { num_rows: 1, num_cols: 1, front_rows: [1] },
  groups: [],
  constraints: { fixed: [], forbidden: [], seat_gender: [], relative_fixed: [] },
  prev_assign: [],
}

const MOCK_SCORE_RESPONSE: ScoreResponse = {
  score: {
    total: 0,
    breakdown: {
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
    },
  },
}

describe('scoreAssignments', () => {
  it('POST /api/v1/score を呼び出し ScoreResponse を返す', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(MOCK_SCORE_RESPONSE),
      }),
    )

    const result = await scoreAssignments(MOCK_SCORE_REQUEST)
    expect(result).toEqual(MOCK_SCORE_RESPONSE)

    const fetchMock = vi.mocked(fetch)
    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, options] = fetchMock.mock.calls[0]
    expect(url).toContain('/api/v1/score')
    expect(options?.method).toBe('POST')
    expect(JSON.parse(options?.body as string)).toEqual(MOCK_SCORE_REQUEST)
  })

  it('HTTP エラー時に Error をスローする', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Internal Server Error'),
      }),
    )

    await expect(scoreAssignments(MOCK_SCORE_REQUEST)).rejects.toThrow('API エラー 500')
  })
})

const MOCK_VALIDATE_REQUEST: ValidateRequest = {
  students: [{ id: 1, gender: 'male', tags: [] }],
  seats: [{ id: 1, row: 1, col: 1 }],
  constraints: {
    fixed: [],
    forbidden: [],
    seat_gender: [],
    relative_fixed: [],
  },
}

const MOCK_VALIDATE_RESPONSE: ValidateResponse = {
  valid: true,
  warnings: [],
}

describe('fetchConfig', () => {
  it('GET /api/v1/config を呼び出し ServerConfig を返す', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          max_students: 50,
          solver_timeout_default: 30,
          solver_timeout_max: 120,
          solver_max_solutions_default: 5,
          solver_max_solutions_max: 10,
          seat_max_rows: 10,
          seat_max_cols: 10,
        }),
      }),
    )
    const result = await fetchConfig()
    expect(result.seatMaxRows).toBe(10)
    expect(result.seatMaxCols).toBe(10)
    expect(result.maxStudents).toBe(50)
    const fetchMock = vi.mocked(fetch)
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(String(fetchMock.mock.calls[0][0])).toContain('/api/v1/config')
  })

  it('HTTP エラー時に Error をスローする', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => 'Internal Server Error' }),
    )
    await expect(fetchConfig()).rejects.toThrow('API エラー 500')
  })
})

describe('validateConstraints', () => {
  it('POST /api/v1/validate を呼び出し ValidateResponse を返す', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(MOCK_VALIDATE_RESPONSE),
      }),
    )

    const result = await validateConstraints(MOCK_VALIDATE_REQUEST)
    expect(result).toEqual(MOCK_VALIDATE_RESPONSE)

    const fetchMock = vi.mocked(fetch)
    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, options] = fetchMock.mock.calls[0]
    expect(url).toContain('/api/v1/validate')
    expect(options?.method).toBe('POST')
    expect(JSON.parse(options?.body as string)).toEqual(MOCK_VALIDATE_REQUEST)
  })

  it('HTTP エラー時に Error をスローする', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        text: () => Promise.resolve('Unprocessable Entity'),
      }),
    )

    await expect(validateConstraints(MOCK_VALIDATE_REQUEST)).rejects.toThrow('422')
  })
})
