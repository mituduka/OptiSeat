'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { MoreHorizontal } from 'lucide-react'
import { useStore } from '@/lib/store'
import { navItems } from '@/lib/navItems'

export default function BottomNav() {
  const pathname = usePathname()
  const setSidebarOpen = useStore((s) => s.setSidebarOpen)

  return (
    <nav
      aria-label="モバイルナビゲーション"
      className="md:hidden print:hidden fixed bottom-0 inset-x-0 z-30 flex bg-white text-ink border-t border-line"
      style={{
        paddingBottom: 'env(safe-area-inset-bottom)',
        paddingLeft: 'env(safe-area-inset-left)',
        paddingRight: 'env(safe-area-inset-right)',
      }}
    >
      {navItems.map((item) => {
        const active = pathname.startsWith(item.href)
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={`relative flex-1 flex flex-col items-center justify-center gap-0.5 h-14 text-[11px] transition-colors ${
              active ? 'text-primary font-bold' : 'text-ink-muted hover:text-ink'
            }`}
          >
            {/* 現在地インジケータ（上 3px バー） */}
            {active && (
              <span aria-hidden="true" className="absolute top-0 inset-x-3 h-0.5 rounded-b bg-primary" />
            )}
            <item.Icon size={20} />
            {item.shortLabel}
          </Link>
        )
      })}
      <button
        type="button"
        aria-label="その他のメニューを開く"
        onClick={() => setSidebarOpen(true)}
        className="flex-1 flex flex-col items-center justify-center gap-0.5 h-14 text-[11px] text-ink-muted hover:text-ink transition-colors"
      >
        <MoreHorizontal size={20} />
        その他
      </button>
    </nav>
  )
}
