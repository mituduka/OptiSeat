'use client'

import { MoveHorizontal } from 'lucide-react'
import { useGridScale } from '@/hooks/useGridScale'

interface GridScrollAreaProps {
  children: React.ReactNode
  /** inner ラッパーに付与するレイアウト用クラス */
  innerClassName?: string
}

/**
 * 座席グリッド共通のスクロール領域。
 * コンテナ幅に合わせて自動縮小（モバイルは下限あり）し、
 * 収まらない場合は横スクロール + ヒント表示に切り替える。
 */
export default function GridScrollArea({ children, innerClassName = '' }: GridScrollAreaProps) {
  const { containerRef, innerRef, scale, overflowing } = useGridScale()

  return (
    <div>
      <div ref={containerRef} className="w-full overflow-x-auto">
        <div
          ref={innerRef}
          className={`w-fit md:mx-auto ${innerClassName}`}
          style={scale !== 1 ? { zoom: scale } : undefined}
        >
          {children}
        </div>
      </div>
      {overflowing && (
        <p className="mt-2 flex items-center justify-center gap-1 text-sm text-ink-muted md:hidden print:hidden">
          <MoveHorizontal size={13} />
          左右にスクロールできます
        </p>
      )}
    </div>
  )
}
