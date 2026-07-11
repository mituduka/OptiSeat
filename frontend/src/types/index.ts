// ---------------------------------------------------------------------------
// ドメイン型
// ---------------------------------------------------------------------------

export type Gender = 'male' | 'female'
export type TagType = 'front_preferred' | 'back_preferred'

export interface Student {
  id: number       // 出席番号（1始まり）
  name: string     // 氏名（ローカル保存のみ・API送信しない）
  gender: Gender
  tags: TagType[]
}

export interface SeatSettings {
  numRows: number
  numCols: number
  frontRowCount: number  // 前から何行を前側配慮エリアにするか（デフォルト: 1）
  backRowCount: number   // 後ろから何行を後側配慮エリアにするか（デフォルト: 1）
  emptySeats: { row: number; col: number }[]   // 空席として使用しない座席の座標リスト
  numGroups: number      // 班数（デフォルト: 1）
}

export interface Group {
  groupId: number
  seatCoords: { row: number; col: number }[]  // 座標ベース管理（列数変更対応）
}

export interface FixedConstraint {
  studentId: number
  row: number
  col: number
}

export interface ForbiddenConstraint {
  studentIdA: number
  studentIdB: number
  type: 'adjacent8' | 'same_group'
}

export interface SeatGenderConstraint {
  row: number
  col: number
  allowedGender: 'male' | 'female'
}

export interface RelativeFixedConstraint {
  studentIdA: number
  studentIdB: number
  dRow: -1 | 0 | 1
  dCol: -1 | 0 | 1
}

export interface LeaderGroup {
  id: string          // UUID（フロントエンド管理用）
  name: string        // グループ名（例:「班長」）
  studentIds: number[]
  showLabel?: boolean // 結果・印刷にグループ名を表示するか（未指定は true 扱い）
}

// ---------------------------------------------------------------------------
// API リクエスト型
// ---------------------------------------------------------------------------

export interface StudentInput {
  id: number
  gender: Gender
  tags: TagType[]
}

export interface SeatInput {
  id: number
  row: number
  col: number
}

export interface SeatConfig {
  num_rows: number
  num_cols: number
  front_rows: number[]
  back_rows?: number[]
}

export interface GroupLayout {
  group_id: number
  seat_ids: number[]
}

export interface FixedConstraintApi {
  student_id: number
  seat_id: number
}

export interface ForbiddenConstraintApi {
  student_id_a: number
  student_id_b: number
  type: 'adjacent8' | 'same_group'
}

export interface SeatGenderConstraintApi {
  seat_id: number
  allowed_gender: 'male' | 'female'
}

export interface RelativeFixedConstraintApi {
  student_id_a: number
  student_id_b: number
  d_row: -1 | 0 | 1
  d_col: -1 | 0 | 1
}

export interface LeaderGroupApi {
  group_id: number
  student_ids: number[]
}

export interface ConstraintConfig {
  fixed: FixedConstraintApi[]
  forbidden: ForbiddenConstraintApi[]
  seat_gender: SeatGenderConstraintApi[]
  relative_fixed: RelativeFixedConstraintApi[]
  leader_groups: LeaderGroupApi[]
}

export interface PrevAssignment {
  student_id: number
  row: number
  col: number
}

export interface PrevAssignmentApi {
  student_id: number
  seat_id: number
}

export interface PrevSeatOptions {
  differ_seat: boolean     // S-05: 前回と異なる座席
  differ_neighbor: boolean // O-2: 前回と左右の隣を変える
  differ_group: boolean    // O-3: 前回と異なる班メンバー
}

export interface ConstraintToggles {
  gender_balance: boolean    // 班内男女偏り（デフォルト: false = 無効）
  loneliness: boolean        // 近隣同性なし（デフォルト: false = 無効）
  differ_seat: boolean       // 前回と異なる座席（デフォルト: false = 無効）
  differ_neighbor: boolean   // 前回と左右隣を変える（デフォルト: false = 無効）
  differ_group: boolean      // 前回と異なる班（デフォルト: false = 無効）
}

export interface SoftToggles {
  gender_balance: boolean
  loneliness: boolean
}

export interface SolveOptions {
  max_solutions: number
  timeout: number
  prev_options?: PrevSeatOptions
  soft_toggles?: SoftToggles
}

