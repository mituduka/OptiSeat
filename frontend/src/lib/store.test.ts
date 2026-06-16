import { describe, it, expect, beforeEach } from 'vitest'
import { useStore } from './store'

// ダミーの求解結果（求解結果クリアテスト用）
const DUMMY_SOLVE_RESULT = { status: 'ok' as const, elapsed_ms: 1, solutions: [], error: null }
const DUMMY_ASSIGNMENTS = [{ student_id: 1, seat_id: 1 }]

// 各テスト前にストアをリセット
beforeEach(() => {
  useStore.setState({
    students: [],
    seat: { numRows: 2, numCols: 3, frontRowCount: 1, backRowCount: 1, emptySeats: [], numGroups: 1 },
    groups: [],
    fixedConstraints: [],
    forbiddenConstraints: [],
    seatGenderConstraints: [],
    relativeFixedConstraints: [],
    leaderGroups: [],
    prevAssign: [],
    solveResult: null,
    isSolving: false,
    adoptedAssignments: null,
    adjustingAssignments: null,
    finalizedAssignments: null,
    constraintToggles: { gender_balance: true, loneliness: true, differ_seat: false, differ_neighbor: false, differ_group: false },
  })
})

describe('students アクション', () => {
  it('addStudent で名簿に追加される', () => {
    useStore.getState().addStudent({ id: 1, name: '山田 太郎', gender: 'male', tags: [] })
    expect(useStore.getState().students).toHaveLength(1)
    expect(useStore.getState().students[0].name).toBe('山田 太郎')
  })

  it('removeStudent で該当行が削除される', () => {
    const { addStudent, removeStudent } = useStore.getState()
    addStudent({ id: 1, name: '山田 太郎', gender: 'male', tags: [] })
    addStudent({ id: 2, name: '鈴木 花子', gender: 'female', tags: [] })
    removeStudent(1)
    const students = useStore.getState().students
    expect(students).toHaveLength(1)
    expect(students[0].id).toBe(2)
  })

  it('updateStudent でフィールドを部分更新できる', () => {
    useStore.getState().addStudent({ id: 1, name: '山田 太郎', gender: 'male', tags: [] })
    useStore.getState().updateStudent(1, { tags: ['front_preferred'] })
    expect(useStore.getState().students[0].tags).toEqual(['front_preferred'])
    expect(useStore.getState().students[0].name).toBe('山田 太郎') // 変わらない
  })

  it('setStudents で全件置換される', () => {
    useStore.getState().addStudent({ id: 1, name: '山田 太郎', gender: 'male', tags: [] })
    useStore.getState().setStudents([
      { id: 10, name: '新しい人', gender: 'female', tags: [] },
    ])
    const students = useStore.getState().students
    expect(students).toHaveLength(1)
    expect(students[0].id).toBe(10)
  })
})

describe('seat アクション', () => {
  it('updateSeat で一部フィールドを更新できる', () => {
    useStore.getState().updateSeat({ numRows: 5 })
    const seat = useStore.getState().seat
    expect(seat.numRows).toBe(5)
    expect(seat.numCols).toBe(3)        // 変わらない
    expect(seat.frontRowCount).toBe(1)  // 変わらない
  })

  it('updateSeat で numGroups を更新できる', () => {
    useStore.getState().updateSeat({ numGroups: 4 })
    expect(useStore.getState().seat.numGroups).toBe(4)
  })

  it('toggleEmptySeat で空席を追加・削除できる', () => {
    useStore.getState().toggleEmptySeat({ row: 1, col: 3 })
    expect(useStore.getState().seat.emptySeats).toEqual([{ row: 1, col: 3 }])
    useStore.getState().toggleEmptySeat({ row: 1, col: 3 })
    expect(useStore.getState().seat.emptySeats).toEqual([])
  })
})

