import { describe, it, expect } from 'vitest'
import { hslToRgb01 } from './hslToRgb'

describe('hslToRgb01', () => {
  it('黒 hsl(0,0%,0%) → {0,0,0}', () => {
    expect(hslToRgb01('hsl(0, 0%, 0%)')).toEqual({ r: 0, g: 0, b: 0 })
  })

  it('白 hsl(0,0%,100%) → {1,1,1}', () => {
    const c = hslToRgb01('hsl(0, 0%, 100%)')
    expect(c.r).toBeCloseTo(1)
    expect(c.g).toBeCloseTo(1)
    expect(c.b).toBeCloseTo(1)
  })

  it('純赤 hsl(0,100%,50%) → {1,0,0}', () => {
    const c = hslToRgb01('hsl(0, 100%, 50%)')
    expect(c.r).toBeCloseTo(1)
    expect(c.g).toBeCloseTo(0)
    expect(c.b).toBeCloseTo(0)
  })

  it('純緑 hsl(120,100%,50%) → {0,1,0}', () => {
    const c = hslToRgb01('hsl(120, 100%, 50%)')
    expect(c.r).toBeCloseTo(0)
    expect(c.g).toBeCloseTo(1)
    expect(c.b).toBeCloseTo(0)
  })

  it('純青 hsl(240,100%,50%) → {0,0,1}', () => {
    const c = hslToRgb01('hsl(240, 100%, 50%)')
    expect(c.r).toBeCloseTo(0)
    expect(c.g).toBeCloseTo(0)
    expect(c.b).toBeCloseTo(1)
  })

  it('getGroupStyle 互換の hsl(X, 60%, 88%) を 0-1 範囲で返す', () => {
    const c = hslToRgb01('hsl(137, 60%, 88%)')
    for (const v of [c.r, c.g, c.b]) {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(1)
    }
  })

  it('不正な文字列は白フォールバック', () => {
    expect(hslToRgb01('not-a-color')).toEqual({ r: 1, g: 1, b: 1 })
    expect(hslToRgb01('rgb(0,0,0)')).toEqual({ r: 1, g: 1, b: 1 })
  })
})
