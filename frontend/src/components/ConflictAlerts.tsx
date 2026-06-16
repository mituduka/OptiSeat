import { OctagonAlert } from 'lucide-react'
import {
  detectGenderFixedConflicts,
  detectRelativeFixedForbiddenConflicts,
  detectFixedSeatConflicts,
  detectFixedForbiddenConflicts,
  detectFixedRelativeConflicts,
  detectFixedSameGroupConflicts,
  detectRelativeForbiddenPositionConflicts,
  detectRelativeRelativeForbiddenConflicts,
} from '@/lib/constraints'
import { CONSTRAINT_DEFS } from '@/lib/constraintLabels'
import type {
  Student,
  FixedConstraint,
  ForbiddenConstraint,
  SeatGenderConstraint,
  RelativeFixedConstraint,
  Group,
} from '@/types'

interface ConflictAlertsProps {
  students: Student[]
  fixedConstraints: FixedConstraint[]
  forbiddenConstraints: ForbiddenConstraint[]
  seatGenderConstraints: SeatGenderConstraint[]
  relativeFixedConstraints: RelativeFixedConstraint[]
  groups: Group[]
  numGroups: number
}

/**
 * 制約の矛盾を検出し、hasConflicts フラグと各矛盾リストを返す。
 * ボタンの disabled 判定など、レンダリング外で使いたい場合に利用する。
 */
export function computeConflicts(props: ConflictAlertsProps) {
  const {
    students,
    fixedConstraints,
    forbiddenConstraints,
    seatGenderConstraints,
    relativeFixedConstraints,
    groups,
    numGroups,
  } = props

  const genderFixed = detectGenderFixedConflicts(seatGenderConstraints, fixedConstraints, students)
  const rfFb = detectRelativeFixedForbiddenConflicts(forbiddenConstraints, relativeFixedConstraints)
  const fixedSeat = detectFixedSeatConflicts(fixedConstraints)
  const fixedForbidden = detectFixedForbiddenConflicts(fixedConstraints, forbiddenConstraints)
  const fixedRelative = detectFixedRelativeConflicts(fixedConstraints, relativeFixedConstraints)
  const fixedSameGroup = detectFixedSameGroupConflicts(fixedConstraints, forbiddenConstraints, groups, numGroups)
  const relativePositionForbidden = detectRelativeForbiddenPositionConflicts(
    fixedConstraints, forbiddenConstraints, relativeFixedConstraints,
  )
  const relativeRelativeForbidden = detectRelativeRelativeForbiddenConflicts(
    forbiddenConstraints, relativeFixedConstraints,
  )

  const hasConflicts =
    genderFixed.length > 0 ||
    rfFb.length > 0 ||
    fixedSeat.length > 0 ||
    fixedForbidden.length > 0 ||
    fixedRelative.length > 0 ||
    fixedSameGroup.length > 0 ||
    relativePositionForbidden.length > 0 ||
    relativeRelativeForbidden.length > 0

  return { genderFixed, rfFb, fixedSeat, fixedForbidden, fixedRelative, fixedSameGroup, relativePositionForbidden, relativeRelativeForbidden, hasConflicts }
}

/**
 * 制約の矛盾を検出して警告バナーを表示するコンポーネント。
 * 矛盾がない場合は何もレンダリングしない。
 */
