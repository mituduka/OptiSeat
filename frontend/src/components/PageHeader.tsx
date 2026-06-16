'use client'

import StepNav from '@/components/StepNav'
import { navItems, type StepHref } from '@/lib/navItems'

interface PageHeaderProps {
  /** 現在のステップ（href で指定） */
  step: StepHref
  /** 見出し下の説明文 */
  lead?: string
  /** 見出し右側に置く操作ボタン群 */
  actions?: React.ReactNode
}

/**
 * ステップページ共通のヘッダー。ステップ表示 + ステップ番号付き見出し + 説明文を
 * 一定のリズム（8px グリッド）で揃える。
 */
export default function PageHeader({ step, lead, actions }: PageHeaderProps) {
  const index = navItems.findIndex((item) => item.href === step)
  const item = navItems[index]

  return (
    <header className="space-y-4 md:space-y-6 print:hidden">
      <StepNav current={step} />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between border-b border-line-soft pb-4 md:pb-6">
        <div>
          <p className="text-xs font-bold text-primary tracking-wide">STEP {index + 1} / {navItems.length}</p>
          <h2 className="text-xl md:text-2xl font-bold mt-1">{item.label}</h2>
          {lead && <p className="text-sm text-ink-muted mt-1.5 leading-relaxed">{lead}</p>}
        </div>
        {actions && <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2 shrink-0">{actions}</div>}
      </div>
    </header>
  )
}