export interface ScoreRequest {
  assignments: AssignmentResult[]
  students: StudentInput[]
  seats: SeatInput[]
  classroom: SeatConfig
  groups: GroupLayout[]
  constraints: ConstraintConfig
  prev_assign: PrevAssignmentApi[]
}

export interface ScoreResponse {
  score: SolutionScore
}

export interface SolveRequest {
  students: StudentInput[]
  seats: SeatInput[]
  classroom: SeatConfig
  groups: GroupLayout[]
  constraints: ConstraintConfig
  prev_assign: PrevAssignmentApi[]
  options: SolveOptions
}

// ---------------------------------------------------------------------------
// API レスポンス型
// ---------------------------------------------------------------------------

export interface ScoreBreakdown {
  front_preferred_violation: number
  back_preferred_violation: number
  group_gender_imbalance: number
  loneliness_violation: number
  prev_assign_same: number
  prev_neighbor_same: number           // 前回左右一致件数
  prev_group_same: number              // 前回同班件数
  fixed_violation: number              // 固定制約違反件数（手動変更で発生しうる）
  gender_constraint_violation: number  // 性別制約違反件数（手動変更で発生しうる）
  relative_fixed_violation: number     // 隣接固定制約違反件数（手動変更で発生しうる）
  forbidden_violation: number          // 隣接禁止制約違反件数（手動変更で発生しうる）
  leader_group_violation: number       // 班分散グループ違反件数（手動変更で発生しうる）
}

// ---------------------------------------------------------------------------
// サーバー設定型
// ---------------------------------------------------------------------------

export interface ServerConfig {
  maxStudents: number
  solverTimeoutDefault: number
  solverTimeoutMax: number
  solverMaxSolutionsDefault: number
  solverMaxSolutionsMax: number
  seatMaxRows: number
  seatMaxCols: number
}

// ---------------------------------------------------------------------------
// 制約メタデータ型
// ---------------------------------------------------------------------------

export interface ConstraintMeta {
  key: string
  label: string
  description: string
  weight: number | null
  priorityLevel: number | null
}

export interface SolutionScore {
  total: number
  breakdown: ScoreBreakdown
}

export interface AssignmentResult {
  student_id: number
  seat_id: number
}

export interface Solution {
  rank: number
  score: SolutionScore
  assignments: AssignmentResult[]
}

export interface SolveError {
  code: string
  message: string
}

export type SolveStatus = 'ok' | 'unsatisfiable' | 'timeout'

export interface SolveResponse {
  status: SolveStatus
  elapsed_ms: number
  solutions: Solution[]
  error: SolveError | null
}

// ---------------------------------------------------------------------------
// エクスポート / インポート型
// ---------------------------------------------------------------------------

export interface ExportData {
  version: 1
  exportedAt: string
  /** 座席表タイトル（記録用。インポート時には適用しない） */
  chartTitle?: string
  students?: Array<{ id: number; name: string; gender: string; tags: string[] }>
  seat?: {
    settings: SeatSettings
    groups: Group[]
    seatGenderConstraints: SeatGenderConstraint[]
    fixedConstraints: FixedConstraint[]
    forbiddenConstraints: ForbiddenConstraint[]
    relativeFixedConstraints: RelativeFixedConstraint[]
    leaderGroups?: LeaderGroup[]
    constraintToggles?: ConstraintToggles
  }
  assignments?: AssignmentResult[]
}

// ---------------------------------------------------------------------------
// バリデーション型
// ---------------------------------------------------------------------------

export interface ValidationWarning {
  code: string
  message: string
}

export interface ValidateResponse {
  valid: boolean
  warnings: ValidationWarning[]
}

export interface ValidateRequest {
  students: { id: number; gender: string; tags: string[] }[]
  seats: SeatInput[]
  constraints: {
    fixed: { student_id: number; seat_id: number }[]
    forbidden: { student_id_a: number; student_id_b: number; type: 'adjacent8' | 'same_group' }[]
    seat_gender: SeatGenderConstraintApi[]
    relative_fixed: RelativeFixedConstraintApi[]
    leader_groups: LeaderGroupApi[]
  }
}