describe('fixedConstraints アクション', () => {
  it('addFixed で制約が追加される', () => {
    useStore.getState().addFixed({ studentId: 1, row: 1, col: 3 })
    expect(useStore.getState().fixedConstraints).toHaveLength(1)
    expect(useStore.getState().fixedConstraints[0]).toEqual({ studentId: 1, row: 1, col: 3 })
  })

  it('同じ studentId で addFixed すると上書きされる', () => {
    useStore.getState().addFixed({ studentId: 1, row: 1, col: 3 })
    useStore.getState().addFixed({ studentId: 1, row: 2, col: 1 })
    const fc = useStore.getState().fixedConstraints
    expect(fc).toHaveLength(1)
    expect(fc[0]).toEqual({ studentId: 1, row: 2, col: 1 })
  })

  it('removeFixed で指定した studentId の制約が削除される', () => {
    useStore.getState().addFixed({ studentId: 1, row: 1, col: 3 })
    useStore.getState().addFixed({ studentId: 2, row: 2, col: 1 })
    useStore.getState().removeFixed(1)
    const fc = useStore.getState().fixedConstraints
    expect(fc).toHaveLength(1)
    expect(fc[0].studentId).toBe(2)
  })

  it('clearFixed で全固定制約が削除される', () => {
    useStore.getState().addFixed({ studentId: 1, row: 1, col: 3 })
    useStore.getState().addFixed({ studentId: 2, row: 2, col: 1 })
    useStore.getState().clearFixed()
    expect(useStore.getState().fixedConstraints).toHaveLength(0)
  })

  it('numCols 変更後も範囲内の固定制約は維持される', () => {
    useStore.getState().updateSeat({ numRows: 3, numCols: 4 })
    useStore.getState().addFixed({ studentId: 1, row: 1, col: 2 }) // 列数変更後も有効
    useStore.getState().addFixed({ studentId: 2, row: 2, col: 4 }) // numCols=3 に縮小すると範囲外
    useStore.getState().updateSeat({ numCols: 3 })
    const fc = useStore.getState().fixedConstraints
    expect(fc).toHaveLength(1)
    expect(fc[0].studentId).toBe(1)
  })

  it('toggleEmptySeat で空席にした座席の固定制約が削除される', () => {
    useStore.getState().addFixed({ studentId: 1, row: 1, col: 2 })
    useStore.getState().toggleEmptySeat({ row: 1, col: 2 })
    expect(useStore.getState().fixedConstraints).toHaveLength(0)
  })
})

