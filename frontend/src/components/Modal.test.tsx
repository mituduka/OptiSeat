import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import Modal from './Modal'

describe('Modal', () => {
  it('children をレンダリングする', () => {
    render(
      <Modal onClose={() => {}}>
        <div>本文</div>
      </Modal>,
    )
    expect(screen.getByText('本文')).toBeInTheDocument()
  })

  it('backdrop クリックで onClose が呼ばれる', () => {
    const onClose = vi.fn()
    render(
      <Modal onClose={onClose}>
        <div>本文</div>
      </Modal>,
    )
    const dialog = screen.getByRole('dialog')
    fireEvent.click(dialog)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('内側のクリックでは onClose が呼ばれない', () => {
    const onClose = vi.fn()
    render(
      <Modal onClose={onClose}>
        <div>本文</div>
      </Modal>,
    )
    fireEvent.click(screen.getByText('本文'))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('ESC キーで onClose が呼ばれる', () => {
    const onClose = vi.fn()
    render(
      <Modal onClose={onClose}>
        <div>本文</div>
      </Modal>,
    )
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('aria-modal="true" を持つ', () => {
    render(
      <Modal onClose={() => {}}>
        <div>本文</div>
      </Modal>,
    )
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true')
  })
})
