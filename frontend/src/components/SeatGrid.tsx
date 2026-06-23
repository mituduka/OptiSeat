'use client'

import { generateSeats } from '@/lib/seats'
import { getGroupStyle } from '@/lib/groupColors'
import GridScrollArea from '@/components/GridScrollArea'
import type { SeatInput, Group } from '@/types'

interface Props {
  numRows: number
  numCols: number
  /** クリック時に seat_id を渡すコールバック（省略可） */
  onSeatClick?: (seatId: number) => void
  /** 各座席に表示するラベル（省略時は座席番号） */
  seatLabels?: Map<number, string>
  /** ハイライトする座席 id のセット */
  highlightIds?: Set<number>
  /** 前側配慮エリアとする先頭からの行数 */
  frontRowCount?: number
  /** 後側配慮エリアとする末尾からの行数 */
  backRowCount?: number
  /** 班情報（班色表示用） */
  groups?: Group[]
  /** 空席として表示する座席の座標リスト */
  emptySeats?: { row: number; col: number }[]
}

export default function SeatGrid({
  numRows,
  numCols,
  onSeatClick,
  seatLabels,
  highlightIds,
  frontRowCount = 1,
  backRowCount,
  groups,
  emptySeats = [],
}: Props) {
  const seats = generateSeats(numRows, numCols)

  // 行ごとにグルーピング
  const rows: SeatInput[][] = []
  for (let r = 1; r <= numRows; r++) {
    rows.push(seats.filter((s) => s.row === r))
  }

  return (
    <GridScrollArea innerClassName="flex flex-col gap-2">
      {/* 黒板 */}
      <div className="w-full text-center text-xs text-ink-muted border-b-4 border-ink-soft pb-1 mb-1">
        黒板（前）
      </div>

      {/* 列番号ヘッダー */}
      <div className="flex items-center gap-1">
        <span className="w-8 shrink-0" /> {/* 行ラベル分のスペース */}
        <div className="flex gap-2">
          {Array.from({ length: numCols }, (_, i) => i + 1).map((c) => (
            <span
              key={c}
              className="w-20 text-center text-xs text-ink-faint font-medium"
            >
              {c}列
            </span>
          ))}
        </div>
      </div>

      {rows.map((rowSeats, ri) => {
        const rowNum = ri + 1
        const isFront = rowNum <= frontRowCount
        const isBack =
          backRowCount !== undefined &&
          backRowCount > 0 &&
          rowNum > numRows - backRowCount
        return (
          <div key={rowNum} className="flex items-center gap-1">
            {/* 行番号ラベル */}
            <span className="w-8 text-xs text-center font-medium shrink-0 text-ink-faint">
              {rowNum}行
            </span>
            <div className="flex gap-2">
              {rowSeats.map((seat) => {
                const highlighted = highlightIds?.has(seat.id)
                const isEmpty = emptySeats.some((c) => c.row === seat.row && c.col === seat.col)
                const label = seatLabels?.get(seat.id) ?? String(seat.id)
                const seatGroupId = groups?.find((g) =>
                  g.seatCoords.some((c) => c.row === seat.row && c.col === seat.col),
                )?.groupId

                let className: string
                let style: React.CSSProperties = {}

                if (isEmpty) {
                  className = 'w-20 h-14 rounded-sm border text-xs font-medium bg-slate-200 border-slate-400 text-slate-500'
                } else if (highlighted) {
                  className = 'w-20 h-14 rounded-sm border text-xs font-medium bg-blue-200 border-blue-500 text-blue-800'
                } else if (seatGroupId !== undefined) {
                  const gs = getGroupStyle(seatGroupId)
                  className = 'w-20 h-14 rounded-sm border text-xs font-medium'
                  style = {
                    backgroundColor: gs.backgroundColor,
                    borderColor: gs.borderColor,
                    color: gs.color,
                  }
                } else {
                  className = 'w-20 h-14 rounded-sm border text-xs font-medium bg-white border-slate-300 text-slate-600'
                }

                return (
                  <button
                    key={seat.id}
                    onClick={() => onSeatClick?.(seat.id)}
                    disabled={!onSeatClick}
                    aria-label={isEmpty ? '空席' : label}
                    style={style}
                    className={[
                      className,
                      'transition-colors',
                      onSeatClick ? 'cursor-pointer hover:opacity-80' : 'cursor-default',
                    ].join(' ')}
                  >
                    {isEmpty ? '空席' : label}
                  </button>
                )
              })}
            </div>
            {/* 右側ラベル */}
            {isFront && (
              <span className="ml-1 text-xs text-amber-700 shrink-0">前側</span>
            )}
            {isBack && (
              <span className="ml-1 text-xs text-teal-700 shrink-0">後側</span>
            )}
          </div>
        )
      })}
    </GridScrollArea>
  )
}
