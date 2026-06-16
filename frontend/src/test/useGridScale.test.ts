import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useGridScale } from '@/hooks/useGridScale'

// ResizeObserver モック（コールバックを手動トリガー可能）
type RoInstance = {
  cb: ResizeObserverCallback
  observe: ReturnType<typeof vi.fn>
  disconnect: ReturnType<typeof vi.fn>
  trigger: () => void
}
let roInstance: RoInstance | null = null

class MockResizeObserver {
  cb: ResizeObserverCallback
  observe = vi.fn()
  disconnect = vi.fn()

  constructor(callback: ResizeObserverCallback) {
    this.cb = callback
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this
    roInstance = {
      cb: callback,
      observe: self.observe,
      disconnect: self.disconnect,
      trigger: () => self.cb([], self as unknown as ResizeObserver),
    }
  }
}

function makeContainer(clientWidth: number): HTMLDivElement {
  const el = document.createElement('div')
  Object.defineProperty(el, 'clientWidth', { value: clientWidth, configurable: true })
  return el
}

function makeInner(scrollWidth: number): HTMLDivElement {
  const el = document.createElement('div')
  Object.defineProperty(el, 'scrollWidth', { value: scrollWidth, configurable: true })
  return el
}

function setClientWidth(el: HTMLDivElement, w: number) {
  Object.defineProperty(el, 'clientWidth', { value: w, configurable: true })
}

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', MockResizeObserver)
  roInstance = null
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// ─── 初期状態 ────────────────────────────────────────────────────────────────

describe('初期状態', () => {
  it('scale の初期値は 1', () => {
    const { result } = renderHook(() => useGridScale())
    expect(result.current.scale).toBe(1)
  })

  it('containerRef・innerRef はコールバック関数として返される', () => {
    const { result } = renderHook(() => useGridScale())
    expect(typeof result.current.containerRef).toBe('function')
    expect(typeof result.current.innerRef).toBe('function')
  })
})

// ─── スケール計算 ─────────────────────────────────────────────────────────────

describe('スケール計算', () => {
  it('コンテナ幅 > inner 幅 → scale = 1（拡大しない）', () => {
    const { result } = renderHook(() => useGridScale())
    act(() => {
      result.current.containerRef(makeContainer(600))
      result.current.innerRef(makeInner(300))
    })
    expect(result.current.scale).toBe(1)
  })

  it('コンテナ幅 = inner 幅 → scale = 1', () => {
    const { result } = renderHook(() => useGridScale())
    act(() => {
      result.current.containerRef(makeContainer(300))
      result.current.innerRef(makeInner(300))
    })
    expect(result.current.scale).toBe(1)
  })

  it('コンテナ幅 < inner 幅 → scale = containerW / naturalW', () => {
    const { result } = renderHook(() => useGridScale())
    act(() => {
      result.current.containerRef(makeContainer(200))
      result.current.innerRef(makeInner(400))
    })
    expect(result.current.scale).toBeCloseTo(0.5)
  })

  it('コンテナ幅が 0 → scale = 1（ゼロ除算フォールバック）', () => {
    const { result } = renderHook(() => useGridScale())
    act(() => {
      result.current.containerRef(makeContainer(0))
      result.current.innerRef(makeInner(400))
    })
    expect(result.current.scale).toBe(1)
  })

  it('scale は常に 0 以上 1 以下', () => {
    const { result } = renderHook(() => useGridScale())
    act(() => {
      result.current.containerRef(makeContainer(50))
      result.current.innerRef(makeInner(1000))
    })
    expect(result.current.scale).toBeGreaterThanOrEqual(0)
    expect(result.current.scale).toBeLessThanOrEqual(1)
  })
})

// ─── ref が片方のみの場合 ─────────────────────────────────────────────────────

describe('ref が片方のみ', () => {
  it('container のみ設定 → scale = 1（recalc しない）', () => {
    const { result } = renderHook(() => useGridScale())
    act(() => { result.current.containerRef(makeContainer(200)) })
    expect(result.current.scale).toBe(1)
  })

  it('inner のみ設定 → scale = 1（recalc しない）', () => {
    const { result } = renderHook(() => useGridScale())
    act(() => { result.current.innerRef(makeInner(400)) })
    expect(result.current.scale).toBe(1)
  })
})

// ─── ResizeObserver ───────────────────────────────────────────────────────────

