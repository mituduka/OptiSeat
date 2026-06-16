import { describe, it, expect } from 'vitest'
import { computeLayout } from './layout'

describe('computeLayout', () => {
  it('横長グリッド（列>>行）は landscape を選ぶ', () => {
    const l = computeLayout(2, 10)
    expect(l.orientation).toBe('landscape')
    expect(l.pageW).toBeGreaterThan(l.pageH)
  })

  it('縦長グリッド（行>>列）は portrait を選ぶ', () => {
    const l = computeLayout(10, 2)
    expect(l.orientation).toBe('portrait')
    expect(l.pageH).toBeGreaterThan(l.pageW)
  })

  it('グリッドが余白内（ページ-マージン）に収まる', () => {
    for (const [r, c] of [[5, 6], [1, 12], [12, 1], [3, 3], [12, 12]]) {
      const l = computeLayout(r, c)
      // 横: グリッド左 + グリッド幅 ≤ ページ幅 - マージン
      expect(l.gridLeft + l.gridWidth).toBeLessThanOrEqual(l.pageW - l.margin + 0.5)
      expect(l.gridLeft).toBeGreaterThanOrEqual(l.margin - 0.5)
      // 縦: グリッド上端 + グリッド高さ ≤ フッター線位置
      expect(l.gridTop + l.gridHeight).toBeLessThanOrEqual(l.footerLineTop + 0.5)
    }
  })

  it('セル比は 5:4（cellH = cellW*0.8）を維持する', () => {
    const l = computeLayout(5, 6)
    expect(l.cellH).toBeCloseTo(l.cellW * 0.8, 5)
  })

  it('フォントサイズは下限を下回らない', () => {
    const l = computeLayout(12, 12) // 最小セルになるケース
    expect(l.nameFontSize).toBeGreaterThanOrEqual(5)
    expect(l.labelFontSize).toBeGreaterThanOrEqual(4)
    expect(l.headerFontSize).toBeGreaterThanOrEqual(5)
  })

  it('極端な比率でも cellW が正の有限値', () => {
    for (const [r, c] of [[1, 12], [12, 1]]) {
      const l = computeLayout(r, c)
      expect(l.cellW).toBeGreaterThan(0)
      expect(Number.isFinite(l.cellW)).toBe(true)
    }
  })
})
