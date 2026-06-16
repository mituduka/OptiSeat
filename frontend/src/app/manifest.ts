import type { MetadataRoute } from 'next'

// manifest を静的生成する（リクエストごとの動的生成は不要なため）
export const dynamic = 'force-static'

// Android などでホーム画面に追加した際のアイコン・名称。
// short_name がホーム画面の表示名（「OptiSeat」のみ）になる。
// display は 'browser'（standalone 化せずブックマーク的に開く）。
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'OptiSeat 席替えアプリ',
    short_name: 'OptiSeat',
    description: 'ASP（Answer Set Programming）で席替えを最適化する Web アプリケーション',
    start_url: '/',
    display: 'browser',
    background_color: '#1A1A1C',
    theme_color: '#1A1A1C',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  }
}
