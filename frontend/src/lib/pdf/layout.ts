/**
 * 座席グリッドを A4 ページに収めるレイアウトを計算する（端末非依存・pt 単位）。
 *
 * - グリッドのアスペクト比に応じて縦/横向きを自動選択（セルがより大きくなる向きを採用）。
 * - すべて pt（1pt = 1/72 inch）で計算し、画面 px・ビューポートに一切依存しない。
 * - 座標は「左上原点・y は下方向」のトップダウン系で返す。pdf-lib（左下原点）への変換は
 *   描画側（seatingPdf.ts）で `pageH - y` により行う。
 *
 * 元の画面セル比（80:64 = 5:4）を維持し、見た目を画面と揃える。
 */

// A4 寸法（pt）
const A4_LONG = 841.89
const A4_SHORT = 595.28

const MARGIN = 34 // 約 12mm
const TITLE_H = 26 // タイトル行の確保高さ
const TITLE_GAP = 8
const BLACKBOARD_H = 16
const BLACKBOARD_GAP = 10
const FOOTER_H = 22 // フッター（区切り線 + 文字）の確保高さ

// セル比とグリッド内の付随要素（セル幅 cellW に対する比率）
const CELL_ASPECT = 0.8 // cellH / cellW
const GAP_X_RATIO = 0.025 // 列間ギャップ / cellW
const GAP_Y_RATIO = 0.1 // 行間ギャップ / cellW
const ROW_LABEL_RATIO = 0.4 // 行番号ラベル幅 / cellW
const COL_HEADER_RATIO = 0.32 // 列番号ヘッダー高 / cellW

export type Orientation = 'portrait' | 'landscape'

export interface PdfLayout {
  orientation: Orientation
  pageW: number
  pageH: number
  margin: number
  // タイトル（中央・トップダウン baseline）
  titleBaselineTop: number
  titleFontSize: number
  // 黒板バー（グリッド幅いっぱい）
  blackboardTop: number
  blackboardH: number
  blackboardFontSize: number
  // グリッド原点（列ヘッダー左上）とセル寸法
  gridLeft: number
  gridTop: number
  gridWidth: number
  gridHeight: number
  rowLabelW: number
  colHeaderH: number
  cellW: number
  cellH: number
  gapX: number
  gapY: number
  // フォント
  nameFontSize: number
  labelFontSize: number
  headerFontSize: number
  // フッター（トップダウン）
  footerLineTop: number
  footerBaselineTop: number
  footerFontSize: number
}

/** cellW に対するグリッド全体の幅係数 */
function widthFactor(numCols: number): number {
  return ROW_LABEL_RATIO + numCols + GAP_X_RATIO * (numCols - 1)
}
/** cellW に対するグリッド全体の高さ係数 */
function heightFactor(numRows: number): number {
  return COL_HEADER_RATIO + CELL_ASPECT * numRows + GAP_Y_RATIO * (numRows - 1)
}

/** ある向きでの最大セル幅を求める */
function maxCellW(pageW: number, pageH: number, numRows: number, numCols: number): number {
  const availW = pageW - 2 * MARGIN
  const availH =
    pageH - 2 * MARGIN - TITLE_H - TITLE_GAP - BLACKBOARD_H - BLACKBOARD_GAP - FOOTER_H
  return Math.min(availW / widthFactor(numCols), availH / heightFactor(numRows))
}

export function computeLayout(numRows: number, numCols: number): PdfLayout {
  // 両向きで最大セル幅を比較し、大きい方を採用
  const portraitCell = maxCellW(A4_SHORT, A4_LONG, numRows, numCols)
  const landscapeCell = maxCellW(A4_LONG, A4_SHORT, numRows, numCols)
  const orientation: Orientation = landscapeCell > portraitCell ? 'landscape' : 'portrait'

  const pageW = orientation === 'landscape' ? A4_LONG : A4_SHORT
  const pageH = orientation === 'landscape' ? A4_SHORT : A4_LONG

  const cellW = Math.max(orientation === 'landscape' ? landscapeCell : portraitCell, 1)
  const cellH = cellW * CELL_ASPECT
  const gapX = cellW * GAP_X_RATIO
  const gapY = cellW * GAP_Y_RATIO
  const rowLabelW = cellW * ROW_LABEL_RATIO
  const colHeaderH = cellW * COL_HEADER_RATIO

  const gridWidth = rowLabelW + numCols * cellW + (numCols - 1) * gapX
  const gridHeight = colHeaderH + numRows * cellH + (numRows - 1) * gapY

  const gridLeft = (pageW - gridWidth) / 2
  const titleBaselineTop = MARGIN + 18
  const blackboardTop = MARGIN + TITLE_H + TITLE_GAP
  const gridTop = blackboardTop + BLACKBOARD_H + BLACKBOARD_GAP

  const footerLineTop = pageH - MARGIN - FOOTER_H + 6
  const footerBaselineTop = pageH - MARGIN - 4

  // フォントサイズ（セル高に比例しつつ可読性のため下限 clamp）
  const nameFontSize = Math.max(cellH * 0.26, 5)
  const labelFontSize = Math.max(cellH * 0.18, 4)
  const headerFontSize = Math.max(cellH * 0.18, 5)

  return {
    orientation,
    pageW,
    pageH,
    margin: MARGIN,
    titleBaselineTop,
    titleFontSize: 16,
    blackboardTop,
    blackboardH: BLACKBOARD_H,
    blackboardFontSize: 9,
    gridLeft,
    gridTop,
    gridWidth,
    gridHeight,
    rowLabelW,
    colHeaderH,
    cellW,
    cellH,
    gapX,
    gapY,
    nameFontSize,
    labelFontSize,
    headerFontSize,
    footerLineTop,
    footerBaselineTop,
    footerFontSize: 8,
  }
}
