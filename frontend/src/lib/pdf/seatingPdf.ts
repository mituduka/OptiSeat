/**
 * 確定座席表データから端末非依存のベクター PDF を生成する（クライアントサイド完結）。
 *
 * 文字はフォントを埋め込まず、使用するグリフのアウトラインを「ベクターパス」として描画する。
 * これにより:
 *  - フォントエンジンの差が一切なくなり、PC・スマホなど端末によらず完全に同一の出力になる。
 *  - PDF には実際に使った文字の図形だけが入るため非常に軽量（数十 KB）になる。
 *  - 任意の人名漢字・異体字（髙・﨑・邉 等）も、配布フォントに字形があれば確実に描画できる。
 *
 * 全寸法は pt、全色は RGB 即値で指定し、DOM・getComputedStyle に一切依存しない。
 */
import { PDFDocument, rgb, type PDFPage } from 'pdf-lib'
import { create as createFont } from 'fontkit'
import type { Font } from 'fontkit'
import { getGroupStyle } from '@/lib/groupColors'
import { hslToRgb01, type Rgb01 } from './hslToRgb'
import { PDF_COLORS } from './pdfColors'
import { computeLayout, type PdfLayout } from './layout'
import { buildSeatingModel, type SeatCellModel, type SeatingModelInput } from './seatingModel'
import { loadNotoSansJpBytes } from './loadFont'

export interface SeatingPdfInput extends SeatingModelInput {
  /** タイトル（既定: 「座席表」） */
  title?: string
}

type Align = 'left' | 'center'

const col = (c: Rgb01) => rgb(c.r, c.g, c.b)

export async function generateSeatingPdf(input: SeatingPdfInput): Promise<Blob> {
  const title = input.title ?? '座席表'
  const model = buildSeatingModel(input)
  const layout = computeLayout(model.numRows, model.numCols)

  const fontBytes = await loadNotoSansJpBytes()
  // fontkit はアウトライン取得にのみ使う（PDF へは埋め込まない）
  const parsed = createFont(fontBytes as unknown as Buffer)
  // 単一フォント（コレクションでない）を前提
  const font = parsed as Font

  const doc = await PDFDocument.create()
  // 端末によらず同一バイトにするため生成日時メタを固定する
  const fixedDate = new Date(Date.UTC(2000, 0, 1))
  doc.setCreationDate(fixedDate)
  doc.setModificationDate(fixedDate)
  doc.setTitle(title)

  const page = doc.addPage([layout.pageW, layout.pageH])
  const draw = createTextDrawer(page, font, layout)

  drawTitle(draw, layout, title)
  drawBlackboard(page, draw, layout)
  drawHeaders(draw, layout, model.numRows, model.numCols)
  for (const cell of model.cells) {
    drawCell(page, draw, layout, cell)
  }
  drawFooter(page, draw, layout)

  const bytes = await doc.save()
  return new Blob([bytes as BlobPart], { type: 'application/pdf' })
}

// --- テキスト描画（グリフをベクターパスとして描く） -------------------------

interface TextDrawer {
  /** トップダウン baseline 指定でテキストを描く */
  text: (str: string, x: number, baselineTop: number, size: number, color: Rgb01, align?: Align) => void
  /** 指定サイズでのテキスト幅（pt） */
  width: (str: string, size: number) => number
}

function createTextDrawer(page: PDFPage, font: Font, layout: PdfLayout): TextDrawer {
  const upm = font.unitsPerEm
  const topToY = (top: number) => layout.pageH - top

  const width = (str: string, size: number): number => {
    if (!str) return 0
    const run = font.layout(str)
    let w = 0
    for (const g of run.glyphs) w += g.advanceWidth
    return (w * size) / upm
  }

  const text = (
    str: string,
    x: number,
    baselineTop: number,
    size: number,
    color: Rgb01,
    align: Align = 'left',
  ): void => {
    if (!str) return
    const run = font.layout(str)
    const scale = size / upm
    let penX = align === 'center' ? x - width(str, size) / 2 : x
    const baselineY = topToY(baselineTop)
    for (const g of run.glyphs) {
      // グリフは y-up（font 座標）。drawSvgPath は y-down 前提のため y を反転して渡す。
      const svg = g.path.scale(1, -1).toSVG()
      if (svg) {
        page.drawSvgPath(svg, { x: penX, y: baselineY, scale, color: col(color) })
      }
      penX += g.advanceWidth * scale
    }
  }

  return { text, width }
}

