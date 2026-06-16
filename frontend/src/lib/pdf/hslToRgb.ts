/**
 * `hsl(h, s%, l%)` 形式の文字列を pdf-lib の `rgb()` に渡せる 0-1 正規化 RGB に変換する。
 *
 * `getGroupStyle`（lib/groupColors.ts）が返す HSL 文字列を PDF 描画色へ橋渡しするためのヘルパー。
 * パースに失敗した場合は白 `{ r: 1, g: 1, b: 1 }` を返す（描画が破綻しないための安全側フォールバック）。
 */
export interface Rgb01 {
  r: number
  g: number
  b: number
}

const HSL_RE = /^\s*hsl\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*\)\s*$/i

export function hslToRgb01(hsl: string): Rgb01 {
  const m = HSL_RE.exec(hsl)
  if (!m) return { r: 1, g: 1, b: 1 }
  const h = Number(m[1]) % 360
  const s = Number(m[2]) / 100
  const l = Number(m[3]) / 100

  // 標準的な HSL→RGB 変換（彩度・明度は 0-1）
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const mm = l - c / 2

  let r1 = 0
  let g1 = 0
  let b1 = 0
  if (h < 60) [r1, g1, b1] = [c, x, 0]
  else if (h < 120) [r1, g1, b1] = [x, c, 0]
  else if (h < 180) [r1, g1, b1] = [0, c, x]
  else if (h < 240) [r1, g1, b1] = [0, x, c]
  else if (h < 300) [r1, g1, b1] = [x, 0, c]
  else [r1, g1, b1] = [c, 0, x]

  return { r: r1 + mm, g: g1 + mm, b: b1 + mm }
}
