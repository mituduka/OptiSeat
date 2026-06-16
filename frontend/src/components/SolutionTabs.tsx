import SeatingResult from '@/components/SeatingResult'
import { getHighestViolation } from '@/lib/seats'
import { CONSTRAINT_META } from '@/lib/constraintLabels'
import type {
  Solution,
  Student,
  Group,
  FixedConstraint,
  ForbiddenConstraint,
  SeatGenderConstraint,
  RelativeFixedConstraint,
  PrevAssignment,
  ConstraintToggles,
  LeaderGroup,
} from '@/types'

const LEVEL_BADGE: Record<number, { bg: string; bgActive: string; text: string; textActive: string }> = {
  5: { bg: 'bg-error-soft', bgActive: 'bg-error-soft', text: 'text-error', textActive: 'text-error-strong' },
  4: { bg: 'bg-orange-50', bgActive: 'bg-orange-100', text: 'text-orange-500', textActive: 'text-orange-700' },
  3: { bg: 'bg-warning-soft', bgActive: 'bg-yellow-100', text: 'text-warning-strong', textActive: 'text-warning-strong' },
  2: { bg: 'bg-sky-50', bgActive: 'bg-sky-100', text: 'text-sky-500', textActive: 'text-sky-700' },
  1: { bg: 'bg-slate-100', bgActive: 'bg-slate-200', text: 'text-slate-500', textActive: 'text-slate-700' },
}

interface SolutionTabsProps {
  solutions: Solution[]
  activeTab: number
  onTabChange: (i: number) => void
  onAdopt: (activeTab: number) => void
  numRows: number
  numCols: number
  frontRows: number[]
  backRows: number[]
  students: Student[]
  groups: Group[]
  numGroups: number
  fixedConstraints: FixedConstraint[]
  forbiddenConstraints: ForbiddenConstraint[]
  seatGenderConstraints: SeatGenderConstraint[]
  relativeFixedConstraints: RelativeFixedConstraint[]
  prevAssign: PrevAssignment[]
  constraintToggles: ConstraintToggles
  leaderGroups?: LeaderGroup[]
}

export default function SolutionTabs({
  solutions,
  activeTab,
  onTabChange,
  onAdopt,
  numRows,
  numCols,
  frontRows,
  backRows,
  students,
  groups,
  numGroups,
  fixedConstraints,
  forbiddenConstraints,
  seatGenderConstraints,
  relativeFixedConstraints,
  prevAssign,
  constraintToggles,
  leaderGroups = [],
}: SolutionTabsProps) {
  if (solutions.length === 0) return null

  const activeSolution = solutions[activeTab]

  return (
    <div>
      {/* タブヘッダー */}
      <div className="border-b border-line mb-4">
        <nav className="-mb-px flex flex-wrap gap-x-3 gap-y-1 md:gap-x-6" aria-label="解候補タブ">
          {solutions.map((sol, i) => {
            const highest = getHighestViolation(sol.score.breakdown, CONSTRAINT_META, constraintToggles)
            const badge = highest ? LEVEL_BADGE[highest.level] ?? LEVEL_BADGE[1] : null
            return (
              <button
                key={i}
                onClick={() => onTabChange(i)}
                aria-current={activeTab === i ? true : undefined}
                className={`whitespace-nowrap border-b-2 py-3 px-1 text-sm transition-colors ${
                  activeTab === i
                    ? 'border-primary text-primary font-bold'
                    : 'border-transparent text-ink-muted font-medium hover:border-line hover:text-ink'
                }`}
              >
                案 {i + 1}
                <span
                  className={`ml-1 md:ml-2 inline-flex items-center rounded-full px-1.5 md:px-2 py-0.5 text-[10px] md:text-xs font-medium ${
                    !badge
                      ? activeTab === i
                        ? 'bg-success-soft text-success-strong'
                        : 'bg-success-soft text-success-strong'
                      : activeTab === i
                        ? `${badge.bgActive} ${badge.textActive}`
                        : `${badge.bg} ${badge.text}`
                  }`}
                >
                  {!highest ? '違反なし' : `P${highest.level}: ${highest.count}`}
                </span>
              </button>
            )
          })}
        </nav>
      </div>

      {/* 採用ボタン */}
      {activeSolution && (
        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={() => onAdopt(activeTab)}
            className="btn btn-primary"
          >
            この配置を採用して次へ
          </button>
          <span className="text-sm text-ink-muted">
            採用すると「配置調整」ステップに進みます
          </span>
        </div>
      )}

      {/* 選択中の解 */}
      {activeSolution && (
        <SeatingResult
          numRows={numRows}
          numCols={numCols}
          frontRows={frontRows}
          backRows={backRows}
          assignments={activeSolution.assignments}
          students={students}
          scoreBreakdown={activeSolution.score.breakdown}
          scoreTotal={activeSolution.score.total}
          groups={groups.filter((g) => g.groupId <= numGroups)}
          fixedConstraints={fixedConstraints}
          forbiddenConstraints={forbiddenConstraints}
          seatGenderConstraints={seatGenderConstraints}
          relativeFixedConstraints={relativeFixedConstraints}
          prevAssign={prevAssign}
          leaderGroups={leaderGroups}
          showAllLeaderGroups
          constraintToggles={constraintToggles}
          showViolationDetail
        />
      )}
    </div>
  )
}
