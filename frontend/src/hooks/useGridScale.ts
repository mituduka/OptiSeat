'use client'
import { useCallback, useEffect, useState } from 'react'

const DESKTOP_QUERY = '(min-width: 768px)'

/**
 * モバイルでの縮小下限。これ以上小さくすると氏名が読めなくなるため、
 * 下限に達したら縮小を止めて横スクロール（+ ヒント表示）に切り替える。
 */
const MOBILE_MIN_SCALE = 0.62

export function useGridScale() {
  const [container, setContainer] = useState<HTMLDivElement | null>(null)
  const [inner, setInner] = useState<HTMLDivElement | null>(null)
  const [scale, setScale] = useState(1)
  // 縮小下限に達してもまだ収まらない（= 横スクロールが必要）かどうか
  const [overflowing, setOverflowing] = useState(false)
  // PC ではコンテナに収まるまで無制限に縮小、モバイルでは MOBILE_MIN_SCALE まで
  const [isDesktop, setIsDesktop] = useState(true)

  // DOM 要素が割り当てられた瞬間に state を更新し effect を再実行させる
  const containerRef = useCallback((el: HTMLDivElement | null) => setContainer(el), [])
  const innerRef = useCallback((el: HTMLDivElement | null) => setInner(el), [])

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const mq = window.matchMedia(DESKTOP_QUERY)
    const update = () => setIsDesktop(mq.matches)
    update()
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', update)
      return () => mq.removeEventListener('change', update)
    }
    // 古いブラウザ向けのフォールバック
    mq.addListener(update)
    return () => mq.removeListener(update)
  }, [])

  const recalc = useCallback(() => {
    if (!container || !inner) return
    const prev = inner.style.zoom
    inner.style.zoom = '1'
    const naturalW = inner.scrollWidth
    inner.style.zoom = prev
    const containerW = container.clientWidth
    if (containerW <= 0 || naturalW <= 0) {
      setScale(1)
      setOverflowing(false)
      return
    }
    const fit = Math.min(1, containerW / naturalW)
    const newScale = isDesktop ? fit : Math.max(MOBILE_MIN_SCALE, fit)
    setScale(newScale)
    setOverflowing(naturalW * newScale > containerW + 1)
  }, [container, inner, isDesktop])

  useEffect(() => {
    recalc()
    if (!container) return
    const ro = new ResizeObserver(recalc)
    ro.observe(container)
    if (inner) ro.observe(inner)
    return () => ro.disconnect()
  }, [recalc, container, inner])

  // 印刷時はズームをリセット（display/page.tsx の printScale と二重適用を防ぐ）
  useEffect(() => {
    if (!inner) return
    const reset = () => { inner.style.zoom = '1' }
    const restore = () => { inner.style.zoom = String(scale) }
    window.addEventListener('beforeprint', reset)
    window.addEventListener('afterprint', restore)
    return () => {
      window.removeEventListener('beforeprint', reset)
      window.removeEventListener('afterprint', restore)
    }
  }, [scale, inner])

  return { containerRef, innerRef, scale, overflowing }
}
