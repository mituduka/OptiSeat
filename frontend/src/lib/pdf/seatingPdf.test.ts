import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { _resetFontCache } from './loadFont'
import { generateSeatingPdf, type SeatingPdfInput } from './seatingPdf'
import {
  SAMPLE_STUDENTS,
  SAMPLE_SEAT_SETTINGS,
  SAMPLE_GROUPS,
  SAMPLE_LEADER_GROUPS,
} from '@/lib/sampleData'
import { generateSeats } from '@/lib/seats'
import type { AssignmentResult } from '@/types'

// 実フォント（public/fonts）を読み込めるか確認。読めない環境では suite を skip。
const dir = path.dirname(fileURLToPath(import.meta.url))
const fontPath = path.resolve(dir, '../../../public/fonts/NotoSansJP-Regular.ttf')
let fontBuf: Buffer | null = null
try {
  fontBuf = readFileSync(fontPath)
} catch {
  fontBuf = null
}

/** 児童・生徒を行優先で座席に割り当てる */
function assignAll(): AssignmentResult[] {
  const seats = generateSeats(SAMPLE_SEAT_SETTINGS.numRows, SAMPLE_SEAT_SETTINGS.numCols)
  return SAMPLE_STUDENTS.map((s, i) => ({ student_id: s.id, seat_id: seats[i].id }))
}

const baseInput: SeatingPdfInput = {
  students: SAMPLE_STUDENTS,
  seat: SAMPLE_SEAT_SETTINGS,
  groups: SAMPLE_GROUPS,
  leaderGroups: SAMPLE_LEADER_GROUPS,
  assignments: assignAll(),
}

const suite = fontBuf ? describe : describe.skip

suite('generateSeatingPdf', () => {
  beforeEach(() => {
    _resetFontCache()
    // loadNotoSansJpBytes が使う fetch を実フォントで満たす
    const ab = fontBuf!.buffer.slice(
      fontBuf!.byteOffset,
      fontBuf!.byteOffset + fontBuf!.byteLength,
    )
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, arrayBuffer: () => Promise.resolve(ab) }),
    )
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('application/pdf の Blob を返す', async () => {
    const blob = await generateSeatingPdf(baseInput)
    expect(blob).toBeInstanceOf(Blob)
    expect(blob.type).toBe('application/pdf')
    expect(blob.size).toBeGreaterThan(0)
  })

  it('サブセット埋め込みで PDF が軽量（< 1.5MB）', async () => {
    const blob = await generateSeatingPdf(baseInput)
    expect(blob.size).toBeLessThan(1_500_000)
  })

  it('空席・指定空席があっても例外なく生成できる', async () => {
    const input: SeatingPdfInput = {
      ...baseInput,
      seat: { ...SAMPLE_SEAT_SETTINGS, emptySeats: [{ row: 1, col: 1 }, { row: 5, col: 6 }] },
      assignments: assignAll().slice(0, 10), // 一部のみ配置 → 空席が出る
    }
    const blob = await generateSeatingPdf(input)
    expect(blob.size).toBeGreaterThan(0)
  })

  it('班・班分散グループなしでも生成できる', async () => {
    const blob = await generateSeatingPdf({ ...baseInput, groups: [], leaderGroups: [] })
    expect(blob.size).toBeGreaterThan(0)
  })

  it('縦長グリッドでも生成できる', async () => {
    const input: SeatingPdfInput = {
      ...baseInput,
      seat: { ...SAMPLE_SEAT_SETTINGS, numRows: 10, numCols: 2, emptySeats: [] },
      groups: [],
      assignments: assignAll().slice(0, 20),
    }
    const blob = await generateSeatingPdf(input)
    expect(blob.size).toBeGreaterThan(0)
  })

  it('全席空席（配置なし）でも例外を投げない', async () => {
    const blob = await generateSeatingPdf({ ...baseInput, assignments: [] })
    expect(blob.size).toBeGreaterThan(0)
  })

  it('長い氏名でも例外を投げない（折り返し・省略）', async () => {
    const input: SeatingPdfInput = {
      ...baseInput,
      students: SAMPLE_STUDENTS.map((s) => ({ ...s, name: 'とても長い氏名のサンプル児童・生徒' })),
    }
    const blob = await generateSeatingPdf(input)
    expect(blob.size).toBeGreaterThan(0)
  })
})
