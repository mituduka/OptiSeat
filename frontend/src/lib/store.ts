import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
  Student,
  SeatSettings,
  Group,
  FixedConstraint,
  ForbiddenConstraint,
  SeatGenderConstraint,
  RelativeFixedConstraint,
  LeaderGroup,
  SolveResponse,
  PrevAssignment,
  AssignmentResult,
  ConstraintToggles,
  ServerConfig,
} from '@/types'

// ---------------------------------------------------------------------------
// 状態の型
// ---------------------------------------------------------------------------

interface OptiSeatState {
  // ドメインデータ
  students: Student[]
  seat: SeatSettings
  groups: Group[]
  fixedConstraints: FixedConstraint[]
  forbiddenConstraints: ForbiddenConstraint[]
  seatGenderConstraints: SeatGenderConstraint[]
  relativeFixedConstraints: RelativeFixedConstraint[]
  leaderGroups: LeaderGroup[]
  prevAssign: PrevAssignment[]

  // ソルバ結果
  solveResult: SolveResponse | null
  isSolving: boolean

  // 配置採用（配置調整ページ用）
  adoptedAssignments: AssignmentResult[] | null

  // 配置調整中（DnD操作の中間状態）
  adjustingAssignments: AssignmentResult[] | null

  // 配置確定（配置表示ページ用）
  finalizedAssignments: AssignmentResult[] | null

  // 座席表タイトル（空文字なら既定の「座席表」を使う）
  chartTitle: string

  // サーバー設定（APIから取得、永続化しない）
  maxStudents: number
  solverTimeoutDefault: number
  solverTimeoutMax: number
  solverMaxSolutionsDefault: number
  solverMaxSolutionsMax: number
  seatMaxRows: number
  seatMaxCols: number

  // ソフト制約トグル（永続化する）
  constraintToggles: ConstraintToggles

  // アクション: 名簿
  addStudent: (student: Student) => void
  removeStudent: (id: number) => void
  updateStudent: (id: number, patch: Partial<Omit<Student, 'id'>>) => void
  setStudents: (students: Student[]) => void
  reorderStudents: (fromIndex: number, toIndex: number) => void

  // アクション: 座席設定
  updateSeat: (patch: Partial<SeatSettings>) => void
  toggleEmptySeat: (coord: { row: number; col: number }) => void

  // アクション: 班
  setGroups: (groups: Group[]) => void

  // アクション: 班分散グループ
  addLeaderGroup: (group: LeaderGroup) => void
  removeLeaderGroup: (id: string) => void
  updateLeaderGroup: (id: string, updates: Partial<Omit<LeaderGroup, 'id'>>) => void

  // アクション: 制約
  addFixed: (c: FixedConstraint) => void
  removeFixed: (studentId: number) => void
  addForbidden: (c: ForbiddenConstraint) => void
  removeForbiddenGroupByType: (studentIdA: number, type: 'adjacent8' | 'same_group') => void
  replaceForbiddenGroup: (studentIdA: number, originalType: 'adjacent8' | 'same_group', newConstraints: ForbiddenConstraint[]) => void
  clearFixed: () => void
  clearForbidden: () => void
  addSeatGender: (c: SeatGenderConstraint) => void
  removeSeatGender: (coord: { row: number; col: number }) => void
  clearSeatGender: () => void
  setRelativeFixed: (studentIdA: number, constraints: RelativeFixedConstraint[]) => void
  removeRelativeFixedGroup: (studentIdA: number) => void
  clearRelativeFixed: () => void

  // アクション: 前回席
  setPrevAssign: (prev: PrevAssignment[]) => void

  // アクション: 結果
  setSolveResult: (result: SolveResponse | null) => void
  setIsSolving: (v: boolean) => void

  // アクション: 配置採用
  adoptSolution: (assignments: AssignmentResult[]) => void
  setAdoptedAssignments: (assignments: AssignmentResult[] | null) => void

  // アクション: 配置調整中
  setAdjustingAssignments: (assignments: AssignmentResult[] | null) => void

  // アクション: 配置確定
  setFinalizedAssignments: (assignments: AssignmentResult[] | null) => void

  // アクション: 座席表タイトル
  setChartTitle: (title: string) => void