describe('forbiddenConstraints アクション', () => {
  it('addForbidden で adjacent8 制約が追加される', () => {
    useStore.getState().addForbidden({ studentIdA: 1, studentIdB: 2, type: 'adjacent8' })
    const fc = useStore.getState().forbiddenConstraints
    expect(fc).toHaveLength(1)
    expect(fc[0].type).toBe('adjacent8')
  })

  it('addForbidden で same_group タイプを追加できる', () => {
    useStore.getState().addForbidden({ studentIdA: 1, studentIdB: 2, type: 'same_group' })
    const fc = useStore.getState().forbiddenConstraints
    expect(fc).toHaveLength(1)
    expect(fc[0].type).toBe('same_group')
  })

  it('removeForbidden で対象ペアのみ削除される', () => {
    useStore.getState().addForbidden({ studentIdA: 1, studentIdB: 2, type: 'adjacent8' })
    useStore.getState().addForbidden({ studentIdA: 3, studentIdB: 4, type: 'adjacent8' })
    useStore.getState().removeForbidden(1, 2)
    const fc = useStore.getState().forbiddenConstraints
    expect(fc).toHaveLength(1)
    expect(fc[0]).toEqual({ studentIdA: 3, studentIdB: 4, type: 'adjacent8' })
  })

  it('removeForbidden は (A,B) と (B,A) の両方向を削除する', () => {
    useStore.getState().addForbidden({ studentIdA: 1, studentIdB: 2, type: 'adjacent8' })
    useStore.getState().addForbidden({ studentIdA: 2, studentIdB: 1, type: 'adjacent8' })
    useStore.getState().addForbidden({ studentIdA: 3, studentIdB: 4, type: 'adjacent8' })
    useStore.getState().removeForbidden(1, 2)
    const fc = useStore.getState().forbiddenConstraints
    expect(fc).toHaveLength(1)
    expect(fc[0]).toEqual({ studentIdA: 3, studentIdB: 4, type: 'adjacent8' })
  })

  it('addForbidden で同じペア＋タイプの重複は無視される', () => {
    useStore.getState().addForbidden({ studentIdA: 1, studentIdB: 2, type: 'adjacent8' })
    useStore.getState().addForbidden({ studentIdA: 1, studentIdB: 2, type: 'adjacent8' })
    expect(useStore.getState().forbiddenConstraints).toHaveLength(1)
  })

  it('addForbidden で逆順ペア（AB と BA）は別レコードとして登録される', () => {
    useStore.getState().addForbidden({ studentIdA: 1, studentIdB: 2, type: 'same_group' })
    useStore.getState().addForbidden({ studentIdA: 2, studentIdB: 1, type: 'same_group' })
    expect(useStore.getState().forbiddenConstraints).toHaveLength(2)
  })

  it('addForbidden で同ペアでもタイプが違えば追加される', () => {
    useStore.getState().addForbidden({ studentIdA: 1, studentIdB: 2, type: 'adjacent8' })
    useStore.getState().addForbidden({ studentIdA: 1, studentIdB: 2, type: 'same_group' })
    expect(useStore.getState().forbiddenConstraints).toHaveLength(2)
  })

  it('removeForbiddenAt でインデックス指定削除できる（同ペア別タイプも区別可能）', () => {
    useStore.getState().addForbidden({ studentIdA: 1, studentIdB: 2, type: 'adjacent8' })
    useStore.getState().addForbidden({ studentIdA: 1, studentIdB: 2, type: 'same_group' })
    useStore.getState().removeForbiddenAt(0)
    const fc = useStore.getState().forbiddenConstraints
    expect(fc).toHaveLength(1)
    expect(fc[0].type).toBe('same_group')
  })

  it('replaceForbiddenGroup で (A, type) グループを置き換えられる', () => {
    useStore.getState().addForbidden({ studentIdA: 1, studentIdB: 2, type: 'adjacent8' })
    useStore.getState().addForbidden({ studentIdA: 1, studentIdB: 3, type: 'adjacent8' })
    useStore.getState().addForbidden({ studentIdA: 1, studentIdB: 4, type: 'same_group' })
    useStore.getState().replaceForbiddenGroup(1, 'adjacent8', [
      { studentIdA: 1, studentIdB: 5, type: 'same_group' },
    ])
    const fc = useStore.getState().forbiddenConstraints
    // adjacent8 の (1,2) と (1,3) が消え、same_group の (1,5) に置換、(1,4,same_group) は残る
    expect(fc).toHaveLength(2)
    expect(fc.some((f) => f.studentIdB === 2)).toBe(false)
    expect(fc.some((f) => f.studentIdB === 5 && f.type === 'same_group')).toBe(true)
    expect(fc.some((f) => f.studentIdB === 4 && f.type === 'same_group')).toBe(true)
  })

  it('replaceForbiddenGroup: タイプ変更時に変更先の既存レコードと重複しない（バグ修正確認）', () => {
    // A→B,C,D を adjacent8 と same_group の両方で登録
    useStore.getState().addForbidden({ studentIdA: 1, studentIdB: 2, type: 'adjacent8' })
    useStore.getState().addForbidden({ studentIdA: 1, studentIdB: 3, type: 'adjacent8' })
    useStore.getState().addForbidden({ studentIdA: 1, studentIdB: 4, type: 'adjacent8' })
    useStore.getState().addForbidden({ studentIdA: 1, studentIdB: 2, type: 'same_group' })
    useStore.getState().addForbidden({ studentIdA: 1, studentIdB: 3, type: 'same_group' })
    useStore.getState().addForbidden({ studentIdA: 1, studentIdB: 4, type: 'same_group' })
    // same_group 行を編集して adjacent8 に変更
    useStore.getState().replaceForbiddenGroup(1, 'same_group', [
      { studentIdA: 1, studentIdB: 2, type: 'adjacent8' },
      { studentIdA: 1, studentIdB: 3, type: 'adjacent8' },
      { studentIdA: 1, studentIdB: 4, type: 'adjacent8' },
    ])
    const fc = useStore.getState().forbiddenConstraints
    // adjacent8 の (1,2), (1,3), (1,4) の3件のみ残るはず（重複しない）
    expect(fc).toHaveLength(3)
    expect(fc.every((f) => f.type === 'adjacent8')).toBe(true)
  })

  it('replaceForbiddenGroup: タイプ変更時に一部のBだけ重複していても正しく処理される', () => {
    // A→B,C を adjacent8、A→C,D を same_group で登録
    useStore.getState().addForbidden({ studentIdA: 1, studentIdB: 2, type: 'adjacent8' })
    useStore.getState().addForbidden({ studentIdA: 1, studentIdB: 3, type: 'adjacent8' })
    useStore.getState().addForbidden({ studentIdA: 1, studentIdB: 3, type: 'same_group' })
    useStore.getState().addForbidden({ studentIdA: 1, studentIdB: 4, type: 'same_group' })
    // same_group (C,D) を adjacent8 に変更
    useStore.getState().replaceForbiddenGroup(1, 'same_group', [
      { studentIdA: 1, studentIdB: 3, type: 'adjacent8' },
      { studentIdA: 1, studentIdB: 4, type: 'adjacent8' },
    ])
    const fc = useStore.getState().forbiddenConstraints
    // adjacent8: B(2), C(3), D(4) の3件（C は重複しない）
    expect(fc).toHaveLength(3)
    expect(fc.filter((f) => f.type === 'adjacent8')).toHaveLength(3)
    expect(fc.filter((f) => f.type === 'same_group')).toHaveLength(0)
  })

  it('clearForbidden で全隣接禁止制約が削除される', () => {
    useStore.getState().addForbidden({ studentIdA: 1, studentIdB: 2, type: 'adjacent8' })
    useStore.getState().addForbidden({ studentIdA: 3, studentIdB: 4, type: 'same_group' })
    useStore.getState().clearForbidden()
    expect(useStore.getState().forbiddenConstraints).toHaveLength(0)
  })
})

