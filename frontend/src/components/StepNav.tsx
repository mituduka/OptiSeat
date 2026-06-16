'use client'

import Link from 'next/link'
import { Check } from 'lucide-react'
import { useStore } from '@/lib/store'
import { navItems, type StepHref } from '@/lib/navItems'

/**
 * 各ステップの完了状態を store から導出する。
 * - 名簿管理: 1人以上登録済みで完了
 * - 条件設定/実行: 案を採用した時点で完了（条件は任意設定のため単独の完了条件を持たない）
 * - 配置調整/結果: 配置を確定した時点で完了
 */
export function useStepDoneMap(): Record<StepHref, boolean> {
  const students = useStore((s) => s.students)
  const adopted = useStore((s) => s.adoptedAssignments)
  const adjusting = useStore((s) => s.adjustingAssignments)
  const finalized = useStore((s) => s.finalizedAssignments)

  const hasAdopted = adopted !== null || adjusting !== null || finalized !== null
  const hasFinalized = finalized !== null

  return {
    '/students': students.length > 0,
    '/settings': hasAdopted,
    '/solve': hasAdopted,
    '/finalize': hasFinalized,
    '/display': hasFinalized,
  }
}

interface StepNavProps {
  /** 現在のステップ（href で指定） */
  current: StepHref
}

/**
 * 席替え完了までの5ステップを明示するステップ表示。
 * 完了 = チェック付き、現在 = 塗りつぶし番号、未完了 = 輪郭番号。すべてクリックで移動できる。
 */
export default function StepNav({ current }: StepNavProps) {
  const doneMap = useStepDoneMap()

  return (
    <nav aria-label="席替えステップ" className="print:hidden">
      <ol className="flex items-start">
        {navItems.map((item, i) => {
          const isCurrent = item.href === current
          const isDone = doneMap[item.href] && !isCurrent
          const isLast = i === navItems.length - 1
          return (
            <li key={item.href} className={`flex items-start min-w-0 ${isLast ? '' : 'flex-1'}`}>
              <Link
                href={item.href}
                aria-current={isCurrent ? 'step' : undefined}
                className="group flex flex-col items-center gap-1 shrink-0"
              >
                <span
                  className={`flex items-center justify-center w-7 h-7 md:w-8 md:h-8 rounded-full border-2 text-xs md:text-sm font-bold transition-colors ${
                    isCurrent
                      ? 'bg-primary border-primary text-white'
                      : isDone
                        ? 'bg-white border-primary text-primary group-hover:bg-primary-soft'
                        : 'bg-white border-line text-ink-muted group-hover:border-ink-muted'
                  }`}
                >
                  {isDone ? <Check size={14} strokeWidth={3} aria-label="完了" /> : i + 1}
                </span>
                <span
                  className={`text-[10px] md:text-xs leading-tight whitespace-nowrap ${
                    isCurrent ? 'font-bold text-primary' : isDone ? 'text-ink-soft' : 'text-ink-muted'
                  }`}
                >
                  {item.shortLabel}
                </span>
              </Link>
              {!isLast && (
                <span
                  aria-hidden="true"
                  className={`flex-1 h-0.5 mt-3.5 md:mt-4 mx-1 md:mx-2 rounded-full ${
                    isDone ? 'bg-primary-pale' : 'bg-line-soft'
                  }`}
                />
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
