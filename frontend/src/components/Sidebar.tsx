'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Database, MessageSquare, Scale, X } from 'lucide-react'
import { useStore } from '@/lib/store'
import { navItems } from '@/lib/navItems'
import { useStepDoneMap } from '@/components/StepNav'
import DataManagementModal from './DataManagementModal'

export default function Sidebar() {
  const pathname = usePathname()
  const {
    dataModalOpen,
    dataModalTab,
    openDataModal,
    closeDataModal,
    sidebarOpen,
    setSidebarOpen,
  } = useStore()
  const doneMap = useStepDoneMap()

  const closeDrawer = () => setSidebarOpen(false)

  return (
    <>
      {/* モバイル: backdrop（drawer 開時のみマウント）
          ※ 閉時に opacity-0 で残すと iOS 26 Safari がこの固定要素の背景色を
            ステータスバー色としてサンプリングしてしまうため、未展開時は DOM から外す。 */}
      {sidebarOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/40 z-40"
          aria-hidden="true"
          onClick={closeDrawer}
        />
      )}

      <aside
        aria-label="メインサイドバー"
        style={{
          paddingTop: 'env(safe-area-inset-top)',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
        className={`bg-sidebar text-ink border-r border-line flex flex-col
          fixed inset-y-0 left-0 w-64 z-50 transform transition-transform duration-200 ease-out
          md:static md:w-56 md:translate-x-0 md:transition-none md:h-full
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        <div className="px-5 py-5 border-b border-line-soft flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold tracking-wide text-primary">OptiSeat</h1>
            <p className="text-xs text-ink-muted mt-0.5">席替えアプリ</p>
          </div>
          <button
            type="button"
            aria-label="メニューを閉じる"
            onClick={closeDrawer}
            className="md:hidden p-1 -mr-1 text-ink-muted hover:text-ink"
          >
            <X size={20} />
          </button>
        </div>
        <nav aria-label="メインナビゲーション" className="flex-1 py-3">
          <p className="px-5 pt-2 pb-1.5 text-[11px] font-bold text-ink-faint tracking-wider">
            席替えステップ
          </p>
          {navItems.map((item, i) => {
            const active = pathname.startsWith(item.href)
            const done = doneMap[item.href] && !active
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                onClick={closeDrawer}
                className={`relative flex items-center gap-3 px-5 py-2.5 text-sm transition-colors ${
                  active
                    ? 'bg-sidebar-active text-primary font-bold'
                    : 'text-ink-soft hover:bg-sidebar-active hover:text-ink'
                }`}
              >
                {/* 現在地インジケータ（左 4px バー） */}
                {active && (
                  <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1 bg-primary" />
                )}
                <span
                  className={`flex items-center justify-center w-5 h-5 rounded-full border text-[10px] font-bold shrink-0 ${
                    active
                      ? 'border-primary bg-primary text-white'
                      : done
                        ? 'border-primary text-primary'
                        : 'border-line text-ink-muted'
                  }`}
                >
                  {i + 1}
                </span>
                {item.label}
              </Link>
            )
          })}
        </nav>

        {/* データ管理・フィードバック */}
        <div className="border-t border-line-soft py-3">
          <button
            onClick={() => { openDataModal('export'); closeDrawer() }}
            className="w-full flex items-center gap-3 px-5 py-2.5 text-sm text-ink-soft hover:bg-sidebar-active hover:text-ink transition-colors"
          >
            <Database size={16} className="text-primary" />
            データ管理
          </button>
          <a
            href="https://forms.gle/iBGTVxQLBjKGmuvb9"
            target="_blank"
            rel="noopener noreferrer"
            onClick={closeDrawer}
            className="w-full flex items-center gap-3 px-5 py-2.5 text-sm text-ink-soft hover:bg-sidebar-active hover:text-ink transition-colors"
          >
            <MessageSquare size={16} className="text-primary" />
            フィードバック
          </a>
          <Link
            href="/legal"
            onClick={closeDrawer}
            aria-current={pathname.startsWith('/legal') ? 'page' : undefined}
            className={`relative w-full flex items-center gap-3 px-5 py-2.5 text-sm transition-colors ${
              pathname.startsWith('/legal')
                ? 'bg-sidebar-active text-primary font-bold'
                : 'text-ink-soft hover:bg-sidebar-active hover:text-ink'
            }`}
          >
            {pathname.startsWith('/legal') && (
              <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1 bg-primary" />
            )}
            <Scale size={16} className="text-primary" />
            法的情報
          </Link>
        </div>

        {/* コピーライト */}
        <div className="border-t border-line-soft py-4 text-center">
          <p className="text-xs text-ink-faint">© {new Date().getFullYear()} mituduka</p>
          <p className="text-xs text-ink-faint">Released under the MIT License</p>
        </div>
      </aside>

      {dataModalOpen && <DataManagementModal onClose={closeDataModal} defaultTab={dataModalTab} />}
    </>
  )
}