describe('solveResult アクション', () => {
  it('setIsSolving でフラグが切り替わる', () => {
    useStore.getState().setIsSolving(true)
    expect(useStore.getState().isSolving).toBe(true)
    useStore.getState().setIsSolving(false)
    expect(useStore.getState().isSolving).toBe(false)
  })

  it('setSolveResult で結果が保存される', () => {
    const mockResult = { status: 'ok' as const, elapsed_ms: 100, solutions: [], error: null }
    useStore.getState().setSolveResult(mockResult)
    expect(useStore.getState().solveResult).toEqual(mockResult)
  })
})

describe('finalizedAssignments アクション', () => {
  it('setFinalizedAssignments で配置が保存される', () => {
    const assignments = [{ student_id: 1, seat_id: 2 }]
    useStore.getState().setFinalizedAssignments(assignments)
    expect(useStore.getState().finalizedAssignments).toEqual(assignments)
  })

  it('setFinalizedAssignments(null) でリセットされる', () => {
    useStore.getState().setFinalizedAssignments([{ student_id: 1, seat_id: 2 }])
    useStore.getState().setFinalizedAssignments(null)
    expect(useStore.getState().finalizedAssignments).toBeNull()
  })
})

describe('setGroups アクション', () => {
  it('setGroups で班が設定される', () => {
    const groups = [{ groupId: 1, seatCoords: [{ row: 1, col: 1 }] }]
    useStore.getState().setGroups(groups)
    expect(useStore.getState().groups).toEqual(groups)
  })

  it('setGroups で求解結果がクリアされる', () => {
    useStore.setState({ solveResult: DUMMY_SOLVE_RESULT, adoptedAssignments: DUMMY_ASSIGNMENTS, adjustingAssignments: DUMMY_ASSIGNMENTS, finalizedAssignments: DUMMY_ASSIGNMENTS })
    useStore.getState().setGroups([])
    expect(useStore.getState().solveResult).toBeNull()
    expect(useStore.getState().adoptedAssignments).toBeNull()
    expect(useStore.getState().adjustingAssignments).toBeNull()
    expect(useStore.getState().finalizedAssignments).toBeNull()
  })
})