  // アクション: サーバー設定
  setServerConfig: (cfg: ServerConfig) => void
  configError: string | null
  setConfigError: (err: string | null) => void

  // アクション: ソフト制約トグル
  updateConstraintToggle: (key: keyof ConstraintToggles, value: boolean) => void

  // アクション: 全データリセット
  resetAll: () => void

  // データ管理モーダル（非永続化）
  dataModalOpen: boolean
  dataModalTab: 'export' | 'import' | 'reset'
  openDataModal: (tab: 'export' | 'import' | 'reset') => void
  closeDataModal: () => void

  // モバイル用サイドバー drawer（非永続化）
  sidebarOpen: boolean
  setSidebarOpen: (open: boolean) => void
}

// ---------------------------------------------------------------------------
// ストア実装
// ---------------------------------------------------------------------------

/** 条件変更時に配置パイプライン全体をクリアする */
const CLEAR_PIPELINE = {
  solveResult: null,
  adoptedAssignments: null,
  adjustingAssignments: null,
  finalizedAssignments: null,
} as const

export const useStore = create<OptiSeatState>()(
  persist(
    (set) => ({
      students: [],
      seat: { numRows: 2, numCols: 3, frontRowCount: 1, backRowCount: 1, emptySeats: [], numGroups: 1 },
      groups: [],
      fixedConstraints: [],
      forbiddenConstraints: [],
      seatGenderConstraints: [],
      relativeFixedConstraints: [],
      leaderGroups: [],
      prevAssign: [],
      solveResult: null,
      isSolving: false,
      adoptedAssignments: null,
      adjustingAssignments: null,
      finalizedAssignments: null,
      chartTitle: '',
      dataModalOpen: false,
      dataModalTab: 'export' as const,
      sidebarOpen: false,
      // バックエンド既定（MAX_STUDENTS=50）に合わせる。config 取得成功時はサーバー値で上書きされる
      maxStudents: 50,
      solverTimeoutDefault: 30,
      solverTimeoutMax: 120,
      solverMaxSolutionsDefault: 5,
      solverMaxSolutionsMax: 10,
      seatMaxRows: 12,
      seatMaxCols: 12,
      constraintToggles: {
        gender_balance: false,
        loneliness: false,
        differ_seat: false,
        differ_neighbor: false,
        differ_group: false,
      },

      // 名簿
      addStudent: (student) =>
        set((s) => {
          if (s.students.length >= s.maxStudents) return s
          return { students: [...s.students, student] }
        }),
      removeStudent: (id) =>
        set((s) => ({
          students: s.students.filter((st) => st.id !== id),
          fixedConstraints: s.fixedConstraints.filter((f) => f.studentId !== id),
          forbiddenConstraints: s.forbiddenConstraints.filter(
            (f) => f.studentIdA !== id && f.studentIdB !== id,
          ),
          relativeFixedConstraints: s.relativeFixedConstraints.filter(
            (c) => c.studentIdA !== id && c.studentIdB !== id,
          ),
          leaderGroups: s.leaderGroups
            .map((lg) => ({ ...lg, studentIds: lg.studentIds.filter((sid) => sid !== id) }))
            .filter((lg) => lg.studentIds.length >= 2),
          prevAssign: s.prevAssign.filter((pa) => pa.student_id !== id),
          ...CLEAR_PIPELINE,
        })),
      updateStudent: (id, patch) =>
        set((s) => {
          // 氏名の変更は計算結果に影響しないが、性別・タグは制約条件なので
          // 変更時は配置パイプラインをクリアして古い解が残らないようにする
          const affectsSolve = patch.gender !== undefined || patch.tags !== undefined
          return {
            students: s.students.map((st) =>
              st.id === id ? { ...st, ...patch } : st,
            ),
            ...(affectsSolve ? CLEAR_PIPELINE : {}),
          }
        }),
      setStudents: (students) =>
        set((s) => {
          // 名簿の丸ごと差し替え（インポート・サンプル挿入）では、新名簿に存在しない
          // ID を参照する制約を残さない（removeStudent と同じカスケード削除）。
          // 残すと ID が偶然一致した別人に制約が適用されてしまう
          const ids = new Set(students.map((st) => st.id))
          return {
            students,
            fixedConstraints: s.fixedConstraints.filter((f) => ids.has(f.studentId)),
            forbiddenConstraints: s.forbiddenConstraints.filter(
              (f) => ids.has(f.studentIdA) && ids.has(f.studentIdB),
            ),
            relativeFixedConstraints: s.relativeFixedConstraints.filter(
              (c) => ids.has(c.studentIdA) && ids.has(c.studentIdB),
            ),
            leaderGroups: s.leaderGroups
              .map((lg) => ({ ...lg, studentIds: lg.studentIds.filter((sid) => ids.has(sid)) }))
              .filter((lg) => lg.studentIds.length >= 2),
            prevAssign: s.prevAssign.filter((pa) => ids.has(pa.student_id)),
            ...CLEAR_PIPELINE,
          }
        }),
      reorderStudents: (fromIndex, toIndex) =>
        set((s) => {
          const arr = [...s.students]
          const [moved] = arr.splice(fromIndex, 1)
          arr.splice(toIndex, 0, moved)
          return { students: arr, ...CLEAR_PIPELINE }
        }),
      // 座席設定
      updateSeat: (patch) =>
        set((s) => {
          const clampedPatch = { ...patch }
          if (clampedPatch.numRows !== undefined) {
            clampedPatch.numRows = Math.min(Math.max(clampedPatch.numRows, 1), s.seatMaxRows)
          }
          if (clampedPatch.numCols !== undefined) {
            clampedPatch.numCols = Math.min(Math.max(clampedPatch.numCols, 1), s.seatMaxCols)
          }
          const newNumRows = (clampedPatch.numRows ?? s.seat.numRows) as number
          const newNumCols = (clampedPatch.numCols ?? s.seat.numCols) as number
          // 行数を減らしたとき前後配慮エリアの行数が実行数を超えないようクランプする
          // （超えたまま残すと「1行目が後側エリア」のような不正な back_rows が生成される）
          clampedPatch.frontRowCount = Math.min(
            Math.max(clampedPatch.frontRowCount ?? s.seat.frontRowCount, 0), newNumRows)
          clampedPatch.backRowCount = Math.min(
            Math.max(clampedPatch.backRowCount ?? s.seat.backRowCount, 0), newNumRows)
          const anyChanged = (Object.keys(clampedPatch) as Array<keyof SeatSettings>).some((key) => {
            const newVal = clampedPatch[key]
            const oldVal = s.seat[key]
            if (Array.isArray(newVal) && Array.isArray(oldVal)) {
              // emptySeats 等の配列は内容で比較（同一内容の再設定でパイプラインを消さない）
              return JSON.stringify(newVal) !== JSON.stringify(oldVal)
            }
            return newVal !== oldVal
          })
          const fixedConstraints = s.fixedConstraints.filter(
            (f) => f.row >= 1 && f.row <= newNumRows && f.col >= 1 && f.col <= newNumCols,
          )
          const prevAssign = s.prevAssign.filter(
            (pa) => pa.row >= 1 && pa.row <= newNumRows && pa.col >= 1 && pa.col <= newNumCols,
          )
          const seatGenderConstraints = s.seatGenderConstraints.filter(
            (c) => c.row >= 1 && c.row <= newNumRows && c.col >= 1 && c.col <= newNumCols,
          )
          return {
            seat: { ...s.seat, ...clampedPatch },
            fixedConstraints,
            prevAssign,
            seatGenderConstraints,
            ...(anyChanged ? CLEAR_PIPELINE : {}),
          }
        }),
      toggleEmptySeat: (coord) =>
        set((s) => {
          const isCurrentlyEmpty = s.seat.emptySeats.some(
            (c) => c.row === coord.row && c.col === coord.col,
          )
          return {
            seat: {
              ...s.seat,
              emptySeats: isCurrentlyEmpty
                ? s.seat.emptySeats.filter(
                    (c) => !(c.row === coord.row && c.col === coord.col),
                  )
                : [...s.seat.emptySeats, coord],
            },
            // 空席として設定する場合はその座席の固定制約・性別配置制約を削除
            // （空席セルは設定 UI から操作できなくなるため、残すと除去手段がなくなる）
            fixedConstraints: isCurrentlyEmpty
              ? s.fixedConstraints
              : s.fixedConstraints.filter((f) => !(f.row === coord.row && f.col === coord.col)),
            seatGenderConstraints: isCurrentlyEmpty
              ? s.seatGenderConstraints
              : s.seatGenderConstraints.filter((c) => !(c.row === coord.row && c.col === coord.col)),
            ...CLEAR_PIPELINE,
          }
        }),

      // 班
      setGroups: (groups) => set({ groups, ...CLEAR_PIPELINE }),

      // 制約
      addFixed: (c) =>
        set((s) => ({
          fixedConstraints: [
            ...s.fixedConstraints.filter((f) => f.studentId !== c.studentId),
            c,
          ],
          ...CLEAR_PIPELINE,
        })),
      removeFixed: (studentId) =>
        set((s) => ({
          fixedConstraints: s.fixedConstraints.filter(
            (f) => f.studentId !== studentId,
          ),
          ...CLEAR_PIPELINE,
        })),
      addForbidden: (c) =>
        set((s) => {
          const type = c.type ?? 'adjacent8'
          const alreadyExists = s.forbiddenConstraints.some(
            (f) =>
              f.studentIdA === c.studentIdA &&
              f.studentIdB === c.studentIdB &&
              f.type === type,
          )
          if (alreadyExists) return s
          return {
            forbiddenConstraints: [
              ...s.forbiddenConstraints,
              { studentIdA: c.studentIdA, studentIdB: c.studentIdB, type },
            ],
            ...CLEAR_PIPELINE,
          }
        }),
      removeForbiddenGroupByType: (studentIdA, type) =>
        set((s) => ({
          forbiddenConstraints: s.forbiddenConstraints.filter(
            (f) => !(f.studentIdA === studentIdA && f.type === type),
          ),
          ...CLEAR_PIPELINE,
        })),
      replaceForbiddenGroup: (studentIdA, originalType, newConstraints) =>
        set((s) => {
          // 旧グループを除いた残存制約
          const remaining = s.forbiddenConstraints.filter(
            (f) => !(f.studentIdA === studentIdA && f.type === originalType),
          )
          // 残存制約と重複しないものだけ追加（タイプ変更時の重複を防ぐ）
          const toAdd = newConstraints.filter(
            (nc) =>
              !remaining.some(
                (f) =>
                  f.studentIdA === nc.studentIdA &&
                  f.studentIdB === nc.studentIdB &&
                  f.type === nc.type,
              ),
          )
          return {
            forbiddenConstraints: [...remaining, ...toAdd],
            ...CLEAR_PIPELINE,
          }
        }),
      clearFixed: () => set({ fixedConstraints: [], ...CLEAR_PIPELINE }),
      clearForbidden: () => set({ forbiddenConstraints: [], ...CLEAR_PIPELINE }),
      addSeatGender: (c) =>
        set((s) => ({
          seatGenderConstraints: [
            ...s.seatGenderConstraints.filter(
              (sgc) => !(sgc.row === c.row && sgc.col === c.col),
            ),
            c,
          ],
          ...CLEAR_PIPELINE,
        })),
      removeSeatGender: (coord) =>
        set((s) => ({
          seatGenderConstraints: s.seatGenderConstraints.filter(
            (sgc) => !(sgc.row === coord.row && sgc.col === coord.col),
          ),
          ...CLEAR_PIPELINE,
        })),
      clearSeatGender: () => set({ seatGenderConstraints: [], ...CLEAR_PIPELINE }),
      setRelativeFixed: (studentIdA, constraints) =>
        set((s) => ({
          relativeFixedConstraints: [
            ...s.relativeFixedConstraints.filter((c) => c.studentIdA !== studentIdA),
            ...constraints,
          ],
          ...CLEAR_PIPELINE,
        })),
      removeRelativeFixedGroup: (studentIdA) =>
        set((s) => ({
          relativeFixedConstraints: s.relativeFixedConstraints.filter(
            (c) => c.studentIdA !== studentIdA,
          ),
          ...CLEAR_PIPELINE,
        })),
      clearRelativeFixed: () => set({ relativeFixedConstraints: [], ...CLEAR_PIPELINE }),

      // 班分散グループ
      addLeaderGroup: (group) =>
        set((s) => ({
          leaderGroups: [...s.leaderGroups, group],
          ...CLEAR_PIPELINE,
        })),
      removeLeaderGroup: (id) =>
        set((s) => ({
          leaderGroups: s.leaderGroups.filter((lg) => lg.id !== id),
          ...CLEAR_PIPELINE,
        })),
      updateLeaderGroup: (id, updates) =>
        set((s) => ({
          leaderGroups: s.leaderGroups.map((lg) =>
            lg.id === id ? { ...lg, ...updates } : lg,
          ),
          ...CLEAR_PIPELINE,
        })),

      // 前回席
      setPrevAssign: (prevAssign) => set({ prevAssign, ...CLEAR_PIPELINE }),

      // 結果
      setSolveResult: (solveResult) => set({ solveResult }),
      setIsSolving: (isSolving) => set({ isSolving }),

      // 配置採用
      adoptSolution: (assignments) => set({ adoptedAssignments: [...assignments] }),
      setAdoptedAssignments: (adoptedAssignments) => set({ adoptedAssignments }),

      // 配置調整中
      setAdjustingAssignments: (adjustingAssignments) => set({ adjustingAssignments }),

      // 配置確定
      setFinalizedAssignments: (finalizedAssignments) => set({ finalizedAssignments }),

      // 座席表タイトル
      setChartTitle: (chartTitle) => set({ chartTitle }),

      // サーバー設定
      setServerConfig: (cfg) => set({
        maxStudents: cfg.maxStudents,
        solverTimeoutDefault: cfg.solverTimeoutDefault,
        solverTimeoutMax: cfg.solverTimeoutMax,
        solverMaxSolutionsDefault: cfg.solverMaxSolutionsDefault,
        solverMaxSolutionsMax: cfg.solverMaxSolutionsMax,
        seatMaxRows: cfg.seatMaxRows,
        seatMaxCols: cfg.seatMaxCols,
      }),
      configError: null,
      setConfigError: (err) => set({ configError: err }),

      // データ管理モーダル
      openDataModal: (tab) => set({ dataModalOpen: true, dataModalTab: tab }),
      closeDataModal: () => set({ dataModalOpen: false }),

      // モバイル用サイドバー
      setSidebarOpen: (open) => set({ sidebarOpen: open }),

      // ソフト制約トグル
      updateConstraintToggle: (key, value) =>
        set((s) => ({
          constraintToggles: { ...s.constraintToggles, [key]: value },
          ...CLEAR_PIPELINE,
        })),

      // 全データリセット
      resetAll: () =>
        set({
          students: [],
          seat: { numRows: 2, numCols: 3, frontRowCount: 1, backRowCount: 1, emptySeats: [], numGroups: 1 },
          groups: [],
          fixedConstraints: [],
          forbiddenConstraints: [],
          seatGenderConstraints: [],
          relativeFixedConstraints: [],
          leaderGroups: [],
          prevAssign: [],
          solveResult: null,
          isSolving: false,
          adoptedAssignments: null,
          adjustingAssignments: null,
          finalizedAssignments: null,
          chartTitle: '',
          constraintToggles: {
            gender_balance: false,
            loneliness: false,
            differ_seat: false,
            differ_neighbor: false,
            differ_group: false,
          },
        }),
    }),
    {
      name: 'optiseat-store',
      version: 1,
      // solveResult / isSolving は永続化しない
      partialize: (state) => ({
        students: state.students,
        seat: state.seat,
        groups: state.groups,
        fixedConstraints: state.fixedConstraints,
        forbiddenConstraints: state.forbiddenConstraints,
        seatGenderConstraints: state.seatGenderConstraints,
        relativeFixedConstraints: state.relativeFixedConstraints,
        leaderGroups: state.leaderGroups,
        prevAssign: state.prevAssign,
        adoptedAssignments: state.adoptedAssignments,
        adjustingAssignments: state.adjustingAssignments,
        finalizedAssignments: state.finalizedAssignments,
        chartTitle: state.chartTitle,
        constraintToggles: state.constraintToggles,
      }),
    },
  ),
)
