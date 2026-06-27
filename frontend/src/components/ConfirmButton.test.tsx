import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import ConfirmButton from './ConfirmButton'

describe('ConfirmButton', () => {
  it('1回目で確認状態になり、2回目で実行する', () => {
    const onConfirm = vi.fn()
    render(
      <ConfirmButton onConfirm={onConfirm} confirmChildren="本当に削除？">
        削除
      </ConfirmButton>,
    )
    const button = screen.getByRole('button')

    fireEvent.click(button)
    expect(button).toHaveTextContent('本当に削除？')
    expect(onConfirm).not.toHaveBeenCalled()

    fireEvent.click(button)
    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(button).toHaveTextContent('削除')
  })

  it('ボタン外をクリック/タップすると通常表示に戻る', () => {
    render(
      <div>
        <span data-testid="outside">外側</span>
        <ConfirmButton onConfirm={vi.fn()} confirmChildren="本当に削除？">
          削除
        </ConfirmButton>
      </div>,
    )
    const button = screen.getByRole('button')

    fireEvent.click(button)
    expect(button).toHaveTextContent('本当に削除？')

    fireEvent.pointerDown(screen.getByTestId('outside'))
    expect(button).toHaveTextContent('削除')
  })
})
