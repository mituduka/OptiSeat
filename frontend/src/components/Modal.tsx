'use client'

import { useEffect, useRef } from 'react'

type MaxWidth = 'sm' | 'md' | 'lg'

interface ModalProps {
  onClose: () => void
  children: React.ReactNode
  maxWidth?: MaxWidth
  /** 追加クラス（内側 frame に付与） */
  className?: string
  /** ダイアログのタイトル要素の id（aria-labelledby に使用。タイトルがない場合は ariaLabel を指定） */
  labelledBy?: string
  /** aria-label / aria-labelledby をどうしても外したい場合のラベル */
  ariaLabel?: string
}

const MAX_W: Record<MaxWidth, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

export default function Modal({
  onClose,
  children,
  maxWidth = 'md',
  className,
  labelledBy,
  ariaLabel,
}: ModalProps) {
  const frameRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  // 初期フォーカス: 最初のフォーカス可能要素（なければフレーム自体）。
  // 閉じたら開く前にフォーカスしていた要素へ戻す。
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const frame = frameRef.current
    if (frame) {
      const first = frame.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)
      ;(first ?? frame).focus()
    }
    return () => {
      previous?.focus?.()
    }
  }, [])

  // フォーカストラップ: Tab でダイアログ外へ出さない
  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'Tab') return
    const frame = frameRef.current
    if (!frame) return
    const focusables = Array.from(frame.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
    if (focusables.length === 0) {
      e.preventDefault()
      return
    }
    const first = focusables[0]
    const last = focusables[focusables.length - 1]
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
      aria-label={ariaLabel}
    >
      <div
        ref={frameRef}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        className={`bg-white rounded-lg border border-line shadow-xl w-full ${MAX_W[maxWidth]} max-h-[90dvh] overflow-y-auto focus:outline-none ${className ?? ''}`}
      >
        {children}
      </div>
    </div>
  )
}