describe('seatGenderConstraints アクション', () => {
  it('addSeatGender で性別制約が追加される', () => {
    useStore.getState().addSeatGender({ row: 1, col: 1, allowedGender: 'male' })
    const sgc = useStore.getState().seatGenderConstraints
    expect(sgc).toHaveLength(1)
    expect(sgc[0]).toEqual({ row: 1, col: 1, allowedGender: 'male' })
  })

  it('addSeatGender で同じ座標を上書きする（upsert 動作）', () => {
    useStore.getState().addSeatGender({ row: 1, col: 1, allowedGender: 'male' })
    useStore.getState().addSeatGender({ row: 1, col: 1, allowedGender: 'female' })
    const sgc = useStore.getState().seatGenderConstraints
    expect(sgc).toHaveLength(1)
    expect(sgc[0].allowedGender).toBe('female')
  })

  it('removeSeatGender で指定座標の制約が削除される', () => {
    useStore.getState().addSeatGender({ row: 1, col: 1, allowedGender: 'male' })
    useStore.getState().addSeatGender({ row: 2, col: 2, allowedGender: 'female' })
    useStore.getState().removeSeatGender({ row: 1, col: 1 })
    const sgc = useStore.getState().seatGenderConstraints
    expect(sgc).toHaveLength(1)
    expect(sgc[0]).toEqual({ row: 2, col: 2, allowedGender: 'female' })
  })

  it('clearSeatGender で全制約が削除される', () => {
    useStore.getState().addSeatGender({ row: 1, col: 1, allowedGender: 'male' })
    useStore.getState().addSeatGender({ row: 2, col: 2, allowedGender: 'female' })
    useStore.getState().clearSeatGender()
    expect(useStore.getState().seatGenderConstraints).toHaveLength(0)
  })

  it('addSeatGender で求解結果がクリアされる', () => {
    useStore.setState({ solveResult: DUMMY_SOLVE_RESULT, adoptedAssignments: DUMMY_ASSIGNMENTS, adjustingAssignments: DUMMY_ASSIGNMENTS, finalizedAssignments: DUMMY_ASSIGNMENTS })
    useStore.getState().addSeatGender({ row: 1, col: 1, allowedGender: 'male' })
    expect(useStore.getState().solveResult).toBeNull()
    expect(useStore.getState().adoptedAssignments).toBeNull()
    expect(useStore.getState().adjustingAssignments).toBeNull()
    expect(useStore.getState().finalizedAssignments).toBeNull()
  })
})

describe('relativeFixedConstraints アクション', () => {
  it('setRelativeFixed で隣接固定制約が追加される', () => {
    const constraints = [{ studentIdA: 1, studentIdB: 2, dRow: 0 as const, dCol: 1 as const }]
    useStore.getState().setRelativeFixed(1, constraints)
    expect(useStore.getState().relativeFixedConstraints).toEqual(constraints)
  })

  it('setRelativeFixed で同じ studentIdA の制約が上書きされる', () => {
    useStore.getState().setRelativeFixed(1, [{ studentIdA: 1, studentIdB: 2, dRow: 0 as const, dCol: 1 as const }])
    useStore.getState().setRelativeFixed(1, [{ studentIdA: 1, studentIdB: 3, dRow: 1 as const, dCol: 0 as const }])
    const rfc = useStore.getState().relativeFixedConstraints
    expect(rfc).toHaveLength(1)
    expect(rfc[0].studentIdB).toBe(3)
  })

  it('removeRelativeFixedGroup で指定学生グループの制約が削除される', () => {
    useStore.getState().setRelativeFixed(1, [{ studentIdA: 1, studentIdB: 2, dRow: 0 as const, dCol: 1 as const }])
    useStore.getState().setRelativeFixed(3, [{ studentIdA: 3, studentIdB: 4, dRow: 0 as const, dCol: 1 as const }])
    useStore.getState().removeRelativeFixedGroup(1)
    const rfc = useStore.getState().relativeFixedConstraints
    expect(rfc).toHaveLength(1)
    expect(rfc[0].studentIdA).toBe(3)
  })

  it('clearRelativeFixed で全制約が削除される', () => {
    useStore.getState().setRelativeFixed(1, [{ studentIdA: 1, studentIdB: 2, dRow: 0 as const, dCol: 1 as const }])
    useStore.getState().clearRelativeFixed()
    expect(useStore.getState().relativeFixedConstraints).toHaveLength(0)
  })

  it('setRelativeFixed で求解結果がクリアされる', () => {
    useStore.setState({ solveResult: DUMMY_SOLVE_RESULT, adoptedAssignments: DUMMY_ASSIGNMENTS, adjustingAssignments: DUMMY_ASSIGNMENTS, finalizedAssignments: DUMMY_ASSIGNMENTS })
    useStore.getState().setRelativeFixed(1, [{ studentIdA: 1, studentIdB: 2, dRow: 0 as const, dCol: 1 as const }])
    expect(useStore.getState().solveResult).toBeNull()
    expect(useStore.getState().adoptedAssignments).toBeNull()
    expect(useStore.getState().adjustingAssignments).toBeNull()
    expect(useStore.getState().finalizedAssignments).toBeNull()
  })
})