function colLeft(layout: PdfLayout, c: number): number {
  return layout.gridLeft + layout.rowLabelW + (c - 1) * (layout.cellW + layout.gapX)
}
function rowTop(layout: PdfLayout, r: number): number {
  return layout.gridTop + layout.colHeaderH + (r - 1) * (layout.cellH + layout.gapY)
}

/**
 * 氏名を必ず1行に収める。
 * baseSize で収まればそのまま、収まらなければフォントを自動縮小して幅に合わせる
 * （幅はサイズに線形比例するため1回の計算で算出）。minSize でも溢れる極端な長さのみ
 * 最終手段として末尾「…」で切り詰める。改行は一切行わない。
 */
export function fitSingleLine(
  draw: Pick<TextDrawer, 'width'>,
  text: string,
  maxWidth: number,
  baseSize: number,
  minSize: number,
): { text: string; size: number } {
  if (!text) return { text: '', size: baseSize }
  const baseW = draw.width(text, baseSize)
  if (baseW <= maxWidth) return { text, size: baseSize }

  // 幅に合わせて縮小（幅はサイズに線形比例）。下限以上に収まるならそのまま1行表示。
  const natural = (baseSize * maxWidth) / baseW
  if (natural >= minSize) return { text, size: natural }

  // 下限サイズでも収まらない極端な長さのみ、末尾を「…」で省略。
  // コードポイント単位で削り、サロゲートペア（CJK拡張B等）を分割しない。
  const chars = Array.from(text)
  while (chars.length > 0 && draw.width(chars.join('') + '…', minSize) > maxWidth) {
    chars.pop()
  }
  return { text: chars.join('') + '…', size: minSize }
}

// --- 各要素の描画 -----------------------------------------------------------

function drawTitle(draw: TextDrawer, layout: PdfLayout, title: string): void {
  // 長いタイトルはページ幅に収まるよう自動縮小（極端な長さは末尾省略）
  const maxW = layout.pageW - 2 * layout.margin
  const { text, size } = fitSingleLine(draw, title, maxW, layout.titleFontSize, 9)
  draw.text(text, layout.pageW / 2, layout.titleBaselineTop, size, PDF_COLORS.name, 'center')
}

function drawBlackboard(page: PDFPage, draw: TextDrawer, layout: PdfLayout): void {
  const centerX = layout.gridLeft + layout.gridWidth / 2
  draw.text(
    '黒板（前）',
    centerX,
    layout.blackboardTop + layout.blackboardH * 0.7,
    layout.blackboardFontSize,
    PDF_COLORS.blackboard,
    'center',
  )
  const lineTop = layout.blackboardTop + layout.blackboardH
  drawHLine(page, layout, layout.gridLeft, layout.gridLeft + layout.gridWidth, lineTop, 2, PDF_COLORS.blackboardLine)
}

function drawHeaders(draw: TextDrawer, layout: PdfLayout, numRows: number, numCols: number): void {
  for (let c = 1; c <= numCols; c++) {
    draw.text(
      `${c}列`,
      colLeft(layout, c) + layout.cellW / 2,
      layout.gridTop + layout.colHeaderH * 0.72,
      layout.headerFontSize,
      PDF_COLORS.label,
      'center',
    )
  }
  for (let r = 1; r <= numRows; r++) {
    draw.text(
      `${r}行`,
      layout.gridLeft + layout.rowLabelW / 2,
      rowTop(layout, r) + layout.cellH / 2 + layout.headerFontSize * 0.35,
      layout.headerFontSize,
      PDF_COLORS.label,
      'center',
    )
  }
}

