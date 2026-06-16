import { Users, Settings2, Play, PenLine, LayoutGrid } from 'lucide-react'

/**
 * 席替え完了までの5ステップ。配列の順序がそのままステップ番号（index + 1）になる。
 * Sidebar / BottomNav / StepNav で共通利用する。
 */
export const navItems = [
  { href: '/students', label: '名簿管理', shortLabel: '名簿', Icon: Users },
  { href: '/settings',  label: '条件設定', shortLabel: '条件', Icon: Settings2 },
  { href: '/solve',     label: '実行',     shortLabel: '実行', Icon: Play },
  { href: '/finalize',  label: '配置調整', shortLabel: '調整', Icon: PenLine },
  { href: '/display',   label: '結果',     shortLabel: '結果', Icon: LayoutGrid },
] as const

export type StepHref = (typeof navItems)[number]['href']
