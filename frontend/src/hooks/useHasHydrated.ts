import { useSyncExternalStore } from 'react'
import { useStore } from '@/lib/store'

const subscribe = (callback: () => void) => useStore.persist.onFinishHydration(callback)

/**
 * localStorage からストアへのデータ復元（zustand persist でいう hydration）が
 * 完了したかを返す。
 *
 * SSR が生成する HTML は空ストアの状態（生徒数0など）なので、ストア依存の
 * ページ本体はこれが true になるまで描画を遅らせ、リロード直後に誤ったデータが
 * 一瞬見えるのを防ぐ。getServerSnapshot を false にすることで SSR 時と
 * クライアント初回描画は必ず「復元前」となり、サーバー HTML との不一致も起きない。
 */
export function useHasHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => useStore.persist.hasHydrated(),
    () => false,
  )
}