describe('setPrevAssign アクション', () => {
  it('setPrevAssign で前回座席データが設定される', () => {
    const prev = [{ student_id: 1, row: 1, col: 2 }]
    useStore.getState().setPrevAssign(prev)
    expect(useStore.getState().prevAssign).toEqual(prev)
  })

  it('setPrevAssign で求解結果がクリアされる', () => {
    useStore.setState({ solveResult: DUMMY_SOLVE_RESULT, adoptedAssignments: DUMMY_ASSIGNMENTS, adjustingAssignments: DUMMY_ASSIGNMENTS, finalizedAssignments: DUMMY_ASSIGNMENTS })
    useStore.getState().setPrevAssign([{ student_id: 1, row: 1, col: 2 }])
    expect(useStore.getState().solveResult).toBeNull()
    expect(useStore.getState().adoptedAssignments).toBeNull()
    expect(useStore.getState().adjustingAssignments).toBeNull()
    expect(useStore.getState().finalizedAssignments).toBeNull()
  })
})

describe('setForbiddenForStudent / removeForbiddenGroup アクション', () => {
  it('setForbiddenForStudent で学生の禁止制約を一括設定する', () => {
    const constraints = [{ studentIdA: 1, studentIdB: 2, type: 'adjacent8' as const }]
    useStore.getState().setForbiddenForStudent(1, constraints)
    expect(useStore.getState().forbiddenConstraints).toEqual(constraints)
  })

  it('setForbiddenForStudent で同じ studentIdA の制約を上書きする', () => {
    useStore.getState().setForbiddenForStudent(1, [{ studentIdA: 1, studentIdB: 2, type: 'adjacent8' as const }])
    useStore.getState().setForbiddenForStudent(1, [{ studentIdA: 1, studentIdB: 3, type: 'same_group' as const }])
    const fc = useStore.getState().forbiddenConstraints
    expect(fc).toHaveLength(1)
    expect(fc[0].studentIdB).toBe(3)
  })

  it('removeForbiddenGroup で学生の全禁止制約を削除する', () => {
    useStore.getState().setForbiddenForStudent(1, [{ studentIdA: 1, studentIdB: 2, type: 'adjacent8' as const }])
    useStore.getState().addForbidden({ studentIdA: 3, studentIdB: 4, type: 'adjacent8' })
    useStore.getState().removeForbiddenGroup(1)
    const fc = useStore.getState().forbiddenConstraints
    expect(fc).toHaveLength(1)
    expect(fc[0].studentIdA).toBe(3)
  })

  it('setForbiddenForStudent で求解結果がクリアされる', () => {
    useStore.setState({ solveResult: DUMMY_SOLVE_RESULT, adoptedAssignments: DUMMY_ASSIGNMENTS, adjustingAssignments: DUMMY_ASSIGNMENTS, finalizedAssignments: DUMMY_ASSIGNMENTS })
    useStore.getState().setForbiddenForStudent(1, [{ studentIdA: 1, studentIdB: 2, type: 'adjacent8' as const }])
    expect(useStore.getState().solveResult).toBeNull()
    expect(useStore.getState().adoptedAssignments).toBeNull()
    expect(useStore.getState().adjustingAssignments).toBeNull()
    expect(useStore.getState().finalizedAssignments).toBeNull()
  })
})

describe('clearConstraints アクション', () => {
  it('clearConstraints で固定制約と隣接禁止制約を一括削除する', () => {
    useStore.getState().addFixed({ studentId: 1, row: 1, col: 3 })
    useStore.getState().addForbidden({ studentIdA: 1, studentIdB: 2, type: 'adjacent8' })
    useStore.getState().clearConstraints()
    expect(useStore.getState().fixedConstraints).toHaveLength(0)
    expect(useStore.getState().forbiddenConstraints).toHaveLength(0)
  })

  it('clearConstraints で求解結果がクリアされる', () => {
    useStore.setState({ solveResult: DUMMY_SOLVE_RESULT, adoptedAssignments: DUMMY_ASSIGNMENTS, adjustingAssignments: DUMMY_ASSIGNMENTS, finalizedAssignments: DUMMY_ASSIGNMENTS })
    useStore.getState().clearConstraints()
    expect(useStore.getState().solveResult).toBeNull()
    expect(useStore.getState().adoptedAssignments).toBeNull()
    expect(useStore.getState().adjustingAssignments).toBeNull()
    expect(useStore.getState().finalizedAssignments).toBeNull()
  })
})

