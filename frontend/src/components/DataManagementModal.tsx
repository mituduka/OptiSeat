'use client'

import { useState, useRef } from 'react'
import { X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useStore } from '@/lib/store'
import { seatIdToPosition } from '@/lib/seats'
import type { ExportData, Gender, TagType, RelativeFixedConstraint, ConstraintToggles, LeaderGroup } from '@/types'
import Modal from './Modal'

interface Props {
  onClose: () => void
  defaultTab?: 'export' | 'import' | 'reset'
}

// ─── インポートデータの構造検証 ────────────────────────────────────────────
// インポート内容は localStorage に永続化されるため、壊れたファイルを
// そのまま取り込むと全ページがクラッシュし全リセットでしか復旧できなくなる。
// 取り込み前に主要フィールドの型を検証し、不正ならエラーメッセージを返す。

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

/** {row, col} 座標の配列か */
function isCoordArray(v: unknown): boolean {
  return Array.isArray(v) && v.every((c) => isRecord(c) && isNum(c.row) && isNum(c.col))
}

const VALID_TAGS: readonly string[] = ['front_preferred', 'back_preferred']
const VALID_FORBID_TYPES: readonly string[] = ['adjacent8', 'same_group']

function validateExportData(parsed: unknown): string | null {
  if (!isRecord(parsed)) return 'ファイル形式が不正です（JSON オブジェクトではありません）'
  if (parsed.version !== 1) return '非対応のファイル形式です（version が不正）'

  if (parsed.chartTitle !== undefined && typeof parsed.chartTitle !== 'string') {
    return '座席表タイトル（chartTitle）の形式が不正です'
  }

  if (parsed.students !== undefined) {
    if (!Array.isArray(parsed.students)) return 'students が配列ではありません'
    for (const s of parsed.students) {
      if (!isRecord(s) || typeof s.id !== 'number' || typeof s.name !== 'string') {
        return '名簿データの形式が不正です（id / name）'
      }
      if (s.gender !== 'male' && s.gender !== 'female') {
        return `無効な性別値が含まれています: "${String(s.gender)}"（${s.name || `ID${s.id}`}）`
      }
      if (!Array.isArray(s.tags) || s.tags.some((t) => !VALID_TAGS.includes(t as string))) {
        return `無効なタグが含まれています（${s.name || `ID${s.id}`}）`
      }
    }
  }

  if (parsed.seat !== undefined) {
    if (!isRecord(parsed.seat)) return 'seat の形式が不正です'
    const settings = parsed.seat.settings
    if (
      !isRecord(settings) ||
      !isNum(settings.numRows) ||
      !isNum(settings.numCols) ||
      !isNum(settings.frontRowCount) ||
      !isNum(settings.backRowCount) ||
      !isNum(settings.numGroups) ||
      !isCoordArray(settings.emptySeats)
    ) {
      return '座席設定（seat.settings）の形式が不正です'
    }
    // 各制約は要素レベルまで検証する（壊れた要素が localStorage に永続化されると
    // 全ページがクラッシュし、全リセットでしか復旧できなくなるため）
    const seat = parsed.seat
    if (
      !Array.isArray(seat.groups) ||
      seat.groups.some((g) => !isRecord(g) || !isNum(g.groupId) || !isCoordArray(g.seatCoords))
    ) {
      return '条件データ（seat.groups）の形式が不正です'
    }
    if (
      !Array.isArray(seat.seatGenderConstraints) ||
      seat.seatGenderConstraints.some(
        (c) =>
          !isRecord(c) || !isNum(c.row) || !isNum(c.col) ||
          (c.allowedGender !== 'male' && c.allowedGender !== 'female'),
      )
    ) {
      return '条件データ（seat.seatGenderConstraints）の形式が不正です'
    }
    if (
      !Array.isArray(seat.fixedConstraints) ||
      seat.fixedConstraints.some(
        (c) => !isRecord(c) || !isNum(c.studentId) || !isNum(c.row) || !isNum(c.col),
      )
    ) {
      return '条件データ（seat.fixedConstraints）の形式が不正です'
    }
    if (
      !Array.isArray(seat.forbiddenConstraints) ||
      seat.forbiddenConstraints.some(
        (c) =>
          !isRecord(c) || !isNum(c.studentIdA) || !isNum(c.studentIdB) ||
          !VALID_FORBID_TYPES.includes(c.type as string),
      )
    ) {
      return '条件データ（seat.forbiddenConstraints）の形式が不正です'
    }
    if (
      !Array.isArray(seat.relativeFixedConstraints) ||
      seat.relativeFixedConstraints.some(
        (c) =>
          !isRecord(c) || !isNum(c.studentIdA) || !isNum(c.studentIdB) ||
          !isNum(c.dRow) || !isNum(c.dCol),
      )
    ) {
      return '条件データ（seat.relativeFixedConstraints）の形式が不正です'
    }
    if (
      seat.leaderGroups !== undefined &&
      (!Array.isArray(seat.leaderGroups) ||
        seat.leaderGroups.some(
          (lg) =>
            !isRecord(lg) || typeof lg.id !== 'string' || typeof lg.name !== 'string' ||
            !Array.isArray(lg.studentIds) || lg.studentIds.some((sid) => !isNum(sid)),
        ))
    ) {
      return '条件データ（seat.leaderGroups）の形式が不正です'
    }
  }

  if (parsed.assignments !== undefined) {
    if (
      !Array.isArray(parsed.assignments) ||
      parsed.assignments.some(
        (a) => !isRecord(a) || typeof a.student_id !== 'number' || typeof a.seat_id !== 'number',
      )
    ) {
      return '配置データ（assignments）の形式が不正です'
    }
  }

  return null
}

