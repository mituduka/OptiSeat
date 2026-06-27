'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'

interface ConfirmButtonProps {
  /** 確認後に実行する処理 */
  onConfirm: () => void
  /**
   * 確認を要求するか。false なら1クリックで即実行する。
   * 例: 既存データが無いときは確認を省くなど（既定 true）
   */
  needsConfirm?: boolean
  /** 通常時の表示内容（ラベル or アイコン） */
  children: ReactNode
  /** 確認状態の表示内容（ラベル or アイコン） */
  confirmChildren: ReactNode
  /** 常に付与するクラス（btn btn-sm 等） */
  className?: string
  /** 通常時に付与するクラス */
  idleClassName?: string
  /** 確認状態に付与するクラス */
  confirmClassName?: string
  disabled?: boolean
  title?: string
  'aria-label'?: string
}

/**
 * 破壊的操作向けの2段階クリック確認ボタン。誤操作防止のため、1回目のクリックで
 * その場の同じボタンが確認表示に変わり、2回目で実行する。数秒放置・フォーカス喪失・
 * Esc・ボタン外のクリック/タップで自動的に通常表示へ復帰する。
 *
 * 確認中はボタン外の pointerdown を監視して復帰するため、別のボタンをクリックすると
 * （その pointerdown で）先のボタンは通常表示へ戻り、結果として確認状態は常に1つになる。
 */
export default function ConfirmButton({
  onConfirm,
  needsConfirm = true,
  children,
  confirmChildren,
  className = '',
  idleClassName = '',
  confirmClassName = '',
  disabled,
  title,
  'aria-label': ariaLabel,
}: ConfirmButtonProps) {
  const [confirming, setConfirming] = useState(false)
  const ref = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!confirming) return
    // ボタン外のクリック/タップで復帰（タッチ環境では onBlur が発火しないため補完）。
    // pointerdown は click より先に発火するので、別ボタンを押すと先に確認状態が解除される。
    const onPointerDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setConfirming(false)
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    const timer = setTimeout(() => setConfirming(false), 4000)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      clearTimeout(timer)
    }
  }, [confirming])

  return (
    <button
      ref={ref}
      onClick={() => {
        if (!needsConfirm) {
          onConfirm()
          return
        }
        if (confirming) {
          onConfirm()
          setConfirming(false)
        } else {
          setConfirming(true)
        }
      }}
      onBlur={() => setConfirming(false)}
      onKeyDown={(e) => { if (e.key === 'Escape') setConfirming(false) }}
      disabled={disabled}
      title={title}
      aria-label={ariaLabel}
      className={`${className} ${confirming ? confirmClassName : idleClassName}`}
    >
      {confirming ? confirmChildren : children}
    </button>
  )
}
