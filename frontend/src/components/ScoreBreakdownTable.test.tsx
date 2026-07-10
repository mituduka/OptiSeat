import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ScoreBreakdownTable from './ScoreBreakdownTable'
import { CONSTRAINT_META } from '@/lib/constraintLabels'
import type { ScoreBreakdown, ConstraintToggles } from '@/types'

const ZERO_BREAKDOWN: ScoreBreakdown = {
  front_preferred_violation: 0,
  back_preferred_violation: 0,
  group_gender_imbalance: 0,
  loneliness_violation: 0,
  prev_assign_same: 0,
  prev_neighbor_same: 0,
  prev_group_same: 0,
  fixed_violation: 0,
  gender_constraint_violation: 0,
  relative_fixed_violation: 0,
  forbidden_violation: 0,
}

const BASE_PROPS = {
  scoreBreakdown: ZERO_BREAKDOWN,
  constraintMeta: CONSTRAINT_META,
}

// ---------------------------------------------------------------------------

describe('ScoreBreakdownTable 違反件数の表示', () => {
  it('違反が 0 件のとき「違反なし」を表示する', () => {
    render(<ScoreBreakdownTable {...BASE_PROPS} />)
    expect(screen.getByText('違反なし')).toBeInTheDocument()
  })

  it('違反が 1 件以上のとき「違反 N 件」を表示する', () => {
    const breakdown: ScoreBreakdown = { ...ZERO_BREAKDOWN, front_preferred_violation: 3 }
    render(<ScoreBreakdownTable {...BASE_PROPS} scoreBreakdown={breakdown} />)
    expect(screen.getByText('違反 3 件')).toBeInTheDocument()
  })
})

describe('ScoreBreakdownTable 制約トグル', () => {
  it('constraintToggles で無効化された制約の列に「無効」と表示される', () => {
    const toggles: ConstraintToggles = {
      gender_balance: true,
      loneliness: true,
      differ_seat: false,   // prev_assign_same を無効化
      differ_neighbor: true,
      differ_group: true,
    }
    render(<ScoreBreakdownTable {...BASE_PROPS} constraintToggles={toggles} />)
    expect(screen.getByText('無効')).toBeInTheDocument()
  })
})

describe('ScoreBreakdownTable ツールチップ', () => {
  it('showViolationDetail=true のとき説明ボタンのホバーでツールチップが表示される', () => {
    render(<ScoreBreakdownTable {...BASE_PROPS} showViolationDetail={true} />)

    const trigger = screen.getByRole('button', { name: '前側配慮が満たされていない件数' })
    fireEvent.mouseEnter(trigger)

    expect(screen.getByText('前側配慮が満たされていない件数')).toBeInTheDocument()
  })

  it('説明ボタンはフォーカスでもツールチップを表示し、Escape で閉じる', () => {
    render(<ScoreBreakdownTable {...BASE_PROPS} showViolationDetail={true} />)

    const trigger = screen.getByRole('button', { name: '前側配慮が満たされていない件数' })
    fireEvent.focus(trigger)
    expect(screen.getByText('前側配慮が満たされていない件数')).toBeInTheDocument()

    fireEvent.keyDown(trigger, { key: 'Escape' })
    expect(screen.queryByText('前側配慮が満たされていない件数')).not.toBeInTheDocument()
  })

  it('showViolationDetail=false のとき説明ボタン自体が表示されない', () => {
    render(<ScoreBreakdownTable {...BASE_PROPS} showViolationDetail={false} />)

    expect(screen.queryByRole('button', { name: '前側配慮が満たされていない件数' })).not.toBeInTheDocument()
    expect(screen.queryByText('前側配慮が満たされていない件数')).not.toBeInTheDocument()
  })

  it('constraintToggles で無効化された制約のラベルをホバーしてもツールチップが表示される', () => {
    const toggles: ConstraintToggles = {
      gender_balance: false,
      loneliness: true,
      differ_seat: false,
      differ_neighbor: false,
      differ_group: false,
    }
    render(
      <ScoreBreakdownTable
        {...BASE_PROPS}
        showViolationDetail={true}
        constraintToggles={toggles}
      />,
    )

    // gender_balance=false のため「班内男女偏り」は isDisabled=true になるが、ツールチップは表示される
    const trigger = screen.getByRole('button', { name: '班内に男女を最低1人ずつ配置されていない件数' })
    fireEvent.mouseEnter(trigger)

    expect(screen.queryByText('班内に男女を最低1人ずつ配置されていない件数')).toBeInTheDocument()
  })
})

describe('ScoreBreakdownTable disabledKeys（エリア0行の前後配慮）', () => {
  it('disabledKeys で指定した制約の列に「無効」と表示され取り消し線が付く', () => {
    render(
      <ScoreBreakdownTable
        {...BASE_PROPS}
        disabledKeys={['front_preferred_violation', 'back_preferred_violation']}
      />,
    )
    expect(screen.getAllByText('無効')).toHaveLength(2)
    const label = screen.getByText('前側配慮違反').closest('span')
    expect(label?.className).toContain('line-through')
  })

  it('disabledKeys 未指定なら前後配慮は通常表示', () => {
    render(<ScoreBreakdownTable {...BASE_PROPS} />)
    expect(screen.queryByText('無効')).not.toBeInTheDocument()
  })
})
