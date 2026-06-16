import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import MobileHeader from './MobileHeader'
import { useStore } from '@/lib/store'

describe('MobileHeader', () => {
  beforeEach(() => {
    useStore.getState().setSidebarOpen(false)
  })

  it('ロゴ「OptiSeat」が表示される', () => {
    render(<MobileHeader />)
    expect(screen.getByText('OptiSeat')).toBeInTheDocument()
  })

  it('メニューを開くボタンが表示される', () => {
    render(<MobileHeader />)
    expect(screen.getByRole('button', { name: 'メニューを開く' })).toBeInTheDocument()
  })

  it('ボタンクリックで store の sidebarOpen が true になる', () => {
    render(<MobileHeader />)
    fireEvent.click(screen.getByRole('button', { name: 'メニューを開く' }))
    expect(useStore.getState().sidebarOpen).toBe(true)
  })

  it('md:hidden クラスを持つ（PC では非表示）', () => {
    const { container } = render(<MobileHeader />)
    const header = container.querySelector('header')
    expect(header?.className).toContain('md:hidden')
  })
})
