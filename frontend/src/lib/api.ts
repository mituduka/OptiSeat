import type { ApiErrorDetail, SolveRequest, SolveResponse, ScoreRequest, ScoreResponse, ServerConfig, ValidateRequest, ValidateResponse, ValidationErrorItem } from '@/types'

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

/** HTTP エラー応答を表す Error。message は利用者に表示できる日本語文 */
export class ApiError extends Error {
  readonly status: number
  /** 機械可読なエラーコード（例: "SOLVER_ERROR"）。ボディに無ければ null */
  readonly code: string | null

  constructor(message: string, status: number, code: string | null = null) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

function isErrorDetail(v: unknown): v is ApiErrorDetail {
  return (
    typeof v === 'object' && v !== null &&
    typeof (v as ApiErrorDetail).code === 'string' &&
    typeof (v as ApiErrorDetail).message === 'string'
  )
}

function isValidationItem(v: unknown): v is ValidationErrorItem {
  return typeof v === 'object' && v !== null && typeof (v as ValidationErrorItem).msg === 'string'
}

function formatValidationItem(item: ValidationErrorItem): string {
  const msg = item.msg.replace(/^Value error, /, '')
  // 先頭の "body" はリクエスト本文を指すだけなので省く
  const loc = Array.isArray(item.loc) ? item.loc.filter((p, i) => !(i === 0 && p === 'body')) : []
  return loc.length > 0 ? `${loc.join('.')}: ${msg}` : msg
}

/**
 * エラー応答のボディから利用者向けの ApiError を組み立てる。
 * - `{"detail": {"code", "message"}}`（ソルバ内部エラー等の 5xx）
 * - `{"detail": [{loc, msg, type}, ...]}`（FastAPI の 422）
 * - `{"detail": "..."}`
 * いずれにも当てはまらない場合はステータスと本文をそのまま載せる。
 */
export function buildApiError(status: number, text: string): ApiError {
  let detail: unknown
  try {
    detail = (JSON.parse(text) as { detail?: unknown } | null)?.detail
  } catch {
    detail = undefined
  }
  const suffix = `（API エラー ${status}）`

  if (isErrorDetail(detail)) {
    if (detail.code === 'SOLVER_ERROR' || status >= 500) {
      const reason = detail.message.replace(/。$/, '')
      return new ApiError(
        `サーバー側の問題で計算できませんでした（${reason}）。時間をおいて再実行してください。` +
          `解消しない場合は管理者に連絡してください（エラーコード: ${detail.code}）`,
        status,
        detail.code,
      )
    }
    return new ApiError(`${detail.message}${suffix}`, status, detail.code)
  }
  if (Array.isArray(detail) && detail.length > 0 && detail.every(isValidationItem)) {
    return new ApiError(
      `入力内容に誤りがあります: ${detail.map(formatValidationItem).join(' / ')}${suffix}`,
      status,
    )
  }
  if (typeof detail === 'string' && detail.length > 0) {
    return new ApiError(`${detail}${suffix}`, status)
  }
  if (status >= 500) {
    return new ApiError(
      `サーバー側の問題で処理できませんでした。時間をおいて再実行してください（API エラー ${status}: ${text}）`,
      status,
    )
  }
  return new ApiError(`API エラー ${status}: ${text}`, status)
}

/**
 * fetch の共通ラッパー。
 * - HTTP エラーはボディを解釈し、利用者向けの日本語メッセージを持つ ApiError に変換
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
    throw buildApiError(res.status, text)
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
