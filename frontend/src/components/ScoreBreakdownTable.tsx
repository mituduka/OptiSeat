'use client'

import { useState, Fragment } from 'react'
import { createPortal } from 'react-dom'
import { Info } from 'lucide-react'
import { totalViolationCount, CONSTRAINT_TOGGLE_DEPS } from '@/lib/seats'
import type { ScoreBreakdown, ConstraintMeta, ConstraintToggles } from '@/types'

interface ScoreBreakdownTableProps {
  scoreBreakdown: ScoreBreakdown
  constraintMeta: ConstraintMeta[]
  constraintToggles?: ConstraintToggles
  showViolationDetail?: boolean
}

interface InfoButtonProps {
  text: string
  muted?: boolean
  onShow: (text: string, target: HTMLElement) => void
  onHide: () => void
}

/**
 * 説明ツールチップのトリガー。ホバーに加えフォーカスでも表示し、Escape で閉じられる。
 * aria-label に説明全文を持つため、スクリーンリーダーはツールチップなしで内容を得られる。
 */
function InfoButton({ text, muted = false, onShow, onHide }: InfoButtonProps) {
  return (
    <button
      type="button"
      aria-label={text}
      className={`inline-flex cursor-help ${muted ? 'text-slate-300' : 'text-slate-400 hover:text-ink-soft'}`}
      onMouseEnter={(e) => onShow(text, e.currentTarget)}
      onMouseLeave={onHide}
      onFocus={(e) => onShow(text, e.currentTarget)}
      onBlur={onHide}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onHide()
      }}
    >
      <Info size={14} />
    </button>
  )
}

const SOFT_HEADER_TIP =
  'なるべく満たすべき制約です。違反があっても配置は成立しますが、違反が少ないほど良い配置です。優先度が高いものから順に最小化されます。'
const HARD_HEADER_TIP =
  '必ず満たすべき制約です。自動計算では常に守られますが、手動で座席を入れ替えた場合に違反が発生することがあります。'

export default function ScoreBreakdownTable({
  scoreBreakdown,
  constraintMeta,
  constraintToggles,
  showViolationDetail = false,
}: ScoreBreakdownTableProps) {
  const [tooltip, setTooltip] = useState<{ texts: string[]; x: number; y: number } | null>(null)

  const showTip = (text: string, target: HTMLElement) => {
    const rect = target.getBoundingClientRect()
    setTooltip({ texts: [text], x: rect.left + rect.width / 2, y: rect.top })
  }
  const hideTip = () => setTooltip(null)

  const totalViolations = totalViolationCount(scoreBreakdown, constraintMeta, constraintToggles)

  // priority_level 降順でソート（null = ハード制約 → 最後）
  const sortedMeta = [...constraintMeta].sort((a, b) => {
    const pa = a.priorityLevel ?? -Infinity
    const pb = b.priorityLevel ?? -Infinity
    return pb - pa
  })

  let shownSoftHeader = false
  let shownHardHeader = false

  return (
    <>
      <div className="bg-canvas rounded-lg p-3 border border-line">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-bold text-ink-soft">制約違反</span>
          <span className={`text-sm font-bold ${totalViolations > 0 ? 'text-error-strong' : 'text-success-strong'}`}>
            {totalViolations > 0 ? `違反 ${totalViolations} 件` : '違反なし'}
          </span>
        </div>
        <table className="w-full text-sm">
          <tbody>
            {sortedMeta.map((meta, i) => {
              const key = meta.key as keyof ScoreBreakdown
              const count = scoreBreakdown[key] ?? 0
              const prevMeta = i > 0 ? sortedMeta[i - 1] : null
              const isSoft = meta.priorityLevel !== null
              const isHard = meta.priorityLevel === null
              const levelChanged = i > 0 && meta.priorityLevel !== prevMeta?.priorityLevel

              const toggleKey = CONSTRAINT_TOGGLE_DEPS[meta.key]
              const isDisabled =
                toggleKey !== undefined &&
                constraintToggles !== undefined &&
                !constraintToggles[toggleKey]

              const headers: React.ReactNode[] = []

              // ソフト制約セクション見出し
              if (isSoft && !shownSoftHeader) {
                shownSoftHeader = true
                headers.push(
                  <tr key="soft-header">
                    <td colSpan={2} className="pt-2 pb-1">
                      <span className="inline-flex items-center gap-1">
                        <span className="text-sm font-bold text-slate-600">ソフト制約</span>
                        {showViolationDetail && (
                          <InfoButton text={SOFT_HEADER_TIP} onShow={showTip} onHide={hideTip} />
                        )}
                      </span>
                    </td>
                  </tr>
                )
              }

              // ハード制約セクション見出し
              if (isHard && !shownHardHeader) {
                shownHardHeader = true
                headers.push(
                  <tr key="hard-header">
                    <td colSpan={2} className="pt-3 pb-1">
                      <span className="inline-flex items-center gap-1">
                        <span className="text-sm font-bold text-slate-600">ハード制約</span>
                        {showViolationDetail && (
                          <InfoButton text={HARD_HEADER_TIP} onShow={showTip} onHide={hideTip} />
                        )}
                      </span>
                    </td>
                  </tr>
                )
              }

              // 優先度レベル小見出し（ソフト制約のみ、レベル変更時）
              if (isSoft && (i === 0 || levelChanged)) {
                headers.push(
                  <tr key={`level-${meta.priorityLevel}`}>
                    <td colSpan={2} className="pt-1 pb-0">
                      <span className="text-xs text-slate-400 font-medium">優先度 {meta.priorityLevel}</span>
                    </td>
                  </tr>
                )
              }

              return (
                <Fragment key={meta.key}>
                  {headers}
                  <tr className="border-t border-slate-200">
                    <td className={`py-1 pl-2 ${isDisabled ? 'text-slate-300' : 'text-slate-500'}`}>
                      <span className={`inline-flex items-center gap-1 ${isDisabled ? 'line-through' : ''}`}>
                        {meta.label}
                        {showViolationDetail && meta.description && (
                          <InfoButton text={meta.description} muted={isDisabled} onShow={showTip} onHide={hideTip} />
                        )}
                      </span>
                    </td>
                    <td className="py-1 text-right font-medium">
                      {isDisabled ? (
                        <span className="text-slate-300 text-xs">無効</span>
                      ) : (
                        <span className={count > 0 ? (isHard ? 'text-orange-500' : 'text-error') : 'text-slate-400'}>{count}</span>
                      )}
                    </td>
                  </tr>
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>

      {showViolationDetail && tooltip && createPortal(
        <div
          aria-hidden="true"
          style={{
            position: 'fixed',
            top: tooltip.y,
            left: Math.max(200, Math.min(tooltip.x, window.innerWidth - 80)),
            transform: 'translate(-50%, calc(-100% - 4px))',
            zIndex: 9999,
          }}
          className="bg-ink text-white text-sm rounded-sm px-2 py-1.5 max-w-xs pointer-events-none"
        >
          {tooltip.texts.map((t, i) => (
            <div key={i}>{t}</div>
          ))}
        </div>,
        document.body,
      )}
    </>
  )
}