describe('updateConstraintToggle アクション', () => {
  it('updateConstraintToggle でトグル状態が更新される', () => {
    useStore.getState().updateConstraintToggle('differ_seat', true)
    expect(useStore.getState().constraintToggles.differ_seat).toBe(true)
    expect(useStore.getState().constraintToggles.gender_balance).toBe(true) // 変わらない
  })

  it('updateConstraintToggle で求解結果がクリアされる', () => {
    useStore.setState({ solveResult: DUMMY_SOLVE_RESULT, adoptedAssignments: DUMMY_ASSIGNMENTS, adjustingAssignments: DUMMY_ASSIGNMENTS, finalizedAssignments: DUMMY_ASSIGNMENTS })
    useStore.getState().updateConstraintToggle('loneliness', false)
    expect(useStore.getState().solveResult).toBeNull()
    expect(useStore.getState().adoptedAssignments).toBeNull()
    expect(useStore.getState().adjustingAssignments).toBeNull()
    expect(useStore.getState().finalizedAssignments).toBeNull()
  })
})

describe('adjustingAssignments アクション', () => {
  it('setAdjustingAssignments で値が設定される', () => {
    const assignments = [{ student_id: 1, seat_id: 1 }]
    useStore.getState().setAdjustingAssignments(assignments)
    expect(useStore.getState().adjustingAssignments).toEqual(assignments)
  })

  it('setAdjustingAssignments(null) でクリアされる', () => {
    useStore.setState({ adjustingAssignments: [{ student_id: 1, seat_id: 1 }] })
    useStore.getState().setAdjustingAssignments(null)
    expect(useStore.getState().adjustingAssignments).toBeNull()
  })
})

describe('adoptSolution / setAdoptedAssignments アクション', () => {
  it('adoptSolution で配置が adoptedAssignments に保存される', () => {
    const assignments = [{ student_id: 1, seat_id: 2 }]
    useStore.getState().adoptSolution(assignments)
    expect(useStore.getState().adoptedAssignments).toEqual(assignments)
  })

  it('setAdoptedAssignments で配置が設定される', () => {
    const assignments = [{ student_id: 2, seat_id: 3 }]
    useStore.getState().setAdoptedAssignments(assignments)
    expect(useStore.getState().adoptedAssignments).toEqual(assignments)
  })

  it('setAdoptedAssignments(null) でリセットされる', () => {
    useStore.getState().setAdoptedAssignments([{ student_id: 1, seat_id: 1 }])
    useStore.getState().setAdoptedAssignments(null)
    expect(useStore.getState().adoptedAssignments).toBeNull()
  })
})

describe('resetAll アクション', () => {
  it('resetAll で全データが初期値にリセットされる', () => {
    useStore.getState().addStudent({ id: 1, name: '山田', gender: 'male', tags: [] })
    useStore.getState().addFixed({ studentId: 1, row: 1, col: 3 })
    useStore.setState({ solveResult: DUMMY_SOLVE_RESULT, adoptedAssignments: DUMMY_ASSIGNMENTS })
    useStore.getState().resetAll()
    const state = useStore.getState()
    expect(state.students).toHaveLength(0)
    expect(state.fixedConstraints).toHaveLength(0)
    expect(state.solveResult).toBeNull()
    expect(state.adoptedAssignments).toBeNull()
    expect(state.seat.numRows).toBe(2)
  })
})

describe('removeStudent カスケード削除', () => {
  it('removeStudent で関連する relativeFixedConstraints も削除される', () => {
    useStore.getState().addStudent({ id: 1, name: '山田', gender: 'male', tags: [] })
    useStore.getState().addStudent({ id: 2, name: '鈴木', gender: 'female', tags: [] })
    useStore.getState().setRelativeFixed(1, [{ studentIdA: 1, studentIdB: 2, dRow: 0 as const, dCol: 1 as const }])
    useStore.getState().removeStudent(1)
    expect(useStore.getState().relativeFixedConstraints).toHaveLength(0)
  })
})

