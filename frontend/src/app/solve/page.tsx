'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { TriangleAlert, OctagonAlert, LayoutGrid, FileSliders, Users, Group, School, ChevronsUp, ChevronsDown } from 'lucide-react'
import { useSolve } from '@/hooks/useSolve'
import { useHasHydrated } from '@/hooks/useHasHydrated'
import { computeConflicts } from '@/components/ConflictAlerts'
import { detectGenderCapacityConflicts } from '@/lib/constraints'
import ConflictAlerts from '@/components/ConflictAlerts'
import SolutionTabs from '@/components/SolutionTabs'
import HelpPanel from '@/components/HelpPanel'
import PageHeader from '@/components/PageHeader'
import { CONSTRAINT_DEFS } from '@/lib/constraintLabels'

export function resolveStudentNames(message: string, students: { id: number; name: string }[]): string {
  return message.replace(/ID:(\d+)/g, (_, idStr) => {
    const id = parseInt(idStr, 10)
    return students.find((s) => s.id === id)?.name ?? `ID:${id}`
  })
}

function Tooltip({ text }: { text: string }) {
  // group-hover に加えて group-focus-within でキーボードフォーカス時も表示する。
  // pointer-events を無効化しない（ツールチップ自体へポインタを移動しても消えない = WCAG 1.4.13）
  return (
    <span
      aria-hidden="true"
      className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover:block group-focus-within:block bg-ink text-white text-sm rounded-sm px-2 py-1.5 whitespace-pre-line z-50 shadow-lg min-w-max max-w-[240px]"
    >
      {text}
    </span>
  )
}

/** ツールチップ付きバッジ共通: フォーカス可能にし、Escape で閉じられる（blur） */
function tooltipTriggerProps(tooltip?: string) {
  if (!tooltip) return {}
  return {
    tabIndex: 0,
    onKeyDown: (e: React.KeyboardEvent<HTMLSpanElement>) => {
      if (e.key === 'Escape') e.currentTarget.blur()
    },
  }
}

function ToggleBadge({ label, enabled, disabled, tooltip }: { label: string; enabled: boolean; disabled?: boolean; tooltip?: string }) {
  if (disabled) {
    return (
      <span {...tooltipTriggerProps(tooltip)} className="relative group flex items-center justify-between gap-1.5 cursor-default">
        {/* opacity/line-through はトリガー自体に付けるとツールチップへ継承されるため中身にのみ適用する */}
        <span className="text-xs text-slate-400 line-through opacity-40">{label}</span>
        <span className="inline-flex items-center justify-center min-w-9 h-5 px-1 rounded-sm text-xs font-semibold bg-slate-100 text-slate-400 opacity-40">
          {enabled ? 'ON' : 'OFF'}
        </span>
        {tooltip && <span className="sr-only">{tooltip}</span>}
        {tooltip && <Tooltip text={tooltip} />}
      </span>
    )
  }
  return (
    <span {...tooltipTriggerProps(tooltip)} className="relative group flex items-center justify-between gap-1.5 cursor-default">
      <span className={`text-xs ${enabled ? 'text-slate-600' : 'text-slate-400'}`}>{label}</span>
      <span className={`inline-flex items-center justify-center min-w-9 h-5 px-1 rounded-sm text-xs font-semibold ${enabled ? 'bg-success-soft text-success-strong' : 'bg-slate-100 text-slate-400'}`}>
        {enabled ? 'ON' : 'OFF'}
      </span>
      {tooltip && <span className="sr-only">{tooltip}</span>}
      {tooltip && <Tooltip text={tooltip} />}
    </span>
  )
}

function CountBadge({ label, count, tooltip }: { label: string; count: number; tooltip?: string }) {
  const hasItem = count > 0
  return (
    <span {...tooltipTriggerProps(tooltip)} className="relative group flex items-center justify-between gap-1.5 cursor-default">
      <span className={`text-xs ${hasItem ? 'text-slate-600' : 'text-slate-400'}`}>{label}</span>
      <span className={`inline-flex items-center justify-center min-w-9 h-5 px-1 rounded-sm text-xs font-semibold ${hasItem ? 'bg-primary-soft text-primary-strong' : 'bg-slate-100 text-slate-400'}`}>
        {count}
      </span>
      {tooltip && <span className="sr-only">{tooltip}</span>}
      {tooltip && <Tooltip text={tooltip} />}
    </span>
  )
}

