import type { Metadata, Viewport } from 'next'
// 400/700 の2ウェイトのみ読み込み、明確なタイポグラフィ階層を作る（500/600 は 400 に、800+ は 700 にフォールバック）
import '@fontsource/noto-sans-jp/400.css'
import '@fontsource/noto-sans-jp/700.css'
import './globals.css'
import Sidebar from '@/components/Sidebar'
import MobileHeader from '@/components/MobileHeader'
import BottomNav from '@/components/BottomNav'
import AppInit from '@/components/AppInit'

const DESCRIPTION =
  '「OptiSeat 席替えアプリ」は教員のための席替え支援ツールです。高度な機能を備え、自由な班配置など多様な条件設定が可能で、効率的な席替えを実現します。'

export const metadata: Metadata = {
  // OG 画像等の相対 URL の解決に使用。セルフホスト時は NEXT_PUBLIC_SITE_URL で公開 URL を指定する
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'),
  title: 'OptiSeat 席替えアプリ',
  description: DESCRIPTION,
  openGraph: {
    title: 'OptiSeat 席替えアプリ',
    description: DESCRIPTION,
    type: 'website',
    images: [{ url: '/og-image.png', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'OptiSeat 席替えアプリ',
    description: DESCRIPTION,
    images: ['/og-image.png'],
  },
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon-32.png', type: 'image/png', sizes: '32x32' },
    ],
    apple: [{ url: '/apple-touch-icon.png', type: 'image/png', sizes: '180x180' }],
  },
  // iOS ホーム画面の表示名を「OptiSeat」のみにする（standalone 化はしない）
  other: {
    'apple-mobile-web-app-title': 'OptiSeat',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  viewportFit: 'cover',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="ja" className="h-full">
      <body className="flex flex-col md:flex-row min-h-dvh md:h-dvh md:overflow-hidden">
        <AppInit />
        <MobileHeader />
        <div className="print:hidden"><Sidebar /></div>
        <main className="flex-1 relative md:min-h-0 md:overflow-y-auto">
          <div className="main-safe-padding relative md:min-h-full">{children}</div>
        </main>
        <BottomNav />
        {/*
          iOS 26+ Safari は theme-color メタを廃止し、ステータスバー（通知領域）の色を
          ビューポート上端付近の position:fixed/sticky 要素の背景色から決定する。
          通知領域を上部バーと同色にするため、上端の safe-area を覆う不透明な白
          （= 上部バーと同じ bg-white）の固定要素を最前面に常時配置する。
          safe-area が 0 の環境でも Safari のサンプリング条件を満たすよう最小高さを確保。
        */}
        <div
          aria-hidden="true"
          className="md:hidden print:hidden fixed top-0 inset-x-0 z-60 bg-white pointer-events-none"
          style={{ height: 'max(0.5rem, env(safe-area-inset-top))' }}
        />
      </body>
    </html>
  )
}
