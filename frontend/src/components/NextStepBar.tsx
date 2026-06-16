'use client'

import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import type { StepHref } from '@/lib/navItems'

interface NextStepBarProps {
  /** 遷移先ステップ */
  href: StepHref
  /** ボタンラベル（例: 「次へ: 条件設定」） */
  label: string
  /** 左側に表示する補足文 */
  note?: string
}

/**
 * ページ末尾に置く「次のステップへ」の導線。
 * ステップを進める操作を画面内で完結させ、サイドバーへの依存をなくす。
 */
export default function NextStepBar({ href, label, note }: NextStepBarProps) {
  return (
    <div className="card flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between px-4 py-3 md:px-6 md:py-4 print:hidden">
      <p className="text-sm text-ink-muted">{note}</p>
      <Link href={href} className="btn btn-primary w-full sm:w-auto">
        {label}
        <ArrowRight size={16} />
      </Link>
    </div>
  )
}
