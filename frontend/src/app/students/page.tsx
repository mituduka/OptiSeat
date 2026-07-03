'use client'

import { Info } from 'lucide-react'
import StudentTable from '@/components/StudentTable'
import ConfirmButton from '@/components/ConfirmButton'
import HelpPanel from '@/components/HelpPanel'
import PageHeader from '@/components/PageHeader'
import NextStepBar from '@/components/NextStepBar'
import { useStore } from '@/lib/store'
import { useHasHydrated } from '@/hooks/useHasHydrated'
import type { RelativeFixedConstraint, ConstraintToggles } from '@/types'
import {
  SAMPLE_STUDENTS,
  SAMPLE_SEAT_SETTINGS,
  SAMPLE_GROUPS,
  SAMPLE_FIXED,
  SAMPLE_FORBIDDEN,
  SAMPLE_SEAT_GENDER,
  SAMPLE_RELATIVE_FIXED,
  SAMPLE_LEADER_GROUPS,
  SAMPLE_CONSTRAINT_TOGGLES,
} from '@/lib/sampleData'

export default function StudentsPage() {
  const {
    students,
    leaderGroups,
    openDataModal,
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
  } = useStore()

  const hydrated = useHasHydrated()

  function handleInsertSample() {
    setStudents(SAMPLE_STUDENTS)
    updateSeat(SAMPLE_SEAT_SETTINGS)
    setGroups(SAMPLE_GROUPS)

    clearFixed()
    SAMPLE_FIXED.forEach((c) => addFixed(c))

    clearForbidden()
    SAMPLE_FORBIDDEN.forEach((c) => addForbidden(c))

    clearSeatGender()
    SAMPLE_SEAT_GENDER.forEach((c) => addSeatGender(c))

    clearRelativeFixed()
    const byStudentA = new Map<number, RelativeFixedConstraint[]>()
    SAMPLE_RELATIVE_FIXED.forEach((c) => {
      if (!byStudentA.has(c.studentIdA)) byStudentA.set(c.studentIdA, [])
      byStudentA.get(c.studentIdA)!.push(c)
    })
    byStudentA.forEach((constraints, studentIdA) => {
      setRelativeFixed(studentIdA, constraints)
    })

    leaderGroups.forEach((lg) => removeLeaderGroup(lg.id))
    SAMPLE_LEADER_GROUPS.forEach((lg) => addLeaderGroup(lg))

    // サンプルには前回座席が含まれないため、以前のデータが残らないようクリアする
    setPrevAssign([])

    const keys: (keyof ConstraintToggles)[] = [
      'gender_balance', 'loneliness', 'differ_seat', 'differ_neighbor', 'differ_group',
    ]
    keys.forEach((key) => updateConstraintToggle(key, SAMPLE_CONSTRAINT_TOGGLES[key]))
  }

  // localStorage からのデータ復元が終わるまで描画しない（リロード直後に空の名簿が一瞬見えるのを防ぐ）
  if (!hydrated) return null

  return (
    // 他ページと同じ通常フローに揃える。行に xl:overflow-hidden を付けると行自体が
    // sticky の基準スクロールポートになり、HelpPanel が top-8 分押し下げられてずれる
    <div className="flex flex-col gap-6 xl:flex-row xl:gap-8 xl:items-start">
      <div className="flex-1 min-w-0 flex flex-col gap-4 xl:gap-8 xl:min-h-0">
        <PageHeader
          step="/students"
          lead="氏名を登録してください。ブラウザにのみ保存され、サーバーには送信されません。"
        />
        <section className="card p-4 md:p-6 flex flex-col gap-4 xl:flex-1 xl:min-h-0">
          <div className="flex items-center justify-between">
            <span className="text-sm text-ink-muted">登録済み: {students.length} 名</span>
            <div className="flex items-center gap-2">
              <ConfirmButton
                onConfirm={handleInsertSample}
                needsConfirm={students.length > 0}
                confirmChildren="本当に上書きしますか？"
                className="btn btn-sm"
                idleClassName="btn-quiet"
                confirmClassName="bg-warning text-white hover:bg-warning-strong"
              >
                サンプルデータ挿入
              </ConfirmButton>
              {students.length > 0 && (
                <button
                  onClick={() => openDataModal('reset')}
                  className="btn btn-sm btn-danger"
                >
                  全削除
                </button>
              )}
            </div>
          </div>

          {students.length === 0 && (
            <div className="flex items-center justify-between bg-primary-soft border border-primary-pale rounded-lg px-4 py-3">
              <div className="flex items-center gap-2">
                <Info size={16} className="text-primary shrink-0" />
                <p className="text-sm text-primary-strong">
                  前回のデータがある場合は、インポート機能から復元できます。
                </p>
              </div>
              <button
                onClick={() => openDataModal('import')}
                className="ml-4 shrink-0 text-sm text-primary font-bold underline underline-offset-2 hover:text-primary-strong transition-colors"
              >
                インポートを開く →
              </button>
            </div>
          )}

          <StudentTable />
        </section>

        {students.length > 0 && (
          <NextStepBar
            href="/settings"
            label="次へ: 条件設定"
            note={`${students.length} 名を登録済み。次は座席や班の条件を設定します。`}
          />
        )}
      </div>
      <HelpPanel
        title="使い方"
        steps={[
          '前回データ（json形式）がある場合は、「データ管理」→「インポート」から復元できます',
          '氏名、性別、配慮事項を入力して「追加」ボタンをクリック',
          '入力した内容は後から編集できます',
          '⠿ アイコンをドラッグして順序を入れ替えられます',
        ]}
        tips={[
          '氏名はローカルで管理され、外部に送信されることはありません。',
          '前側配慮: 教室の前側の座席を割り当てます。',
          '後側配慮: 教室の後側の座席を割り当てます。',
        ]}
      />
    </div>
  )
}
