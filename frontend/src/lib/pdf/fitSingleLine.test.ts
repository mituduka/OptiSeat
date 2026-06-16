import { describe, it, expect } from 'vitest'
import { fitSingleLine } from './seatingPdf'

// 幅は「コードポイント数 × サイズ」とみなすフェイク（サロゲートペアは1文字扱い）
const fakeDraw = {
  width: (s: string, size: number): number => Array.from(s).length * size,
}

describe('fitSingleLine', () => {
  it('空文字は baseSize のまま空文字を返す', () => {
    expect(fitSingleLine(fakeDraw, '', 100, 10, 3)).toEqual({ text: '', size: 10 })
  })

  it('baseSize で収まる場合はそのまま（縮小しない）', () => {
    // '佐藤'(2文字) × 10 = 20 ≤ 100
    expect(fitSingleLine(fakeDraw, '佐藤', 100, 10, 3)).toEqual({ text: '佐藤', size: 10 })
  })

  it('収まらない場合は1行のまま自動縮小し、改行・省略しない', () => {
    // 10文字 × baseSize10 = 100 > maxWidth50 → natural = 10*50/100 = 5（≥ min3）
    const r = fitSingleLine(fakeDraw, 'あいうえおかきくけこ', 50, 10, 3)
    expect(r.text).toBe('あいうえおかきくけこ') // 文字は欠けない
    expect(r.size).toBeCloseTo(5)
  })

  it('縮小後の幅がちょうど maxWidth でも省略しない（FP境界の回帰）', () => {
    // baseW = 6*10 = 60, maxWidth 30 → natural = 5。width(text,5)=6*5=30 == maxWidth
    const r = fitSingleLine(fakeDraw, '佐々木翔太郎', 30, 10, 3)
    expect(r.text).toBe('佐々木翔太郎') // 末尾「…」が付かないこと
    expect(r.size).toBeCloseTo(5)
  })

  it('下限サイズでも収まらない極端な長さのみ末尾「…」で省略する', () => {
    // 20文字, baseSize10, maxWidth30, min3 → natural=1.5 < 3 → min3で省略
    const r = fitSingleLine(fakeDraw, 'あ'.repeat(20), 30, 10, 3)
    expect(r.size).toBe(3)
    expect(r.text.endsWith('…')).toBe(true)
    // 省略後は maxWidth に収まる: (文字数+…) × 3 ≤ 30
    expect(fakeDraw.width(r.text, 3)).toBeLessThanOrEqual(30)
  })

  it('省略時にサロゲートペア（CJK拡張B等）を分割しない', () => {
    const r = fitSingleLine(fakeDraw, '𠮷'.repeat(20), 30, 10, 3)
    expect(r.text.endsWith('…')).toBe(true)
    // 孤立サロゲートが残っていれば encodeURIComponent は例外を投げる
    expect(() => encodeURIComponent(r.text)).not.toThrow()
    // 末尾「…」を除いた本体は全てサロゲートペア（各2コード単位）のまま
    const body = r.text.slice(0, -1)
    expect(body.length % 2).toBe(0)
  })
})
