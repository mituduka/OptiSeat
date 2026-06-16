/**
 * PDF 描画で使う固定色を pdf-lib の `rgb()` に渡せる 0-1 正規化 RGB 定数として集約する。
 *
 * 画面（SeatingGrid.tsx）の Tailwind 配色と一致させ、PDF と UI の見た目を揃える。
 */
import type { Rgb01 } from './hslToRgb'

/** `#rrggbb` を 0-1 正規化 RGB に変換する */
export function hexToRgb01(hex: string): Rgb01 {
  const h = hex.replace('#', '')
  return {
    r: parseInt(h.slice(0, 2), 16) / 255,
    g: parseInt(h.slice(2, 4), 16) / 255,
    b: parseInt(h.slice(4, 6), 16) / 255,
  }
}

export const PDF_COLORS = {
  // 性別の名前帯背景（bg-blue-100 / bg-rose-100）
  genderMaleBg: hexToRgb01('#dbeafe'),
  genderFemaleBg: hexToRgb01('#ffe4e6'),
  // 班分散グループ紫ラベル（bg-purple-100 / text-purple-700）
  leaderBg: hexToRgb01('#f3e8ff'),
  leaderText: hexToRgb01('#7e22ce'),
  // テキスト・罫線（slate 系）
  name: hexToRgb01('#1e293b'), // slate-800
  emptyText: hexToRgb01('#cbd5e1'), // slate-300
  label: hexToRgb01('#94a3b8'), // slate-400（行/列番号）
  footer: hexToRgb01('#94a3b8'), // slate-400
  blackboard: hexToRgb01('#707074'), // ink-muted（黒板バー文字。画面の text-ink-muted と一致）
  blackboardLine: hexToRgb01('#414143'), // ink-soft（黒板下線。画面の border-ink-soft と一致）
  defaultBorder: hexToRgb01('#e2e8f0'), // slate-200
  emptyBg: hexToRgb01('#f8fafc'), // slate-50
  excludedBg: hexToRgb01('#f1f5f9'), // slate-100
  excludedBorder: hexToRgb01('#e2e8f0'), // slate-200
  divider: hexToRgb01('#cbd5e1'), // slate-300（フッター区切り線）
  white: { r: 1, g: 1, b: 1 } as Rgb01,
} as const
