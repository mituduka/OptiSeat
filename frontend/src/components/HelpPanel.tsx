'use client'

import { useState } from 'react'
import { Lightbulb, BookOpen, X } from 'lucide-react'

interface HelpPanelProps {
  title: string
  steps: string[]
  tips?: React.ReactNode[]
}

export default function HelpPanel({ title, steps, tips }: HelpPanelProps) {
  const [isOpen, setIsOpen] = useState(false)

  const panelContent = (
    <div className="space-y-4">
      <ol className="space-y-2 text-sm text-ink-soft list-decimal list-outside pl-5 marker:text-ink-muted marker:font-bold">
        {steps.map((step, i) => (
          <li key={i} className="leading-relaxed">{step}</li>
        ))}
      </ol>
      {tips && tips.length > 0 && (
        <div className="border-t border-line-soft pt-3 space-y-1.5">
          {tips.map((tip, i) => (
            <p key={i} className="text-sm text-ink-muted leading-relaxed flex items-start gap-1">
              <Lightbulb size={13} className="shrink-0 mt-0.5 text-amber-400" />
              <span>{tip}</span>
            </p>
          ))}
        </div>
      )}
    </div>
  )

  return (
    <>
      {/* xl以上: フローに留まり sticky で追従する。
          以前は fixed top-8 right-8 だったが、ビューポートより長い内容が見切れる・
          コンテンツに重なる問題があったため、max-height + 内部スクロールに変更した。 */}
      {/* scrollbar-gutter: stable — スクロールバーの有無で内側カードの幅が変わらないよう常に溝を確保 */}
      <aside
        aria-label={title}
        className="hidden xl:block w-72 shrink-0 sticky top-8 max-h-[calc(100dvh-4rem)] overflow-y-auto [scrollbar-gutter:stable] print:hidden"
      >
        <div className="card p-5 space-y-4">
          <h3 className="font-bold text-ink text-sm flex items-center gap-1.5">
            <BookOpen size={15} className="text-primary" />
            {title}
          </h3>
          {panelContent}
        </div>
      </aside>

      {/* xl未満: 以下は全て fixed のためフレックスレイアウトに影響しない */}

      {/* トグルボタン */}
      <button
        onClick={() => setIsOpen(true)}
        className="xl:hidden print:hidden fixed bottom-6 right-6 max-md:bottom-[calc(var(--bottom-nav-h)+env(safe-area-inset-bottom)+1.5rem)] z-40 bg-white border border-line rounded-full p-3 shadow-lg hover:bg-canvas transition-colors"
        aria-label="使い方を開く"
      >
        <BookOpen size={20} className="text-primary" />
      </button>

      {/* バックドロップ（開時のみマウント）
          ※ 閉時に opacity-0 で残すと iOS 26 Safari がこの固定要素の背景色を
            ステータスバー色としてサンプリングしてしまうため、未展開時は DOM から外す。 */}
      {isOpen && (
        <div
          className="xl:hidden print:hidden fixed inset-0 z-40 bg-black/30"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* スライドインパネル */}
      <div className={`xl:hidden print:hidden fixed top-0 right-0 h-full w-80 max-w-[85vw] z-50 bg-white border-l border-line shadow-xl transform transition-transform duration-300 ease-in-out ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="p-5 overflow-y-auto [scrollbar-gutter:stable] h-full space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-ink text-sm flex items-center gap-1.5">
              <BookOpen size={15} className="text-primary" />
              {title}
            </h3>
            <button
              onClick={() => setIsOpen(false)}
              className="p-1 rounded-sm hover:bg-canvas transition-colors"
              aria-label="閉じる"
            >
              <X size={16} className="text-ink-muted" />
            </button>
          </div>
          {panelContent}
        </div>
      </div>
    </>
  )
}
