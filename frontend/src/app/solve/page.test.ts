import { resolveStudentNames } from './page'
import type { Student } from '@/types'

const students: Student[] = [
  { id: 1, name: '山田 太郎', gender: 'male', tags: [] },
  { id: 2, name: '鈴木 花子', gender: 'female', tags: [] },
]

describe('resolveStudentNames', () => {
  it('IDを氏名に置換する', () => {
    expect(resolveStudentNames('ID:1 は名簿に存在しません', students))
      .toBe('山田 太郎 は名簿に存在しません')
  })

  it('複数のIDを全て置換する', () => {
    expect(resolveStudentNames('ID:1 と ID:2 が矛盾', students))
      .toBe('山田 太郎 と 鈴木 花子 が矛盾')
  })

  it('存在しないIDはフォールバック表示', () => {
    expect(resolveStudentNames('ID:999 は名簿に存在しません', students))
      .toBe('ID:999 は名簿に存在しません')
  })

  it('IDなしのメッセージは変化なし', () => {
    expect(resolveStudentNames('問題はありません', students))
      .toBe('問題はありません')
  })

  it('空文字列はそのまま', () => {
    expect(resolveStudentNames('', students)).toBe('')
  })
})
