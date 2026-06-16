/**
 * 黄金角ステップで色相を分散させた HSL カラーを動的生成する。
 *
 * 黄金角（≈137.508°）でステップすることで、隣接する班番号が近い色にならず、
 * かつ補色（180°差）まで離さないため穏やかな配色になる。
 *
 * DADS のコントラスト要件に合わせ、色相ごとに明度を自動調整する:
 * - 枠線（非テキスト）: 白背景・セル背景の両方に対して 3:1 以上
 * - 文字: セル背景に対して 4.5:1 以上
 * 緑・黄系は同じ明度でも輝度が高いため、固定明度では 3:1 を満たせない（最低 1.5:1 程度）。
 */
const GOLDEN_ANGLE = 137.508
const SATURATION = 45 // 彩度は落ち着いたトーンに抑える
const BG_LIGHTNESS = 90

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  s /= 100
  l /= 100
  const k = (n: number) => (n + h / 30) % 12
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  return [f(0), f(8), f(4)]
}

function luminance([r, g, b]: [number, number, number]): number {
  const lin = [r, g, b].map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)))
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2]
}

function contrast(l1: number, l2: number): number {
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1]
  return (hi + 0.05) / (lo + 0.05)
}

const WHITE_LUMINANCE = 1

export interface GroupStyle {
  backgroundColor: string
  borderColor: string
  color: string
}

// レンダリングループから座席ごとに呼ばれるため、班 ID 単位でメモ化する
const cache = new Map<number, GroupStyle>()

export function getGroupStyle(groupId: number): GroupStyle {
  const cached = cache.get(groupId)
  if (cached) return cached

  const hue = Math.round((groupId * GOLDEN_ANGLE) % 360)
  const lumAt = (l: number) => luminance(hslToRgb(hue, SATURATION, l))
  const bgLum = lumAt(BG_LIGHTNESS)

  let borderL = 55
  while (borderL > 0 && (contrast(lumAt(borderL), WHITE_LUMINANCE) < 3 || contrast(lumAt(borderL), bgLum) < 3)) {
    borderL--
  }
  let textL = 30
  while (textL > 0 && contrast(lumAt(textL), bgLum) < 4.5) {
    textL--
  }

  const style: GroupStyle = {
    backgroundColor: `hsl(${hue}, ${SATURATION}%, ${BG_LIGHTNESS}%)`,
    borderColor: `hsl(${hue}, ${SATURATION}%, ${borderL}%)`,
    color: `hsl(${hue}, ${SATURATION}%, ${textL}%)`,
  }
  cache.set(groupId, style)
  return style
}
