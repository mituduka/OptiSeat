import type { SolveRequest, SolveResponse, ScoreRequest, ScoreResponse, ServerConfig, ValidateRequest, ValidateResponse } from '@/types'

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

/**
 * fetch の共通ラッパー。
 * - HTTP エラーはステータスとレスポンス本文を含む Error に変換
 * - 接続失敗（fetch が投げる TypeError）は日本語のネットワークエラーに変換
 */
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${API_BASE}${path}`, init)
  } catch (err) {
    if (err instanceof TypeError) {
      throw new Error('ネットワークエラー: サーバーに接続できません')
    }
    throw err
  }
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`API エラー ${res.status}: ${text}`)
  }
  return res.json() as Promise<T>
}

function postJson<T>(path: string, payload: unknown): Promise<T> {
  return request<T>(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export function solveSeatings(payload: SolveRequest): Promise<SolveResponse> {
  return postJson<SolveResponse>('/api/v1/solve', payload)
}

export function scoreAssignments(payload: ScoreRequest): Promise<ScoreResponse> {
  return postJson<ScoreResponse>('/api/v1/score', payload)
}

export async function fetchConfig(): Promise<ServerConfig> {
  const data = await request<{
    max_students: number
    solver_timeout_default: number
    solver_timeout_max: number
    solver_max_solutions_default: number
    solver_max_solutions_max: number
    seat_max_rows: number
    seat_max_cols: number
  }>('/api/v1/config')
  return {
    maxStudents: data.max_students,
    solverTimeoutDefault: data.solver_timeout_default,
    solverTimeoutMax: data.solver_timeout_max,
    solverMaxSolutionsDefault: data.solver_max_solutions_default,
    solverMaxSolutionsMax: data.solver_max_solutions_max,
    seatMaxRows: data.seat_max_rows,
    seatMaxCols: data.seat_max_cols,
  }
}

export function validateConstraints(payload: ValidateRequest): Promise<ValidateResponse> {
  return postJson<ValidateResponse>('/api/v1/validate', payload)
}
