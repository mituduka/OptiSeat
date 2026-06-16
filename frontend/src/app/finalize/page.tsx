'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, CircleCheck } from 'lucide-react'
import { useStore } from '@/lib/store'
import { useHasHydrated } from '@/hooks/useHasHydrated'
import { scoreAssignments } from '@/lib/api'
import { generateSeats, groupsToApi, prevAssignToApi, seatGenderToApi, fixedToApi, leaderGroupsToApi } from '@/lib/seats'
import SeatingResult from '@/components/SeatingResult'
import HelpPanel from '@/components/HelpPanel'
import PageHeader from '@/components/PageHeader'
import type { AssignmentResult, ScoreRequest, SolutionScore } from '@/types'

function swapAssignments(
  assignments: AssignmentResult[],
  seatIdA: number,
  seatIdB: number,
): AssignmentResult[] {
  return assignments.map((a) => {
    if (a.seat_id === seatIdA) return { ...a, seat_id: seatIdB }
    if (a.seat_id === seatIdB) return { ...a, seat_id: seatIdA }
    return a
  })
}

export default function FinalizePage() {
  const router = useRouter()
  const {
    students,
    seat,
    groups,
    fixedConstraints,
    forbiddenConstraints,
    seatGenderConstraints,
    relativeFixedConstraints,
    prevAssign,
    adoptedAssignments,
    adjustingAssignments,
    finalizedAssignments,
    setAdjustingAssignments,
    setFinalizedAssignments,
    constraintToggles,
    leaderGroups,
  } = useStore()

  const hydrated = useHasHydrated()

  const { numRows, numCols, frontRowCount, backRowCount, emptySeats, numGroups } = seat

  const frontRows = Array.from({ length: frontRowCount }, (_, i) => i + 1)
  const backRows = Array.from(
    { length: backRowCount },
    (_, i) => numRows - backRowCount + 1 + i,
  )

  const allSeats = generateSeats(numRows, numCols)
  const seats = allSeats.filter((s) => !emptySeats.some((c) => c.row === s.row && c.col === s.col))

  // フォールバック: adjustingAssignments → adoptedAssignments → finalizedAssignments → []
  const initialAssignments = adjustingAssignments ?? adoptedAssignments ?? finalizedAssignments ?? []
  const [assignments, setAssignments] = useState<AssignmentResult[]>(initialAssignments)
  const [score, setScore] = useState<SolutionScore | null>(null)
  const [isScoring, setIsScoring] = useState(false)
  const [scoreError, setScoreError] = useState<string | null>(null)
  // モバイル向け: タップ交換モード（DnD と排他）
  const [tapMode, setTapMode] = useState(false)

  const activeGroups = groups.filter((g) => g.groupId <= numGroups)

  // スコアリクエストのキャンセル用（レースコンディション防止）
  const scoreRequestId = useRef(0)

  const fetchScore = useCallback(async (current: AssignmentResult[]) => {
    const requestId = ++scoreRequestId.current
    setIsScoring(true)
    setScoreError(null)
    const payload: ScoreRequest = {
      assignments: current,
      students: students.map((s) => ({ id: s.id, gender: s.gender, tags: s.tags })),
      seats,
      classroom: {
        num_rows: numRows,
        num_cols: numCols,
        front_rows: frontRows,
        back_rows: backRows.length > 0 ? backRows : undefined,
      },
      groups: groupsToApi(groups, numGroups, numRows, numCols),
      constraints: {
        fixed: fixedToApi(fixedConstraints, numCols),
        forbidden: forbiddenConstraints.map((f) => ({
          student_id_a: f.studentIdA,
          student_id_b: f.studentIdB,
          type: f.type,
        })),
        seat_gender: seatGenderToApi(seatGenderConstraints, numCols),
        relative_fixed: relativeFixedConstraints.map((c) => ({
          student_id_a: c.studentIdA,
          student_id_b: c.studentIdB,
          d_row: c.dRow,
          d_col: c.dCol,
        })),
        leader_groups: leaderGroupsToApi(leaderGroups),
      },
      prev_assign: prevAssignToApi(prevAssign, numCols),
    }
    try {
      const result = await scoreAssignments(payload)
      if (requestId !== scoreRequestId.current) return // 古いリクエストは破棄
      setScore(result.score)
    } catch (err) {
      if (requestId !== scoreRequestId.current) return
      setScoreError(err instanceof Error ? err.message : '不明なエラー')
    } finally {
      if (requestId === scoreRequestId.current) {
        setIsScoring(false)
      }
    }
  }, [students, seats, groups, numGroups, fixedConstraints, forbiddenConstraints, seatGenderConstraints, relativeFixedConstraints, prevAssign, frontRows, backRows, numRows, numCols])

  // マウント時に自動スコア計算
  useEffect(() => {
    if (assignments.length > 0) {
      fetchScore(assignments)
    }
    // 初回マウント時のみ実行
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleSeatSwap(seatIdA: number, seatIdB: number) {
    const next = swapAssignments(assignments, seatIdA, seatIdB)
    setAssignments(next)
    setAdjustingAssignments(next)
    fetchScore(next)
  }

  function handleFinalize() {
    setFinalizedAssignments(assignments)
    setAdjustingAssignments(null)
    router.push('/display')
  }

  const helpPanel = (
    <HelpPanel
      title="使い方"
      steps={[
        '座席をドラッグして別の席にドロップして入れ替え',
        '満足したら「配置確定」をクリック',
      ]}
      tips={[
        'リアルタイムで制約違反のチェックを行います。',
      ]}
    />
  )

  // localStorage からのデータ復元が終わるまで描画しない（配置があるのに「採用された配置がありません」が一瞬見えるのを防ぐ）
  if (!hydrated) return null

  if (!adjustingAssignments && !adoptedAssignments && !finalizedAssignments) {
    return (
      <div className="flex flex-col gap-6 xl:flex-row xl:gap-8 xl:items-start">
        <div className="flex-1 min-w-0 space-y-6 xl:min-h-[600px]">
          <PageHeader step="/finalize" />
          <div className="card text-center py-12 px-4 text-ink-muted">
            <p className="text-lg font-bold text-ink-soft">採用された配置がありません</p>
            <p className="text-sm mt-2">
              ひとつ前の「実行」ステップで配置を計算し、「この配置を採用」を選択してください。
            </p>
            <Link href="/solve" className="btn btn-primary mt-5">
              <ArrowLeft size={16} />
              実行ステップに戻る
            </Link>
          </div>
        </div>
        {helpPanel}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6 xl:flex-row xl:gap-8 xl:items-start">
      <div className="flex-1 min-w-0 space-y-6">
        <PageHeader
          step="/finalize"
          lead="座席を入れ替えて微調整し、満足したら「配置確定」で結果ステップへ進みます。"
          actions={
            <button onClick={handleFinalize} className="btn btn-primary">
              <CircleCheck size={16} />
              配置確定
            </button>
          }
        />
        <p className="text-sm text-ink-muted md:hidden -mt-2">
          座席をタップで交換するか、ドラッグ&ドロップで交換できます。
        </p>

        {/* タップ交換モード切替（モバイルのみ） */}
        <div className="md:hidden flex items-center gap-2 bg-canvas border border-line rounded-lg px-3 py-2">
          <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
            <input
              type="checkbox"
              checked={tapMode}
              onChange={(e) => setTapMode(e.target.checked)}
              className="w-4 h-4 accent-primary"
            />
            <span className="font-medium text-ink-soft">タップで交換</span>
          </label>
          <span className="text-sm text-ink-faint">セルをタップして入れ替え</span>
        </div>

        {scoreError && (
          <div role="alert" className="bg-error-soft border border-error text-error-strong rounded-lg px-4 py-3 text-sm">
            スコア計算エラー: {scoreError}
          </div>
        )}

        <SeatingResult
          numRows={numRows}
          numCols={numCols}
          frontRows={frontRows}
          backRows={backRows}
          assignments={assignments}
          students={students}
          scoreBreakdown={score?.breakdown ?? { front_preferred_violation: 0, back_preferred_violation: 0, group_gender_imbalance: 0, loneliness_violation: 0, prev_assign_same: 0, prev_neighbor_same: 0, prev_group_same: 0, fixed_violation: 0, gender_constraint_violation: 0, relative_fixed_violation: 0, forbidden_violation: 0, leader_group_violation: 0 }}
          scoreTotal={score?.total ?? 0}
          groups={activeGroups}
          fixedConstraints={fixedConstraints}
          forbiddenConstraints={forbiddenConstraints}
          seatGenderConstraints={seatGenderConstraints}
          relativeFixedConstraints={relativeFixedConstraints}
          prevAssign={prevAssign}
          leaderGroups={leaderGroups}
          showAllLeaderGroups
          emptySeats={emptySeats}
          draggable
          tapMode={tapMode}
          onSeatSwap={handleSeatSwap}
          constraintToggles={constraintToggles}
          showViolationDetail
        />
      </div>
      {helpPanel}
    </div>
  )
}
