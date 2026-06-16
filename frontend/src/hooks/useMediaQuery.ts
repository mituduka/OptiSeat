'use client'
import { useEffect, useState } from 'react'

/**
 * メディアクエリの一致状態を返す。
 * SSR / matchMedia 非対応環境では false を返す（呼び出し側はハイドレーション後に
 * 正しい値で再描画される前提で使う）。
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
    return window.matchMedia(query).matches
  })

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const mq = window.matchMedia(query)
    const update = () => setMatches(mq.matches)
    update()
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', update)
      return () => mq.removeEventListener('change', update)
    }
    // 古いブラウザ向けのフォールバック
    mq.addListener(update)
    return () => mq.removeListener(update)
  }, [query])

  return matches
}
