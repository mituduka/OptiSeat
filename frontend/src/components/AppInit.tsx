'use client'

import { useEffect } from 'react'
import { useStore } from '@/lib/store'
import { fetchConfig } from '@/lib/api'

/**
 * アプリ初回レンダリング時にアプリ設定をAPIから取得し、ストアに格納する。
 * layout.tsx（Server Component）からインポートして body 内に配置する。
 */
export default function AppInit() {
  const setServerConfig = useStore((s) => s.setServerConfig)
  const setConfigError = useStore((s) => s.setConfigError)

  useEffect(() => {
    fetchConfig()
      .then((cfg) => {
        setServerConfig(cfg)
        setConfigError(null)
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err)
        console.error('[AppInit] サーバー設定の取得に失敗しました（デフォルト値を使用）:', msg)
        setConfigError(msg)
      })
  }, [setServerConfig, setConfigError])

  return null
}