describe('leaderGroups アクション', () => {
  const testGroup = { id: 'group-1', name: '班長', studentIds: [1, 2, 3] }

  it('addLeaderGroup でグループが追加される', () => {
    useStore.getState().addLeaderGroup(testGroup)
    expect(useStore.getState().leaderGroups).toHaveLength(1)
    expect(useStore.getState().leaderGroups[0]).toEqual(testGroup)
  })

  it('removeLeaderGroup で指定IDのグループが削除される', () => {
    useStore.getState().addLeaderGroup(testGroup)
    useStore.getState().addLeaderGroup({ id: 'group-2', name: '書記', studentIds: [4, 5] })
    useStore.getState().removeLeaderGroup('group-1')
    const lgs = useStore.getState().leaderGroups
    expect(lgs).toHaveLength(1)
    expect(lgs[0].id).toBe('group-2')
  })

  it('updateLeaderGroup でグループ名と児童・生徒リストを更新できる', () => {
    useStore.getState().addLeaderGroup(testGroup)
    useStore.getState().updateLeaderGroup('group-1', { name: '班長（更新）', studentIds: [1, 2] })
    const lg = useStore.getState().leaderGroups[0]
    expect(lg.name).toBe('班長（更新）')
    expect(lg.studentIds).toEqual([1, 2])
    expect(lg.id).toBe('group-1') // id は変わらない
  })

  it('addLeaderGroup で求解結果がクリアされる', () => {
    useStore.setState({ solveResult: DUMMY_SOLVE_RESULT, adoptedAssignments: DUMMY_ASSIGNMENTS, adjustingAssignments: DUMMY_ASSIGNMENTS, finalizedAssignments: DUMMY_ASSIGNMENTS })
    useStore.getState().addLeaderGroup(testGroup)
    expect(useStore.getState().solveResult).toBeNull()
    expect(useStore.getState().adoptedAssignments).toBeNull()
  })

  it('removeStudent でグループから該当児童・生徒が除去され、2人未満になったグループは削除される', () => {
    useStore.getState().addStudent({ id: 1, name: '山田', gender: 'male', tags: [] })
    useStore.getState().addStudent({ id: 2, name: '鈴木', gender: 'female', tags: [] })
    useStore.getState().addLeaderGroup({ id: 'group-1', name: '班長', studentIds: [1, 2] })
    // 児童・生徒1を削除 → グループの studentIds が [2] になり、2人未満のため削除される
    useStore.getState().removeStudent(1)
    expect(useStore.getState().leaderGroups).toHaveLength(0)
  })

  it('removeStudent で3人グループから1人削除すると2人グループが残る', () => {
    useStore.getState().addStudent({ id: 1, name: '山田', gender: 'male', tags: [] })
    useStore.getState().addStudent({ id: 2, name: '鈴木', gender: 'female', tags: [] })
    useStore.getState().addStudent({ id: 3, name: '田中', gender: 'male', tags: [] })
    useStore.getState().addLeaderGroup({ id: 'group-1', name: '班長', studentIds: [1, 2, 3] })
    useStore.getState().removeStudent(1)
    const lgs = useStore.getState().leaderGroups
    expect(lgs).toHaveLength(1)
    expect(lgs[0].studentIds).toEqual([2, 3])
  })
})

describe('dataModal アクション', () => {
  it('初期状態では dataModalOpen が false', () => {
    expect(useStore.getState().dataModalOpen).toBe(false)
  })

  it('openDataModal("export") でフラグが true になりタブが "export" になる', () => {
    useStore.getState().openDataModal('export')
    expect(useStore.getState().dataModalOpen).toBe(true)
    expect(useStore.getState().dataModalTab).toBe('export')
  })

  it('openDataModal("import") でタブが "import" になる', () => {
    useStore.getState().openDataModal('import')
    expect(useStore.getState().dataModalOpen).toBe(true)
    expect(useStore.getState().dataModalTab).toBe('import')
  })

  it('closeDataModal で dataModalOpen が false に戻る', () => {
    useStore.getState().openDataModal('reset')
    useStore.getState().closeDataModal()
    expect(useStore.getState().dataModalOpen).toBe(false)
  })
})
