import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { NumberStepper } from './NumberStepper'

describe('NumberStepper', () => {
  it('指定した value が表示される', () => {
    render(<NumberStepper value={5} min={1} max={10} onChange={() => {}} />)
    expect(screen.getByText('5')).toBeInTheDocument()
  })

  it('「＋」をクリックすると onChange(value + 1) が呼ばれる', async () => {
    const onChange = vi.fn()
    render(<NumberStepper value={5} min={1} max={10} onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: '増やす' }))
    expect(onChange).toHaveBeenCalledWith(6)
  })

  it('「−」をクリックすると onChange(value - 1) が呼ばれる', async () => {
    const onChange = vi.fn()
    render(<NumberStepper value={5} min={1} max={10} onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: '減らす' }))
    expect(onChange).toHaveBeenCalledWith(4)
  })

  it('value === max のとき「＋」ボタンが disabled になる', () => {
    render(<NumberStepper value={10} min={1} max={10} onChange={() => {}} />)
    expect(screen.getByRole('button', { name: '増やす' })).toBeDisabled()
  })

  it('value === min のとき「−」ボタンが disabled になる', () => {
    render(<NumberStepper value={1} min={1} max={10} onChange={() => {}} />)
    expect(screen.getByRole('button', { name: '減らす' })).toBeDisabled()
  })

  it('disabled の「＋」ボタンをクリックしても onChange が呼ばれない', async () => {
    const onChange = vi.fn()
    render(<NumberStepper value={10} min={1} max={10} onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: '増やす' }))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('disabled の「−」ボタンをクリックしても onChange が呼ばれない', async () => {
    const onChange = vi.fn()
    render(<NumberStepper value={1} min={1} max={10} onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: '減らす' }))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('value < max のとき「＋」ボタンが有効', () => {
    render(<NumberStepper value={9} min={1} max={10} onChange={() => {}} />)
    expect(screen.getByRole('button', { name: '増やす' })).not.toBeDisabled()
  })

  it('value > min のとき「−」ボタンが有効', () => {
    render(<NumberStepper value={2} min={1} max={10} onChange={() => {}} />)
    expect(screen.getByRole('button', { name: '減らす' })).not.toBeDisabled()
  })
})
