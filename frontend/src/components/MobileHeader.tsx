'use client'

import { Menu } from 'lucide-react'
import { useStore } from '@/lib/store'

export default function MobileHeader() {
  const setSidebarOpen = useStore((s) => s.setSidebarOpen)

  return (
    <header
      className="md:hidden flex items-center gap-3 px-3 bg-white text-ink border-b border-line print:hidden shrink-0"
      style={{
        paddingTop: 'env(safe-area-inset-top)',
        paddingLeft: 'max(0.75rem, env(safe-area-inset-left))',
        paddingRight: 'max(0.75rem, env(safe-area-inset-right))',
      }}
    >
      <div className="flex items-center gap-3 h-12 w-full">
        <button
          type="button"
          aria-label="メニューを開く"
          onClick={() => setSidebarOpen(true)}
          className="p-2 -ml-2 rounded-lg text-ink-soft hover:bg-canvas active:bg-canvas transition-colors"
        >
          <Menu size={22} />
        </button>
        <h1 className="text-base font-bold tracking-wide text-primary">OptiSeat</h1>
      </div>
    </header>
  )
}
