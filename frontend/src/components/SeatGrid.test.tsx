import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SeatGrid from './SeatGrid'

describe('SeatGrid', () => {
  it('numRows × numCols 個のボタンを描画する', () => {
    render(<SeatGrid numRows={2} numCols={3} />)
    // 「黒板（前）」ラベルを除いたボタン数
    const buttons = screen.getAllByRole('button')
    expect(buttons).toHaveLength(6)
  })

  it('デフォルトで座席番号をラベルとして表示する', () => {
    render(<SeatGrid numRows={1} numCols={3} />)
    expect(screen.getByRole('button', { name: '1' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '2' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '3' })).toBeInTheDocument()
  })

  it('seatLabels が指定されたときカスタムラベルを表示する', () => {
    const labels = new Map([[1, '山田'], [2, '鈴木'], [3, '田中']])
    render(<SeatGrid numRows={1} numCols={3} seatLabels={labels} />)
    expect(screen.getByRole('button', { name: '山田' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '鈴木' })).toBeInTheDocument()
  })

  it('「黒板（前）」テキストを表示する', () => {
    render(<SeatGrid numRows={2} numCols={2} />)
    expect(screen.getByText('黒板（前）')).toBeInTheDocument()
  })

  it('onSeatClick が座席 id を引数にして呼ばれる', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(<SeatGrid numRows={1} numCols={3} onSeatClick={onClick} />)

    await user.click(screen.getByRole('button', { name: '2' }))
    expect(onClick).toHaveBeenCalledOnce()
    expect(onClick).toHaveBeenCalledWith(2)
  })

  it('highlightIds に含まれる座席は青系クラスを持つ', () => {
    const highlighted = new Set([1])
    render(<SeatGrid numRows={1} numCols={2} highlightIds={highlighted} />)
    const btn1 = screen.getByRole('button', { name: '1' })
    const btn2 = screen.getByRole('button', { name: '2' })
    expect(btn1.className).toMatch(/bg-blue/)
    expect(btn2.className).not.toMatch(/bg-blue/)
  })

  it('frontRowCount が指定されても前列行ラベルは常にニュートラル色（青色なし）', () => {
    render(<SeatGrid numRows={2} numCols={1} frontRowCount={1} />)
    const label = screen.getByText('1行')
    expect(label.className).toMatch(/text-ink/)
    expect(label.className).not.toMatch(/text-blue/)
  })

  it('frontRowCount の行に「前側」テキストが表示される', () => {
    render(<SeatGrid numRows={3} numCols={1} frontRowCount={1} />)
    expect(screen.getByText('前側')).toBeInTheDocument()
  })

  it('backRowCount の行に「後側」テキストが表示される', () => {
    render(<SeatGrid numRows={3} numCols={1} backRowCount={1} />)
    expect(screen.getByText('後側')).toBeInTheDocument()
  })

  it('seatCoords ベースで班色が適用される', () => {
    const groups = [{ groupId: 1, seatCoords: [{ row: 1, col: 1 }] }]
    render(<SeatGrid numRows={1} numCols={2} groups={groups} />)
    // 班色が適用された座席ボタンはデフォルトの bg-white を持たない
    const btn1 = screen.getByRole('button', { name: '1' })
    expect(btn1.className).not.toMatch(/bg-white/)
  })

  it('1×1 グリッドは座席ボタン 1 つ', () => {
    render(<SeatGrid numRows={1} numCols={1} />)
    expect(screen.getAllByRole('button')).toHaveLength(1)
  })
})
