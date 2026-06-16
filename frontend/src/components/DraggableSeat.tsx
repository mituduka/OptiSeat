'use client'

import { useCallback, useRef, useEffect } from 'react'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'

export interface DraggableSeatProps {
  seatId: number
  isDraggable: boolean
  isDropDisabled?: boolean
  /** FLIP アニメーション: 入れ替わる側の学生がこの座標オフセットからスライドする */
  flipDelta?: { x: number; y: number } | null
  onFlipDone?: () => void
  style?: React.CSSProperties
  className: string
  onMouseEnter?: (e: React.MouseEvent<HTMLDivElement>) => void
  onMouseLeave?: () => void
  /** 違反ツールチップ用: フォーカスでも表示できるようにする */
  onFocus?: (e: React.FocusEvent<HTMLDivElement>) => void
  onBlur?: () => void
  /** Escape でのツールチップ消去等 */
  onKeyDown?: (e: React.KeyboardEvent<HTMLDivElement>) => void
  /** 違反詳細などを読み上げるためフォーカス可能にする場合に指定 */
  focusable?: boolean
  ariaLabel?: string
  /** タップ交換モード: ON のときクリックで選択・交換 */
  onTap?: () => void
  /** タップ交換モードで選択中のセル */
  isSelected?: boolean
  children: React.ReactNode
}

export function DraggableSeat({
  seatId,
  isDraggable,
  isDropDisabled = false,
  flipDelta,
  onFlipDone,
  style,
  className,
  onMouseEnter,
  onMouseLeave,
  onFocus,
  onBlur,
  onKeyDown,
  focusable = false,
  ariaLabel,
  onTap,
  isSelected = false,
  children,
}: DraggableSeatProps) {
  const { attributes, listeners, setNodeRef: setDragRef, isDragging, transform } = useDraggable({
    id: seatId,
    disabled: !isDraggable,
  })
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: seatId, disabled: isDropDisabled })

  const setRef = useCallback(
    (el: HTMLDivElement | null) => {
      setDragRef(el)
      setDropRef(el)
    },
    [setDragRef, setDropRef],
  )

  // FLIP アニメーション用ラッパー ref（DnD transform と分離）
  const flipWrapperRef = useRef<HTMLDivElement>(null)
  // onFlipDone の最新値を ref で保持（useEffect deps から外すため）
  const onFlipDoneRef = useRef(onFlipDone)
  useEffect(() => { onFlipDoneRef.current = onFlipDone })

  useEffect(() => {
    if (!flipDelta || !flipWrapperRef.current) return
    const el = flipWrapperRef.current
    // Phase 1: トランジションなしで移動元位置に瞬時ジャンプ
    el.style.transition = 'none'
    el.style.transform = `translate(${flipDelta.x}px, ${flipDelta.y}px)`
    void el.getBoundingClientRect() // 強制リフロー（Phase 1 を確定させる）
    // Phase 2: トランジションで自然位置（0,0）へスライド
    el.style.transition = 'transform 250ms ease-out'
    el.style.transform = 'translate(0, 0)'
    const handleEnd = () => {
      el.style.transition = ''
      el.style.transform = ''
      onFlipDoneRef.current?.()
    }
    el.addEventListener('transitionend', handleEnd, { once: true })
    return () => el.removeEventListener('transitionend', handleEnd)
    // flipDelta の参照変化でのみ再実行（onFlipDone は ref 経由で最新値を参照）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flipDelta])

  const dndStyle: React.CSSProperties = transform
    ? { transform: CSS.Translate.toString(transform), zIndex: 10 }
    : {}

  // タップ交換セルはキーボードでも操作できるよう button 化し、
  // 違反詳細セルは読み上げ・ツールチップ表示のためフォーカス可能にする
  const interactionProps: React.HTMLAttributes<HTMLDivElement> =
    !isDraggable && onTap
      ? {
          role: 'button',
          tabIndex: 0,
          onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              onTap()
            }
            onKeyDown?.(e)
          },
        }
      : { onKeyDown, ...(focusable && !isDraggable ? { tabIndex: 0 } : {}) }

  return (
    <div ref={flipWrapperRef}>
      <div
        ref={setRef}
        style={{ ...style, ...dndStyle }}
        className={[
          className,
          isDragging ? 'opacity-0' : '',
          isOver && !isDropDisabled ? 'ring-2 ring-primary' : '',
          isSelected ? 'ring-2 ring-amber-400' : '',
          isDraggable ? 'cursor-grab active:cursor-grabbing' : '',
          onTap && !isDraggable ? 'cursor-pointer' : '',
        ].join(' ')}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        onFocus={onFocus}
        onBlur={onBlur}
        onClick={!isDraggable && onTap ? onTap : undefined}
        aria-label={ariaLabel}
        {...interactionProps}
        {...(isDraggable ? { ...attributes, ...listeners } : {})}
      >
        {children}
      </div>
    </div>
  )
}
