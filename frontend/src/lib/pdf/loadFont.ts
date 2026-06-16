/**
 * PDF 埋め込み用の日本語フォント（Noto Sans JP Regular）を遅延ロードする。
 *
 * 初期バンドルを膨らませないため import せず、PDF 生成時に初めて `public/fonts/` から fetch する。
 * モジュールスコープで Promise をメモ化し、2 回目以降は再 fetch しない（失敗時はキャッシュを破棄して再試行可能）。
 */
export const FONT_URL = '/fonts/NotoSansJP-Regular.ttf'

let cached: Promise<Uint8Array> | null = null

export function loadNotoSansJpBytes(): Promise<Uint8Array> {
  if (!cached) {
    cached = fetch(FONT_URL)
      .then((res) => {
        if (!res.ok) throw new Error(`フォントの取得に失敗しました (${res.status})`)
        return res.arrayBuffer()
      })
      .then((buf) => new Uint8Array(buf))
      .catch((err) => {
        cached = null // 失敗は記憶せず、次回再試行できるようにする
        throw err
      })
  }
  return cached
}

/** テスト用: メモ化キャッシュを破棄する */
export function _resetFontCache(): void {
  cached = null
}
