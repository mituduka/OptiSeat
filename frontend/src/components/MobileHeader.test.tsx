import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import MobileHeader from './MobileHeader'

describe('MobileHeader', () => {
  it('ロゴ「OptiSeat」が表示される', () => {
    render(<MobileHeader />)
    expect(screen.getByText('OptiSeat')).toBeInTheDocument()
  })

  it('ナビ用のボタンを持たない（ナビは BottomNav に一本化）', () => {
    render(<MobileHeader />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('md:hidden クラスを持つ（PC では非表示）', () => {
    const { container } = render(<MobileHeader />)
    const header = container.querySelector('header')
    expect(header?.className).toContain('md:hidden')
  })

  it('固定（fixed / sticky）されない（本文と一緒にスクロールして消える）', () => {
    const { container } = render(<MobileHeader />)
    const header = container.querySelector('header')
    expect(header?.className).not.toMatch(/\b(fixed|sticky)\b/)
  })
})