export default function SolvePage() {
  const {
    students,
    seat,
    groups,
    fixedConstraints,
    forbiddenConstraints,
    seatGenderConstraints,
    relativeFixedConstraints,
    leaderGroups,
    prevAssign,
    constraintToggles,
    solveResult,
    isSolving,
    frontRows,
    backRows,
    seats,
    errorMsg,
    warnings,
    solutions,
    handleSolve,
    handleAdopt,
  } = useSolve()

  const hydrated = useHasHydrated()

  const [activeTab, setActiveTab] = useState(0)

  // 新しい解が得られたらタブをリセット
  useEffect(() => {
    setActiveTab(0)
  }, [solveResult])

  const { numRows, numCols, numGroups } = seat
  const { hasConflicts } = computeConflicts({
    students,
    fixedConstraints,
    forbiddenConstraints,
    seatGenderConstraints,
    relativeFixedConstraints,
    groups,
    numGroups,
  })

  const capacityIssues: string[] = []
  if (students.length === 0) {
    capacityIssues.push('名簿にメンバーが登録されていません。名簿画面からメンバーを追加してください。')
  } else if (students.length > seats.length) {
    capacityIssues.push(`児童・生徒数（${students.length}人）が有効座席数（${seats.length}席）を超えています。座席設定を見直してください。`)
  } else {
    for (const c of detectGenderCapacityConflicts(students, seatGenderConstraints, seats)) {
      const label = c.gender === 'male' ? '男性' : '女性'
      capacityIssues.push(
        `${label}の児童・生徒（${c.studentCount}人）が${label}を配置できる座席数（${c.seatCapacity}席）を超えています。${CONSTRAINT_DEFS.gender_constraint.short}を見直してください。`,
      )
    }
  }
  const hasCapacityIssues = capacityIssues.length > 0

  const leaderGroupWarnings: string[] = leaderGroups
    .filter((lg) => lg.studentIds.length > numGroups)
    .map((lg) => `「${lg.name}」グループ(${lg.studentIds.length}人)の人数が班数(${numGroups}班)を超えています。解が見つからない可能性があります。`)

  // 配慮タグ保持者がいるのにエリアが0行の場合、配慮が適用されないことを知らせる
  const zoneWarnings: string[] = []
  if (frontRows.length === 0 && students.some((s) => s.tags.includes('front_preferred'))) {
    zoneWarnings.push(`${CONSTRAINT_DEFS.front_preferred.short}のメンバーがいますが、前側エリアが未設定（0行）のため適用されません。座席設定で前側エリアの行数を確認してください。`)
  }
  if (backRows.length === 0 && students.some((s) => s.tags.includes('back_preferred'))) {
    zoneWarnings.push(`${CONSTRAINT_DEFS.back_preferred.short}のメンバーがいますが、後側エリアが未設定（0行）のため適用されません。座席設定で後側エリアの行数を確認してください。`)
  }

  // localStorage からのデータ復元が終わるまで描画しない（リロード直後に生徒数0などが一瞬見えるのを防ぐ）
  if (!hydrated) return null

  return (
    <div className="flex flex-col gap-6 xl:flex-row xl:gap-8 xl:items-start">
      <div className="flex-1 min-w-0 space-y-6 xl:min-h-[600px]">
        <PageHeader
          step="/solve"
          lead="設定内容を確認してから「計算実行」をクリックしてください。最大5つの候補を表示します。"
        />

        {/* 設定サマリー */}
        <div className="card p-3 text-sm flex flex-col divide-y divide-line-soft md:flex-row md:items-stretch md:divide-y-0 md:divide-x">
          {/* 左：教室設定 */}
          <div className="flex-2 pb-3 md:pb-0 md:pr-4 space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wide">
              <School size={12} />
              教室設定
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-slate-700">
              <span className="flex items-center gap-1">
                <Users size={13} className="text-slate-400" />
                <strong>{students.length}</strong>
                <span className="text-slate-400 text-xs">名</span>
              </span>
              <span className="flex items-center gap-1">
                <LayoutGrid size={13} className="text-slate-400" />
                <strong>{numRows}行×{numCols}列</strong>
                <span className="text-slate-400 text-xs">（{seats.length}席有効）</span>
              </span>
              <span className="flex items-center gap-1">
                <Group size={13} className="text-slate-400" />
                <strong>{groups.filter((g) => g.groupId <= numGroups).length}</strong>
                <span className="text-slate-400 text-xs">班</span>
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
              <span className="flex items-center gap-1">
                <ChevronsUp size={12} className="text-slate-400" />
                {frontRows.length > 0
                  ? <><span className="text-slate-500">前列エリア</span><strong className="text-slate-700">{frontRows.join(', ')}</strong><span className="text-slate-400">行</span></>
                  : <span className="text-slate-300">前列エリア: 未設定</span>}
              </span>
              <span className="flex items-center gap-1">
                <ChevronsDown size={12} className="text-slate-400" />
                {backRows.length > 0
                  ? <><span className="text-slate-500">後列エリア</span><strong className="text-slate-700">{backRows.join(', ')}</strong><span className="text-slate-400">行</span></>
                  : <span className="text-slate-300">後列エリア: 未設定</span>}
              </span>
            </div>
          </div>
          {/* 右：制約設定 */}
          <div className="flex-4 pt-3 md:pt-0 md:pl-4 space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wide">
              <FileSliders size={12} />
              制約設定
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-x-3 gap-y-1.5">
              <CountBadge label={CONSTRAINT_DEFS.fixed.badge} count={fixedConstraints.length} tooltip={`${CONSTRAINT_DEFS.fixed.label}\n${CONSTRAINT_DEFS.fixed.constraintDescription}`} />
              <CountBadge label={CONSTRAINT_DEFS.forbidden_adjacent8.badge} count={forbiddenConstraints.length} tooltip={`${CONSTRAINT_DEFS.forbidden_adjacent8.label}\n${CONSTRAINT_DEFS.forbidden_adjacent8.constraintDescription}`} />
              <CountBadge label={CONSTRAINT_DEFS.relative_fixed.badge} count={relativeFixedConstraints.length} tooltip={`${CONSTRAINT_DEFS.relative_fixed.label}\n${CONSTRAINT_DEFS.relative_fixed.constraintDescription}`} />
              <CountBadge label={CONSTRAINT_DEFS.gender_constraint.badge} count={seatGenderConstraints.length} tooltip={`${CONSTRAINT_DEFS.gender_constraint.label}\n${CONSTRAINT_DEFS.gender_constraint.constraintDescription}`} />
              <CountBadge label={CONSTRAINT_DEFS.leader_group.badge} count={leaderGroups.length} tooltip={`${CONSTRAINT_DEFS.leader_group.label}\n${CONSTRAINT_DEFS.leader_group.constraintDescription}`} />
              <ToggleBadge label={CONSTRAINT_DEFS.group_gender_imbalance.badge} enabled={constraintToggles.gender_balance} tooltip={`${CONSTRAINT_DEFS.group_gender_imbalance.label}\n${CONSTRAINT_DEFS.group_gender_imbalance.constraintDescription}`} />
              <ToggleBadge label={CONSTRAINT_DEFS.loneliness.badge} enabled={constraintToggles.loneliness} tooltip={`${CONSTRAINT_DEFS.loneliness.label}\n${CONSTRAINT_DEFS.loneliness.constraintDescription}`} />
              <ToggleBadge label={CONSTRAINT_DEFS.prev_assign_same.badge} enabled={constraintToggles.differ_seat} disabled={prevAssign.length === 0} tooltip={`${CONSTRAINT_DEFS.prev_assign_same.label}\n${CONSTRAINT_DEFS.prev_assign_same.constraintDescription}`} />
              <ToggleBadge label={CONSTRAINT_DEFS.prev_neighbor_same.badge} enabled={constraintToggles.differ_neighbor} disabled={prevAssign.length === 0} tooltip={`${CONSTRAINT_DEFS.prev_neighbor_same.label}\n${CONSTRAINT_DEFS.prev_neighbor_same.constraintDescription}`} />
              <ToggleBadge label={CONSTRAINT_DEFS.prev_group_same.badge} enabled={constraintToggles.differ_group} disabled={prevAssign.length === 0} tooltip={`${CONSTRAINT_DEFS.prev_group_same.label}\n${CONSTRAINT_DEFS.prev_group_same.constraintDescription}`} />
            </div>
          </div>
        </div>

        {/* 人数・座席数チェック（実行前） */}
        {hasCapacityIssues && (
          <div role="alert" className="bg-error-soft border border-error text-error-strong rounded-lg px-4 py-3 text-sm">
            <div className="flex items-start gap-2">
              <OctagonAlert size={15} className="shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">設定を確認してください。計算を実行できません。</p>
                <ul className="mt-1 space-y-0.5 text-sm">
                  {capacityIssues.map((msg, i) => <li key={i}>{msg}</li>)}
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* 班分散グループ人数警告 */}
        {leaderGroupWarnings.length > 0 && (
          <div role="status" className="bg-warning-soft border border-warning text-warning-strong rounded-lg px-4 py-3 text-sm">
            <div className="flex items-start gap-2">
              <TriangleAlert size={15} className="shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">班分散グループの設定を確認してください。</p>
                <ul className="mt-1 space-y-0.5 text-sm">
                  {leaderGroupWarnings.map((msg, i) => <li key={i}>{msg}</li>)}
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* 前後配慮エリア未設定の警告 */}
        {zoneWarnings.length > 0 && (
          <div role="status" className="bg-warning-soft border border-warning text-warning-strong rounded-lg px-4 py-3 text-sm">
            <div className="flex items-start gap-2">
              <TriangleAlert size={15} className="shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">前後配慮エリアの設定を確認してください。</p>
                <ul className="mt-1 space-y-0.5 text-sm">
                  {zoneWarnings.map((msg, i) => <li key={i}>{msg}</li>)}
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* 矛盾警告（実行前） */}
        <ConflictAlerts
          students={students}
          fixedConstraints={fixedConstraints}
          forbiddenConstraints={forbiddenConstraints}
          seatGenderConstraints={seatGenderConstraints}
          relativeFixedConstraints={relativeFixedConstraints}
          groups={groups}
          numGroups={numGroups}
        />

        {/* 実行ボタン */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
          <button
            onClick={handleSolve}
            disabled={isSolving || hasConflicts || hasCapacityIssues}
            className="btn btn-primary w-full sm:w-auto sm:px-8"
          >
            {isSolving ? (
              <>
                <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8v8H4z"
                  />
                </svg>
                計算中...
              </>
            ) : (
              '計算実行'
            )}
          </button>
          {solveResult && (
            <span className="text-sm text-slate-400">
              処理時間: {solveResult.elapsed_ms} ms
            </span>
          )}
        </div>

        {/* エラー表示 */}
        {errorMsg && (
          <div role="alert" className="bg-error-soft border border-error text-error-strong rounded-lg px-4 py-3 text-sm">
            {errorMsg}
          </div>
        )}

        {/* 警告表示 */}
        {warnings.map((w, i) => (
          <div key={i} role="status" className="bg-warning-soft border border-warning text-warning-strong rounded-lg px-4 py-3 text-sm">
            <div className="flex items-center gap-2">
              <TriangleAlert size={15} className="shrink-0" />
              <span>{resolveStudentNames(w.message, students)}</span>
            </div>
          </div>
        ))}

        {/* 解候補タブ */}
        <SolutionTabs
          solutions={solutions}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          onAdopt={handleAdopt}
          numRows={numRows}
          numCols={numCols}
          frontRows={frontRows}
          backRows={backRows}
          students={students}
          groups={groups}
          numGroups={numGroups}
          fixedConstraints={fixedConstraints}
          forbiddenConstraints={forbiddenConstraints}
          seatGenderConstraints={seatGenderConstraints}
          relativeFixedConstraints={relativeFixedConstraints}
          prevAssign={prevAssign}
          leaderGroups={leaderGroups}
          constraintToggles={constraintToggles}
          emptySeats={seat.emptySeats}
        />

        {/* 結果なし */}
        {solveResult && solutions.length === 0 && (
          <div className="card text-center py-12 px-4 text-ink-muted">
            <p className="text-lg font-bold text-ink-soft">有効な席配置が見つかりませんでした</p>
            {solveResult.status === 'unsatisfiable' && (
              <p className="text-sm mt-1">指定された制約を同時に満たす座席配置が存在しません</p>
            )}
            {solveResult.status === 'timeout' && (
              <p className="text-sm mt-1">制限時間内に解が見つかりませんでした（タイムアウト）</p>
            )}
            <p className="text-sm mt-2">制約を緩めるか、人数・座席数を確認してください</p>
            <Link href="/settings" className="btn btn-secondary mt-4">条件設定に戻る</Link>
          </div>
        )}
      </div>
      <HelpPanel
        title="使い方"
        steps={[
          '設定内容を確認',
          '「計算実行」で配置を探索',
          '表示された案を比較',
          '採用する案の「この配置を採用」をクリック',
        ]}
        tips={[
          '画面下部の「制約違反リスト」で各制約の優先度や違反件数を確認できます。',
          '違反が発生した場所の座席に！アイコンが表示されます。カーソルを合わせると詳細が表示されます。',
          '制約の優先度が高いものから順に最適化を行います。',
        ]}
      />
    </div>
  )
}