describe('ResizeObserver', () => {
  it('container と inner の両方を observe する', () => {
    const { result } = renderHook(() => useGridScale())
    const container = makeContainer(400)
    const inner = makeInner(300)
    act(() => {
      result.current.containerRef(container)
      result.current.innerRef(inner)
    })
    expect(roInstance!.observe).toHaveBeenCalledWith(container)
    expect(roInstance!.observe).toHaveBeenCalledWith(inner)
  })

  it('コンテナが null のとき observe を呼ばない', () => {
    const { result } = renderHook(() => useGridScale())
    act(() => { result.current.innerRef(makeInner(300)) })
    // roInstance は null のまま（ResizeObserver が生成されない）
    expect(roInstance).toBeNull()
  })

  it('ResizeObserver トリガー後にコンテナ幅が縮小 → scale が更新される', () => {
    const { result } = renderHook(() => useGridScale())
    const container = makeContainer(400)
    const inner = makeInner(300)
    act(() => {
      result.current.containerRef(container)
      result.current.innerRef(inner)
    })
    expect(result.current.scale).toBe(1)

    setClientWidth(container, 150)
    act(() => { roInstance!.trigger() })
    expect(result.current.scale).toBeCloseTo(150 / 300)
  })

  it('ResizeObserver トリガー後にコンテナ幅が拡大 → scale = 1 に戻る', () => {
    const { result } = renderHook(() => useGridScale())
    const container = makeContainer(100)
    const inner = makeInner(400)
    act(() => {
      result.current.containerRef(container)
      result.current.innerRef(inner)
    })
    expect(result.current.scale).toBeCloseTo(0.25)

    setClientWidth(container, 800)
    act(() => { roInstance!.trigger() })
    expect(result.current.scale).toBe(1)
  })

  it('アンマウント時に disconnect を呼ぶ', () => {
    const { result, unmount } = renderHook(() => useGridScale())
    act(() => {
      result.current.containerRef(makeContainer(400))
      result.current.innerRef(makeInner(300))
    })
    const ro = roInstance!
    unmount()
    expect(ro.disconnect).toHaveBeenCalled()
  })
})

// ─── コールバック ref のタイミング（条件付きレンダリング相当） ──────────────

describe('コールバック ref のタイミング', () => {
  it('後から inner を追加したとき scale が計算される', () => {
    const { result } = renderHook(() => useGridScale())
    act(() => { result.current.containerRef(makeContainer(200)) })
    expect(result.current.scale).toBe(1)

    act(() => { result.current.innerRef(makeInner(400)) })
    expect(result.current.scale).toBeCloseTo(0.5)
  })

  it('後から container を追加したとき scale が計算される', () => {
    const { result } = renderHook(() => useGridScale())
    act(() => { result.current.innerRef(makeInner(400)) })
    expect(result.current.scale).toBe(1)

    act(() => { result.current.containerRef(makeContainer(200)) })
    expect(result.current.scale).toBeCloseTo(0.5)
  })
})

// ─── zoom リセット（recalc 内部動作） ────────────────────────────────────────

describe('zoom リセット挙動', () => {
  it('recalc は zoom=1 の状態で scrollWidth を読み取る（pre-zoom が結果に影響しない）', () => {
    const { result } = renderHook(() => useGridScale())
    const container = makeContainer(200)
    const inner = makeInner(400)
    inner.style.zoom = '0.3' // 事前に zoom が設定されていても

    act(() => {
      result.current.containerRef(container)
      result.current.innerRef(inner)
    })
    // scrollWidth=400 をそのまま使い scale=0.5 になるはず
    expect(result.current.scale).toBeCloseTo(0.5)
  })
})

// ─── 印刷イベント ─────────────────────────────────────────────────────────────

describe('印刷イベント', () => {
  it('beforeprint で inner.style.zoom が 1 にリセットされる', () => {
    const { result } = renderHook(() => useGridScale())
    const inner = makeInner(400)
    act(() => {
      result.current.containerRef(makeContainer(200))
      result.current.innerRef(inner)
    })
    expect(result.current.scale).toBeCloseTo(0.5)

    act(() => { window.dispatchEvent(new Event('beforeprint')) })
    expect(inner.style.zoom).toBe('1')
  })

  it('afterprint で inner.style.zoom が scale 値に戻る', () => {
    const { result } = renderHook(() => useGridScale())
    const inner = makeInner(400)
    act(() => {
      result.current.containerRef(makeContainer(200))
      result.current.innerRef(inner)
    })

    act(() => { window.dispatchEvent(new Event('beforeprint')) })
    act(() => { window.dispatchEvent(new Event('afterprint')) })
    expect(inner.style.zoom).toBe(String(result.current.scale))
  })

  it('アンマウント後は beforeprint/afterprint リスナーが解除される', () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener')
    const { result, unmount } = renderHook(() => useGridScale())
    const inner = makeInner(400)
    act(() => {
      result.current.containerRef(makeContainer(200))
      result.current.innerRef(inner)
    })

    act(() => { unmount() })

    expect(removeSpy).toHaveBeenCalledWith('beforeprint', expect.any(Function))
    expect(removeSpy).toHaveBeenCalledWith('afterprint', expect.any(Function))
    removeSpy.mockRestore()
  })
})

// ─── null ref（要素のアンマウント） ──────────────────────────────────────────

describe('null ref', () => {
  it('containerRef(null) を呼んでもクラッシュしない', () => {
    const { result } = renderHook(() => useGridScale())
    act(() => {
      result.current.containerRef(makeContainer(400))
      result.current.innerRef(makeInner(300))
    })
    expect(() => {
      act(() => { result.current.containerRef(null) })
    }).not.toThrow()
  })

  it('innerRef(null) を呼んでもクラッシュしない', () => {
    const { result } = renderHook(() => useGridScale())
    act(() => {
      result.current.containerRef(makeContainer(400))
      result.current.innerRef(makeInner(300))
    })
    expect(() => {
      act(() => { result.current.innerRef(null) })
    }).not.toThrow()
  })

  it('containerRef(null) 後は ResizeObserver が disconnect される', () => {
    const { result } = renderHook(() => useGridScale())
    act(() => {
      result.current.containerRef(makeContainer(400))
      result.current.innerRef(makeInner(300))
    })
    const ro = roInstance!

    act(() => { result.current.containerRef(null) })
    expect(ro.disconnect).toHaveBeenCalled()
  })
})