export default function ConflictAlerts(props: ConflictAlertsProps) {
  const { students } = props
  const { genderFixed, rfFb, fixedSeat, fixedForbidden, fixedRelative, fixedSameGroup, relativePositionForbidden, relativeRelativeForbidden, hasConflicts } =
    computeConflicts(props)

  if (!hasConflicts) return null

  return (
    <div role="alert" className="bg-error-soft border border-error text-error-strong rounded-lg px-4 py-3 text-sm">
      <div className="flex items-start gap-2">
        <OctagonAlert size={15} className="shrink-0 mt-0.5" />
        <div>
          <p className="font-medium">制約の矛盾があるため実行できません。条件設定画面で修正してください。</p>
          <ul className="mt-1 space-y-0.5 text-sm">
            {genderFixed.map((c, i) => (
              <li key={`g-${i}`}>
                {c.row}行{c.col}列: {c.studentName} の性別と{CONSTRAINT_DEFS.gender_constraint.short}が矛盾
              </li>
            ))}
            {rfFb.map((c, i) => {
              const nameA = students.find((s) => s.id === c.studentIdA)?.name ?? `ID:${c.studentIdA}`
              const nameB = students.find((s) => s.id === c.studentIdB)?.name ?? `ID:${c.studentIdB}`
              return (
                <li key={`rf-${i}`}>{nameA} と {nameB}: {CONSTRAINT_DEFS.relative_fixed.short}と{CONSTRAINT_DEFS.forbidden_adjacent8.short}が矛盾</li>
              )
            })}
            {fixedSeat.map((c, i) => (
              <li key={`fs-${i}`}>{c.row}行{c.col}列: 複数人が同じ座席に固定されています</li>
            ))}
            {fixedForbidden.map((c, i) => {
              const nameA = students.find((s) => s.id === c.studentIdA)?.name ?? `ID:${c.studentIdA}`
              const nameB = students.find((s) => s.id === c.studentIdB)?.name ?? `ID:${c.studentIdB}`
              return (
                <li key={`ff-${i}`}>{nameA}（{c.rowA}行{c.colA}列）と {nameB}（{c.rowB}行{c.colB}列）: {CONSTRAINT_DEFS.fixed.short}と{CONSTRAINT_DEFS.forbidden_adjacent8.short}が矛盾</li>
              )
            })}
            {fixedRelative.map((c, i) => {
              const nameA = students.find((s) => s.id === c.studentIdA)?.name ?? `ID:${c.studentIdA}`
              const nameB = students.find((s) => s.id === c.studentIdB)?.name ?? `ID:${c.studentIdB}`
              return (
                <li key={`fr-${i}`}>{nameA}（{c.rowA}行{c.colA}列）と {nameB}（{c.rowB}行{c.colB}列）: {CONSTRAINT_DEFS.relative_fixed.short}条件を満たしていません</li>
              )
            })}
            {fixedSameGroup.map((c, i) => {
              const nameA = students.find((s) => s.id === c.studentIdA)?.name ?? `ID:${c.studentIdA}`
              const nameB = students.find((s) => s.id === c.studentIdB)?.name ?? `ID:${c.studentIdB}`
              return (
                <li key={`fsg-${i}`}>{nameA}（{c.rowA}行{c.colA}列）と {nameB}（{c.rowB}行{c.colB}列）: {CONSTRAINT_DEFS.forbidden_same_group.short}ですが固定位置が同じ{c.groupId}班</li>
              )
            })}
            {relativePositionForbidden.map((c, i) => {
              const nameBase = students.find((s) => s.id === c.baseStudentId)?.name ?? `ID:${c.baseStudentId}`
              const nameDerived = students.find((s) => s.id === c.derivedStudentId)?.name ?? `ID:${c.derivedStudentId}`
              const nameConflict = students.find((s) => s.id === c.conflictStudentId)?.name ?? `ID:${c.conflictStudentId}`
              return (
                <li key={`rpf-${i}`}>
                  {nameBase}（{c.baseRow}行{c.baseCol}列）の隣接固定で
                  {nameDerived}（{c.derivedRow}行{c.derivedCol}列）が
                  {nameConflict}（{c.conflictRow}行{c.conflictCol}列）との隣接禁止と矛盾
                </li>
              )
            })}
            {relativeRelativeForbidden.map((c, i) => {
              const nameBase = students.find((s) => s.id === c.baseStudentId)?.name ?? `ID:${c.baseStudentId}`
              const nameB = students.find((s) => s.id === c.studentIdB)?.name ?? `ID:${c.studentIdB}`
              const nameC = students.find((s) => s.id === c.studentIdC)?.name ?? `ID:${c.studentIdC}`
              return (
                <li key={`rrf-${i}`}>{nameBase}の隣接固定制約が、{nameB}と{nameC}の隣接禁止制約と矛盾</li>
              )
            })}
          </ul>
        </div>
      </div>
    </div>
  )
}