function drawCell(page: PDFPage, draw: TextDrawer, layout: PdfLayout, cell: SeatCellModel): void {
  const left = colLeft(layout, cell.col)
  const top = rowTop(layout, cell.row)
  const { cellW, cellH } = layout
  const topToY = (t: number) => layout.pageH - t

  // セル背景・枠
  let bg = PDF_COLORS.white
  let border = PDF_COLORS.defaultBorder
  if (cell.isExcluded) {
    bg = PDF_COLORS.excludedBg
    border = PDF_COLORS.excludedBorder
  } else if (cell.isEmpty) {
    bg = PDF_COLORS.emptyBg
  } else if (cell.groupId !== null) {
    const gs = getGroupStyle(cell.groupId)
    bg = hslToRgb01(gs.backgroundColor)
    border = hslToRgb01(gs.borderColor)
  }
  page.drawRectangle({
    x: left,
    y: topToY(top + cellH),
    width: cellW,
    height: cellH,
    color: col(bg),
    borderColor: col(border),
    borderWidth: 0.75,
  })

  // 空席表示
  if (cell.isExcluded || cell.isEmpty) {
    const label = cell.isExcluded ? '空席（指定）' : '空席'
    const size = Math.max(layout.nameFontSize * 0.7, 4)
    draw.text(label, left + cellW / 2, top + cellH / 2 + size * 0.38, size, PDF_COLORS.emptyText, 'center')
    return
  }

  // 児童・生徒配置セル
  const pad = cellW * 0.06
  const innerW = cellW - 2 * pad
  // 氏名は必ず1行（収まらなければ自動縮小）
  const minNameSize = Math.max(layout.nameFontSize * 0.4, 4)
  const { text: nameText, size: drawSize } = fitSingleLine(
    draw,
    cell.studentName ?? '',
    innerW,
    layout.nameFontSize,
    minNameSize,
  )
  const nameBlockH = drawSize * 1.18

  // 画面（SeatingGrid.tsx）の2段固定レイアウトと同じ比率で配置する:
  // 氏名ゾーン中央 = セル上端から 0.344×cellH、注釈ゾーン上端 = 0.656×cellH。
  // ラベルの有無でセル間の氏名位置がずれない。
  const nameCenterTop = top + cellH * 0.344
  const nameBandTop = nameCenterTop - nameBlockH / 2

  // 性別の名前帯背景
  const genderBg =
    cell.gender === 'male'
      ? PDF_COLORS.genderMaleBg
      : cell.gender === 'female'
        ? PDF_COLORS.genderFemaleBg
        : PDF_COLORS.white
  page.drawRectangle({
    x: left + pad,
    y: topToY(nameBandTop + nameBlockH),
    width: innerW,
    height: nameBlockH,
    color: col(genderBg),
  })

  // 児童・生徒名（1行・帯の縦中央寄せ）。CJK字面の中心は baseline の約 0.38×サイズ 上。
  const nameBaselineTop = nameCenterTop + drawSize * 0.38
  draw.text(nameText, left + cellW / 2, nameBaselineTop, drawSize, PDF_COLORS.name, 'center')

  // 班分散グループ紫ラベル
  if (cell.leaderLabels.length > 0) {
    drawLeaderLabels(page, draw, layout, cell.leaderLabels, left, cellW, top + cellH * 0.656, layout.labelFontSize, innerW)
  }
}

function drawLeaderLabels(
  page: PDFPage,
  draw: TextDrawer,
  layout: PdfLayout,
  labels: string[],
  cellLeft: number,
  cellW: number,
  rowTopPos: number,
  size: number,
  maxWidth: number,
): void {
  const hpad = size * 0.25
  const gap = size * 0.3
  const boxH = size * 1.25
  const topToY = (t: number) => layout.pageH - t

  // 横幅に収まるラベルのみ描画する
  const items: { text: string; w: number }[] = []
  let totalW = 0
  for (const text of labels) {
    const w = draw.width(text, size) + hpad * 2
    const add = (items.length > 0 ? gap : 0) + w
    if (totalW + add > maxWidth) break
    items.push({ text, w })
    totalW += add
  }
  if (items.length === 0) return

  let x = cellLeft + (cellW - totalW) / 2
  for (const item of items) {
    page.drawRectangle({
      x,
      y: topToY(rowTopPos + boxH),
      width: item.w,
      height: boxH,
      color: col(PDF_COLORS.leaderBg),
    })
    draw.text(item.text, x + hpad, rowTopPos + boxH - size * 0.28, size, PDF_COLORS.leaderText, 'left')
    x += item.w + gap
  }
}

function drawFooter(page: PDFPage, draw: TextDrawer, layout: PdfLayout): void {
  const right = layout.gridLeft + layout.gridWidth
  drawHLine(page, layout, layout.gridLeft, right, layout.footerLineTop, 0.5, PDF_COLORS.divider)
  const text = 'OptiSeat で作成'
  const w = draw.width(text, layout.footerFontSize)
  draw.text(text, right - w, layout.footerBaselineTop, layout.footerFontSize, PDF_COLORS.footer, 'left')
}

/** トップダウン y 指定の水平線を描く */
function drawHLine(
  page: PDFPage,
  layout: PdfLayout,
  x1: number,
  x2: number,
  topY: number,
  thickness: number,
  color: Rgb01,
): void {
  const y = layout.pageH - topY
  page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness, color: col(color) })
}
