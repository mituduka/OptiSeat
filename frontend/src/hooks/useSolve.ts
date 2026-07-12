'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useStore } from '@/lib/store'
import { solveSeatings, validateConstraints } from '@/lib/api'
import { generateSeats, groupsToApi, prevAssignToApi, seatGenderToApi, fixedToApi, leaderGroupsToApi, compareSolutionsLex } from '@/lib/seats'
import { CONSTRAINT_META } from '@/lib/constraintLabels'
import type { SolveRequest, ValidationWarning, PrevSeatOptions, Solution } from '@/types'

export function useSolve() {
  const router = useRouter()
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
    solveResult,
    isSolving,
    setSolveResult,
    setIsSolving,
    adoptSolution,
    setAdoptedAssignments,
    setAdjustingAssignments,
    setFinalizedAssignments,
    constraintToggles,
    solverMaxSolutionsDefault,
    solverTimeoutDefault,
    seatMaxRows,
    seatMaxCols,
  } = useStore()

  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [warnings, setWarnings] = useState<ValidationWarning[]>([])

  const { numRows, numCols, frontRowCount, backRowCount, emptySeats, numGroups } = seat

  const frontRows = Array.from({ length: frontRowCount }, (_, i) => i + 1)
  const backRows = Array.from(
    { length: backRowCount },
    (_, i) => numRows - backRowCount + 1 + i,
  )

  const allSeats = generateSeats(numRows, numCols)
  const seats = allSeats.filter((s) => !emptySeats.some((c) => c.row === s.row && c.col === s.col))

  async function handleSolve() {
    if (students.length === 0) {
      setErrorMsg('名簿が登録されていません')
      return
    }
    if (students.length > seats.length) {
      setErrorMsg(`児童・生徒数（${students.length}人）が有効座席数（${seats.length}席）を超えています`)
      return
    }
    if (numRows < 1 || numRows > seatMaxRows || numCols < 1 || numCols > seatMaxCols) {
      setErrorMsg(`グリッドサイズが範囲外です（行・列とも1〜${seatMaxRows}）`)
      return
    }
    setErrorMsg(null)
    setWarnings([])
    setAdoptedAssignments(null)
    setAdjustingAssignments(null)
    setFinalizedAssignments(null)
    // solveResult はここでクリアしない。再計算中に解候補が消えるとページの
    // 高さが縮んでスクロール位置が先頭にクランプされてしまうため、
    // 前回の結果を表示したまま（画面側で減光）新しい結果で置き換える
    setIsSolving(true)

    const prevSeatOptions: PrevSeatOptions = {
      differ_seat: constraintToggles.differ_seat,
      differ_neighbor: constraintToggles.differ_neighbor,
      differ_group: constraintToggles.differ_group,
    }
    const hasPrevOptions =
      prevSeatOptions.differ_seat ||
      prevSeatOptions.differ_neighbor ||
      prevSeatOptions.differ_group

    const payload: SolveRequest = {
      students: students.map((s) => ({
        id: s.id,
        gender: s.gender,
        tags: s.tags,
      })),
      seats,
      classroom: {
        num_rows: numRows,
        num_cols: numCols,
        front_rows: frontRows,
        // 常に配列で送る。空配列は「後側エリアなし」（省略すると
        // バックエンドが最終行を自動設定してしまい 0 行の意図が伝わらない）
        back_rows: backRows,
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
      options: {
        max_solutions: solverMaxSolutionsDefault,
        timeout: solverTimeoutDefault,
        prev_options: hasPrevOptions ? prevSeatOptions : undefined,
        soft_toggles: {
          gender_balance: constraintToggles.gender_balance,
          loneliness: constraintToggles.loneliness,
        },
      },
    }

    try {
      try {
        const validation = await validateConstraints({
          students: payload.students,
          seats: payload.seats,
          constraints: {
            fixed: payload.constraints.fixed,
            forbidden: payload.constraints.forbidden,
            seat_gender: payload.constraints.seat_gender,
            relative_fixed: payload.constraints.relative_fixed,
            leader_groups: payload.constraints.leader_groups,
          },
        })
        if (validation.warnings.length > 0) {
          setWarnings(validation.warnings)
        }
      } catch {
        // バリデーション失敗時は警告なしで続行
      }

      const result = await solveSeatings(payload)
      setSolveResult(result)
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '不明なエラーが発生しました')
    } finally {
      setIsSolving(false)
    }
  }

  function handleAdopt(activeTab: number) {
    const solution = solutions[activeTab]
    if (!solution) return
    setFinalizedAssignments(null)
    setAdjustingAssignments(null)
    adoptSolution(solution.assignments)
    router.push('/finalize')
  }

  const solutions: Solution[] = [...(solveResult?.solutions ?? [])].sort(
    (a, b) => compareSolutionsLex(a.score.breakdown, b.score.breakdown, CONSTRAINT_META, constraintToggles),
  )

  return {
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
  }
}