export default function DataManagementModal({ onClose, defaultTab = 'export' }: Props) {
  const router = useRouter()
  const [tab, setTab] = useState<'export' | 'import' | 'reset'>(defaultTab)
  const [resetConfirm, setResetConfirm] = useState(false)

  // Export チェックボックス状態
  const [exportStudents, setExportStudents] = useState(true)
  const [exportClassroom, setExportClassroom] = useState(true)
  const [exportAssignments, setExportAssignments] = useState(true)

  // Import 状態
  const [importFile, setImportFile] = useState<ExportData | null>(null)
  const [importStudents, setImportStudents] = useState(false)
  const [importClassroom, setImportClassroom] = useState(false)
  const [importAssignments, setImportAssignments] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)

  const maxStudents = useStore((s) => s.maxStudents)

  const {
    students,
    seat,
    groups,
    fixedConstraints,
    forbiddenConstraints,
    seatGenderConstraints,
    relativeFixedConstraints,
    leaderGroups,
    adoptedAssignments,
    finalizedAssignments,
    chartTitle,
    constraintToggles,
    setStudents,
    updateSeat,
    setGroups,
    addFixed,
    clearFixed,
    addForbidden,
    clearForbidden,
    addSeatGender,
    clearSeatGender,
    setRelativeFixed,
    clearRelativeFixed,
    addLeaderGroup,
    removeLeaderGroup,
    setPrevAssign,
    updateConstraintToggle,
    resetAll,
  } = useStore()

  // ─── エクスポート ─────────────────────────────────────────────────────────

  function handleExport() {
    const data: ExportData = {
      version: 1,
      exportedAt: new Date().toISOString(),
    }

    // 記録用メタデータ（インポート時には適用されない）
    if (chartTitle.trim()) {
      data.chartTitle = chartTitle.trim()
    }

    if (exportStudents) {
      data.students = students.map((s) => ({
        id: s.id,
        name: s.name,
        gender: s.gender,
        tags: s.tags,
      }))
    }

    if (exportStudents && exportClassroom) {
      data.seat = {
        settings: seat,
        groups,
        seatGenderConstraints,
        fixedConstraints,
        forbiddenConstraints,
        relativeFixedConstraints,
        leaderGroups,
        constraintToggles,
      }
    }

    if (exportStudents && exportAssignments) {
      const assignments = finalizedAssignments ?? adoptedAssignments
      if (assignments) {
        data.assignments = assignments
      }
    }

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `optiseat-export-${new Date().toISOString().slice(0, 10)}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    onClose()
  }

  // ─── インポート ───────────────────────────────────────────────────────────

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setImportError(null)
    setImportFile(null)
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (evt) => {
      try {
        const parsed: unknown = JSON.parse(evt.target?.result as string)
        const validationError = validateExportData(parsed)
        if (validationError) {
          setImportError(validationError)
          return
        }
        const data = parsed as ExportData
        setImportFile(data)
        setImportStudents(!!data.students)
        setImportClassroom(!!data.seat)
        setImportAssignments(!!data.assignments)
      } catch {
        setImportError('JSON の解析に失敗しました')
      }
    }
    reader.onerror = () => {
      setImportError('ファイルの読み込みに失敗しました')
    }
    reader.readAsText(file)
  }

  function handleImport() {
    if (!importFile) return

    if (importStudents && importFile.students && importFile.students.length > maxStudents) {
      setImportError(`登録数が上限（${maxStudents}名）を超えています（${importFile.students.length}名）`)
      return
    }

    if (importStudents && importFile.students) {
      // 性別・タグ等の値はファイル読み込み時（validateExportData）に検証済み
      setStudents(
        importFile.students.map((s) => ({
          id: s.id,
          name: s.name,
          gender: s.gender as Gender,
          tags: s.tags as TagType[],
        })),
      )
    }

    if (importStudents && importClassroom && importFile.seat) {
      const cls = importFile.seat
      updateSeat(cls.settings)
      setGroups(cls.groups)

      clearFixed()
      cls.fixedConstraints.forEach((c) => addFixed(c))

      clearForbidden()
      cls.forbiddenConstraints.forEach((c) => addForbidden(c))

      clearSeatGender()
      cls.seatGenderConstraints.forEach((c) => addSeatGender(c))

      clearRelativeFixed()
      // studentIdA ごとにグループ化してから setRelativeFixed を呼ぶ
      const byStudentA = new Map<number, RelativeFixedConstraint[]>()
      cls.relativeFixedConstraints.forEach((c) => {
        if (!byStudentA.has(c.studentIdA)) byStudentA.set(c.studentIdA, [])
        byStudentA.get(c.studentIdA)!.push(c)
      })
      byStudentA.forEach((constraints, studentIdA) => {
        setRelativeFixed(studentIdA, constraints)
      })

      if (cls.leaderGroups) {
        // 既存のリーダーグループを削除してからインポート
        const currentLeaderGroups = useStore.getState().leaderGroups
        currentLeaderGroups.forEach((lg) => removeLeaderGroup(lg.id))
        ;(cls.leaderGroups as LeaderGroup[]).forEach((lg) => addLeaderGroup(lg))
      }

      if (cls.constraintToggles) {
        const keys: (keyof ConstraintToggles)[] = ['gender_balance', 'loneliness', 'differ_seat', 'differ_neighbor', 'differ_group']
        keys.forEach((key) => {
          if (cls.constraintToggles![key] !== undefined) {
            updateConstraintToggle(key, cls.constraintToggles![key])
          }
        })
      }
    }

    if (importStudents && importAssignments && importFile.assignments) {
      const nc = importFile.seat?.settings?.numCols ?? seat.numCols
      setPrevAssign(
        importFile.assignments.map((a: { student_id: number; seat_id: number }) => ({
          student_id: a.student_id,
          ...seatIdToPosition(a.seat_id, nc),
        })),
      )
    }

    onClose()
    router.push('/students')
  }

  // ─── UI ──────────────────────────────────────────────────────────────────

  return (
    <Modal onClose={onClose} maxWidth="md" labelledBy="data-modal-title">
      {/* ヘッダー */}
      <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b">
        <h2 id="data-modal-title" className="text-lg font-bold">データ管理</h2>
        <button
          onClick={onClose}
          aria-label="閉じる"
          className="text-slate-400 hover:text-slate-600"
        >
          <X size={18} />
        </button>
      </div>

      {/* タブ */}
      <div className="flex border-b px-4 sm:px-6">
          {(['export', 'import', 'reset'] as const).map((t) => {
            const labels = { export: 'エクスポート', import: 'インポート', reset: 'リセット' }
            return (
              <button
                key={t}
                onClick={() => { setTab(t); setResetConfirm(false) }}
                aria-current={tab === t ? true : undefined}
                className={`py-3 px-4 text-sm font-medium border-b-2 transition-colors ${tab === t
                  ? t === 'reset'
                    ? 'border-error text-error-strong'
                    : 'border-primary text-primary'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
                  }`}
              >
                {labels[t]}
              </button>
            )
          })}
        </div>

        {/* タブ本体 */}
        <div className="px-4 sm:px-6 py-5 space-y-4">
          {tab === 'reset' ? (
            <>
              <p className="text-sm text-slate-500">
                すべてのデータを初期状態に戻します。この操作は取り消せません。
              </p>
              <div className="bg-error-soft border border-error rounded-lg px-4 py-3 text-sm text-error-strong space-y-1">
                <p className="font-medium">削除されるデータ:</p>
                <ul className="list-disc list-inside text-sm space-y-0.5 text-error-strong">
                  <li>名簿（氏名・性別・配慮タグ）</li>
                  <li>教室設定（グリッド・班・空席）</li>
                  <li>全制約</li>
                  <li>前回座席データ</li>
                  <li>採用・確定済み配置</li>
                  <li>探索オプション設定</li>
                </ul>
              </div>
              {resetConfirm ? (
                <div className="space-y-3">
                  <p className="text-sm font-medium text-error-strong text-center">本当に削除しますか？</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setResetConfirm(false)}
                      className="btn btn-quiet flex-1"
                    >
                      キャンセル
                    </button>
                    <button
                      onClick={() => { resetAll(); onClose() }}
                      className="btn flex-1 bg-error text-white hover:bg-error-strong"
                    >
                      削除する
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setResetConfirm(true)}
                  className="btn w-full bg-error text-white hover:bg-error-strong"
                >
                  全データを削除する
                </button>
              )}
            </>
          ) : tab === 'export' ? (
            <>
              <p className="text-sm text-slate-500">
                エクスポートする項目を選択してください。
              </p>
              <div className="space-y-2">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={exportStudents}
                    onChange={(e) => {
                      setExportStudents(e.target.checked)
                      if (!e.target.checked) {
                        setExportClassroom(false)
                        setExportAssignments(false)
                      }
                    }}
                    className="w-4 h-4 accent-primary"
                  />
                  <span className="text-sm font-medium">名簿</span>
                  <span className="text-sm text-slate-400">（{students.length} 名）</span>
                </label>

                <label
                  className={`flex items-center gap-3 ${exportStudents ? 'cursor-pointer' : 'opacity-40 cursor-not-allowed'}`}
                >
                  <input
                    type="checkbox"
                    checked={exportClassroom && exportStudents}
                    disabled={!exportStudents}
                    onChange={(e) => setExportClassroom(e.target.checked)}
                    className="w-4 h-4 accent-primary"
                  />
                  <span className="text-sm font-medium">教室設定・制約</span>
                  <span className="text-sm text-slate-400">（名簿に依存）</span>
                </label>

                <label
                  className={`flex items-center gap-3 ${exportStudents ? 'cursor-pointer' : 'opacity-40 cursor-not-allowed'}`}
                >
                  <input
                    type="checkbox"
                    checked={exportAssignments && exportStudents}
                    disabled={!exportStudents}
                    onChange={(e) => setExportAssignments(e.target.checked)}
                    className="w-4 h-4 accent-primary"
                  />
                  <span className="text-sm font-medium">配置結果</span>
                  <span className="text-sm text-slate-400">
                    （インポート時は前回席として扱われます）
                  </span>
                </label>
              </div>

              <button
                onClick={handleExport}
                className="btn btn-primary w-full"
              >
                JSON としてダウンロード
              </button>
            </>
          ) : (
            <>
              <p className="text-sm text-slate-500">
                エクスポートした JSON ファイルを読み込みます。
              </p>

              {/* ファイル選択 */}
              <div>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full py-2 border-2 border-dashed border-slate-300 rounded-lg text-sm text-slate-500 hover:border-primary hover:text-primary transition-colors"
                >
                  ファイルを選択（.json）
                </button>
                <input
                  ref={fileInputRef}
                  id="import-file-input"
                  type="file"
                  accept=".json"
                  aria-label="インポートするJSONファイルを選択"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </div>

              {importError && (
                <p role="alert" className="text-sm text-error-strong bg-error-soft rounded-sm px-3 py-2">
                  {importError}
                </p>
              )}

              {importFile && (
                <>
                  <div className="text-sm text-slate-400">
                    エクスポート日時: {new Date(importFile.exportedAt).toLocaleString('ja-JP')}
                  </div>

                  <p className="text-sm text-slate-600 font-medium">取り込む項目:</p>
                  <div className="space-y-2">
                    <label
                      className={`flex items-center gap-3 ${importFile.students ? 'cursor-pointer' : 'opacity-40 cursor-not-allowed'}`}
                    >
                      <input
                        type="checkbox"
                        checked={importStudents}
                        disabled={!importFile.students}
                        onChange={(e) => {
                          setImportStudents(e.target.checked)
                          if (!e.target.checked) {
                            setImportClassroom(false)
                            setImportAssignments(false)
                          }
                        }}
                        className="w-4 h-4 accent-primary"
                      />
                      <span className="text-sm font-medium">名簿</span>
                      {importFile.students && (
                        <span className="text-sm text-slate-400">
                          （{importFile.students.length} 名）
                        </span>
                      )}
                    </label>

                    <label
                      className={`flex items-center gap-3 ${importStudents && importFile.seat ? 'cursor-pointer' : 'opacity-40 cursor-not-allowed'}`}
                    >
                      <input
                        type="checkbox"
                        checked={importClassroom && importStudents}
                        disabled={!importStudents || !importFile.seat}
                        onChange={(e) => setImportClassroom(e.target.checked)}
                        className="w-4 h-4 accent-primary"
                      />
                      <span className="text-sm font-medium">教室設定・制約</span>
                      {!importFile.seat && (
                        <span className="text-sm text-slate-400">（データなし）</span>
                      )}
                    </label>

                    <label
                      className={`flex items-center gap-3 ${importStudents && importFile.assignments ? 'cursor-pointer' : 'opacity-40 cursor-not-allowed'}`}
                    >
                      <input
                        type="checkbox"
                        checked={importAssignments && importStudents}
                        disabled={!importStudents || !importFile.assignments}
                        onChange={(e) => setImportAssignments(e.target.checked)}
                        className="w-4 h-4 accent-primary"
                      />
                      <span className="text-sm font-medium">配置結果</span>
                      <span className="text-sm text-slate-400">（前回席として読み込み）</span>
                      {!importFile.assignments && (
                        <span className="text-sm text-slate-400">（データなし）</span>
                      )}
                    </label>
                  </div>

                  <button
                    onClick={handleImport}
                    disabled={!importStudents && !importClassroom && !importAssignments}
                    className="btn btn-primary w-full"
                  >
                    インポート実行
                  </button>
                </>
              )}
            </>
          )}
        </div>

        {/* フッター */}
        <div className="px-4 sm:px-6 py-4 border-t flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 transition-colors"
          >
            閉じる
          </button>
        </div>
    </Modal>
  )
}
