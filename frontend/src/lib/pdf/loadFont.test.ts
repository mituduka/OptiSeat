import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { loadNotoSansJpBytes, _resetFontCache, FONT_URL } from './loadFont'

describe('loadNotoSansJpBytes', () => {
  beforeEach(() => {
    _resetFontCache()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('fetch した ArrayBuffer を Uint8Array で返す', async () => {
    const buf = new Uint8Array([1, 2, 3]).buffer
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, arrayBuffer: () => Promise.resolve(buf) })
    vi.stubGlobal('fetch', fetchMock)

    const bytes = await loadNotoSansJpBytes()
    expect(bytes).toBeInstanceOf(Uint8Array)
    expect(Array.from(bytes)).toEqual([1, 2, 3])
    expect(fetchMock).toHaveBeenCalledWith(FONT_URL)
  })

  it('2回目はメモ化され fetch を再呼び出ししない', async () => {
    const buf = new Uint8Array([9]).buffer
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, arrayBuffer: () => Promise.resolve(buf) })
    vi.stubGlobal('fetch', fetchMock)

    await loadNotoSansJpBytes()
    await loadNotoSansJpBytes()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('応答が ok でない場合は reject する', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 404 })
    vi.stubGlobal('fetch', fetchMock)
    await expect(loadNotoSansJpBytes()).rejects.toThrow()
  })

  it('失敗後はキャッシュを破棄し、次回再 fetch する', async () => {
    const failMock = vi.fn().mockResolvedValue({ ok: false, status: 500 })
    vi.stubGlobal('fetch', failMock)
    await expect(loadNotoSansJpBytes()).rejects.toThrow()

    const buf = new Uint8Array([7]).buffer
    const okMock = vi.fn().mockResolvedValue({ ok: true, arrayBuffer: () => Promise.resolve(buf) })
    vi.stubGlobal('fetch', okMock)
    const bytes = await loadNotoSansJpBytes()
    expect(Array.from(bytes)).toEqual([7])
    expect(okMock).toHaveBeenCalledTimes(1)
  })
})
