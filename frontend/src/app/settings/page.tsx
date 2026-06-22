'use client'

import { useState, useEffect, useId } from 'react'
import { createPortal } from 'react-dom'
import { Pin, Mars, Venus, TriangleAlert, OctagonAlert, Pencil, Trash2, Check } from 'lucide-react'
import { useStore } from '@/lib/store'
import { useHasHydrated } from '@/hooks/useHasHydrated'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { generateSeats } from '@/lib/seats'
import { getGroupStyle } from '@/lib/groupColors'
import { detectGenderFixedConflicts, detectRelativeFixedForbiddenConflicts, detectFixedSeatConflicts, detectFixedForbiddenConflicts, detectFixedRelativeConflicts, detectFixedSameGroupConflicts } from '@/lib/constraints'
import { FORBID_TYPE_LABELS, CONSTRAINT_DEFS } from '@/lib/constraintLabels'
import SeatGrid from '@/components/SeatGrid'
import GridScrollArea from '@/components/GridScrollArea'
import HelpPanel from '@/components/HelpPanel'
import PageHeader from '@/components/PageHeader'
import NextStepBar from '@/components/NextStepBar'
import Modal from '@/components/Modal'
import ConfirmButton from '@/components/ConfirmButton'
import { NumberStepper } from '@/components/NumberStepper'
import type { ForbiddenConstraint, RelativeFixedConstraint, LeaderGroup } from '@/types'

type SeatTab = 'grid' | 'gender' | 'constraints' | 'leader_groups' | 'prev_seat' | 'options'

/** 性別配置セルの状態を読み上げ用ラベルにする */
function isMaleSelectedLabel(allowed?: 'male' | 'female'): string {
  return allowed === 'male' ? '男性のみ' : allowed === 'female' ? '女性のみ' : '指定なし'
}

/**
 * 全削除ボタン。共通の2段階クリック確認ボタン {@link ConfirmButton} に「全削除」/「本当に削除？」の
 * 体裁を与えたプリセット。誤操作防止のため1回目で確認表示に変わり、2回目で実行する。
 */
function ClearAllButton({ onClear, disabled }: { onClear: () => void; disabled?: boolean }) {
  return (
    <ConfirmButton
      onConfirm={onClear}
      disabled={disabled}
      confirmChildren="本当に削除？"
      className="btn btn-sm"
      idleClassName="btn-danger"
      confirmClassName="bg-error text-white hover:bg-error-strong"
    >
      全削除
    </ConfirmButton>
  )
}

/**
 * カード見出し行。右上のアクションは -my-1 でボタン高さ（32px）を行高さに反映させず、
 * アクションの有無にかかわらず見出しの縦位置が揃うようにする
 */
function CardHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <h3 className="font-semibold text-slate-700">{title}</h3>
      {action && <div className="flex items-center gap-2 -my-1 shrink-0">{action}</div>}
    </div>
  )
}

/** クリック可能なグリッドセルをキーボード（Enter/Space）でも操作できるようにする共通 props */
function cellButtonProps(onActivate: () => void, label?: string) {
  return {
    role: 'button' as const,
    tabIndex: 0,
    'aria-label': label,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        onActivate()
      }
    },
  }
}

export default function SettingsPage() {
  const {
    students,
    seat,
    groups,
    fixedConstraints,
    forbiddenConstraints,
    seatGenderConstraints,
    relativeFixedConstraints,
    leaderGroups,
    prevAssign,
    setPrevAssign,
    constraintToggles,
    updateConstraintToggle,
    updateSeat,
    setGroups,
    addFixed,
    removeFixed,
    addForbidden,
    removeForbiddenGroupByType,
    replaceForbiddenGroup,
    clearFixed,
    clearForbidden,
    toggleEmptySeat,
    addSeatGender,
    removeSeatGender,
    clearSeatGender,
    setRelativeFixed,
    removeRelativeFixedGroup,
    clearRelativeFixed,
    addLeaderGroup,
    removeLeaderGroup,
    updateLeaderGroup,
    seatMaxRows,
    seatMaxCols,
  } = useStore()

  const hydrated = useHasHydrated()
  // sm 未満は制約テーブルが収まらないためカード表示に切り替える（Tailwind の sm = 640px）
  const isWide = useMediaQuery('(min-width: 640px)')

  const { numRows, numCols, frontRowCount, backRowCount, emptySeats, numGroups } = seat
  const seats = generateSeats(numRows, numCols)

  const genderFixedConflicts = detectGenderFixedConflicts(
    seatGenderConstraints, fixedConstraints, students
  )
  const rfFbConflicts = detectRelativeFixedForbiddenConflicts(
    forbiddenConstraints, relativeFixedConstraints
  )
  const fixedSeatConflicts = detectFixedSeatConflicts(fixedConstraints)
  const fixedForbiddenConflicts = detectFixedForbiddenConflicts(fixedConstraints, forbiddenConstraints)
  const fixedRelativeConflicts = detectFixedRelativeConflicts(fixedConstraints, relativeFixedConstraints)
  const fixedSameGroupConflicts = detectFixedSameGroupConflicts(fixedConstraints, forbiddenConstraints, groups, numGroups)

  const [activeTab, setActiveTab] = useState<SeatTab>('grid')

  // 班割り当て UI: 選択中の班 id（-1 = 空席モード、null = 未選択）
  const [activeGroupId, setActiveGroupId] = useState<number | null>(null)

  // numGroups 以下の班のみ表示・送信に使用
  const activeGroups = groups.filter((g) => g.groupId <= numGroups)

  // 固定制約グリッドUI: 編集中の座席ID
  const [editSeatId, setEditSeatId] = useState<number | null>(null)

  // 前回座席グリッドUI: 編集中の座席座標（"row,col" 形式）
  const [editPrevSeatCoord, setEditPrevSeatCoord] = useState<string | null>(null)

  // 性別配置制約: 現在のモード
  const [activeGenderMode, setActiveGenderMode] = useState<'male' | 'female' | null>(null)

  // 隣接禁止ダイアログ（追加）
  const [fbDialogOpen, setFbDialogOpen] = useState(false)
  const [fbAnchorId, setFbAnchorId] = useState<number | null>(null)
  const [fbDialogTypes, setFbDialogTypes] = useState<('adjacent8' | 'same_group')[]>([])
  const [fbDialogBList, setFbDialogBList] = useState<number[]>([])
  const [fbAddA, setFbAddA] = useState('')
  // 隣接禁止ダイアログ（グループ編集）
  const [fbEditDialogOpen, setFbEditDialogOpen] = useState(false)
  const [fbEditAnchorId, setFbEditAnchorId] = useState<number | null>(null)
  const [fbEditOriginalType, setFbEditOriginalType] = useState<'adjacent8' | 'same_group'>('adjacent8')
  const [fbEditType, setFbEditType] = useState<'adjacent8' | 'same_group'>('adjacent8')
  const [fbEditBList, setFbEditBList] = useState<number[]>([])

  // 隣接固定制約（相対的固定制約）ダイアログ
  const [rfDialogOpen, setRfDialogOpen] = useState(false)
  const [rfAnchorId, setRfAnchorId] = useState<number | null>(null)
  const [rfGrid, setRfGrid] = useState<Record<string, number | null>>({})
  const [rfEditCell, setRfEditCell] = useState<string | null>(null)
  const [rfAddA, setRfAddA] = useState('')

  function handleSeatClick(seatId: number) {
    const seat = seats.find((s) => s.id === seatId)
    if (!seat) return
    const coord = { row: seat.row, col: seat.col }

    // 空席モード
    if (activeGroupId === -1) {
      if (!emptySeats.some((c) => c.row === seat.row && c.col === seat.col)) {
        // 空席化する場合: 全班から座標を除去
        setGroups(
          groups.map((g) => ({
            ...g,
            seatCoords: g.seatCoords.filter(
              (c) => !(c.row === coord.row && c.col === coord.col),
            ),
          })),
        )
      }
      toggleEmptySeat({ row: seat.row, col: seat.col })
      return
    }
    if (activeGroupId === null) return

    // 班割り当てモード: 空席には割り当て不可
    if (emptySeats.some((c) => c.row === seat.row && c.col === seat.col)) return

    // 班割り当てモード
    const existing = groups.find((g) => g.groupId === activeGroupId)
    if (existing) {
      const already = existing.seatCoords.some(
        (c) => c.row === coord.row && c.col === coord.col,
      )
      if (already) {
        // 削除
        setGroups(
          groups.map((g) =>
            g.groupId === activeGroupId
              ? {
                ...g,
                seatCoords: g.seatCoords.filter(
                  (c) => !(c.row === coord.row && c.col === coord.col),
                ),
              }
              : g,
          ),
        )
      } else {
        // 追加（他の班から外す）
        setGroups(
          groups
            .map((g) => ({
              ...g,
              seatCoords: g.seatCoords.filter(
                (c) => !(c.row === coord.row && c.col === coord.col),
              ),
            }))
            .map((g) =>
              g.groupId === activeGroupId
                ? { ...g, seatCoords: [...g.seatCoords, coord] }
                : g,
            ),
        )
      }
    } else {
      // 新規班
      setGroups([...groups, { groupId: activeGroupId, seatCoords: [coord] }])
    }
  }

  // 班数変更: groups は変更しない（numGroups で表示範囲を制御）
  function handleNumGroupsChange(n: number) {
    updateSeat({ numGroups: n })
    if (activeGroupId !== null && activeGroupId !== -1 && activeGroupId > n) {
      setActiveGroupId(null)
    }
  }

  // 隣接禁止: 追加ダイアログを開く（常に空の状態で開く）
  function handleOpenFbDialog(studentIdA: number) {
    setFbAnchorId(studentIdA)
    setFbDialogTypes([])
    setFbDialogBList([])
    setFbDialogOpen(true)
  }

  // 隣接禁止: 確定（追加ダイアログ — 既存レコードには影響しない）
  function handleConfirmFbDialog() {
    if (!fbAnchorId || fbDialogBList.length === 0 || fbDialogTypes.length === 0) return
    for (const t of fbDialogTypes) {
      for (const b of fbDialogBList) {
        addForbidden({ studentIdA: fbAnchorId, studentIdB: b, type: t })
      }
    }
    setFbDialogOpen(false)
    setFbAddA('')
  }

  // 隣接禁止: (A, type) グループ編集ダイアログを開く
  function handleOpenFbEditGroupDialog(studentIdA: number, type: 'adjacent8' | 'same_group') {
    setFbEditAnchorId(studentIdA)
    setFbEditOriginalType(type)
    setFbEditType(type)
    const bIds = forbiddenConstraints
      .filter((f) => f.studentIdA === studentIdA && f.type === type)
      .map((f) => f.studentIdB)
    setFbEditBList(bIds)
    setFbEditDialogOpen(true)
  }

  // 隣接禁止: グループ編集確定
  function handleConfirmFbEditGroup() {
    if (!fbEditAnchorId || fbEditBList.length === 0) return
    replaceForbiddenGroup(
      fbEditAnchorId,
      fbEditOriginalType,
      fbEditBList.map((b) => ({ studentIdA: fbEditAnchorId, studentIdB: b, type: fbEditType })),
    )
    setFbEditDialogOpen(false)
  }

  // 隣接禁止: (studentIdA, type) でグループ化して表示用リストを生成
  type FbDisplayGroup = { studentIdA: number; type: 'adjacent8' | 'same_group'; bIds: number[] }
  const fbDisplayGroups = (() => {
    const map = new Map<string, FbDisplayGroup>()
    for (const c of forbiddenConstraints) {
      const key = `${c.studentIdA}__${c.type}`
      if (!map.has(key)) map.set(key, { studentIdA: c.studentIdA, type: c.type, bIds: [] })
      map.get(key)!.bIds.push(c.studentIdB)
    }
    return Array.from(map.values())
  })()

  // 隣接固定: ダイアログを開く（既存制約があればロード）
  function handleOpenRfDialog(studentIdA: number) {
    setRfAnchorId(studentIdA)
    const existing = relativeFixedConstraints.filter((c) => c.studentIdA === studentIdA)
    if (existing.length > 0) {
      const grid: Record<string, number | null> = {}
      existing.forEach((c) => { grid[`${c.dRow},${c.dCol}`] = c.studentIdB })
      setRfGrid(grid)
    } else {
      setRfGrid({})
    }
    setRfEditCell(null)
    setRfDialogOpen(true)
  }

  // 隣接固定: 確定
  function handleConfirmRfDialog() {
    if (!rfAnchorId) return
    const constraints: RelativeFixedConstraint[] = Object.entries(rfGrid)
      .filter(([, sid]) => sid != null)
      .map(([key, sid]) => {
        const [dRow, dCol] = key.split(',').map(Number) as [-1 | 0 | 1, -1 | 0 | 1]
        return { studentIdA: rfAnchorId, studentIdB: sid!, dRow, dCol }
      })
    setRelativeFixed(rfAnchorId, constraints)
    setRfDialogOpen(false)
    setRfAddA('')
  }

  // 隣接固定: グリッドのオフセット配列（row, col）
  const RF_OFFSETS: [number, number][] = [
    [-1, -1], [-1, 0], [-1, 1],
    [0, -1], [0, 0], [0, 1],
    [1, -1], [1, 0], [1, 1],
  ]

  // 隣接固定: studentIdA ごとにグループ化
  const rfGroups = Array.from(
    relativeFixedConstraints.reduce((map, c) => {
      if (!map.has(c.studentIdA)) map.set(c.studentIdA, [])
      map.get(c.studentIdA)!.push(c)
      return map
    }, new Map<number, RelativeFixedConstraint[]>()),
  )

  const sortedStudents = students.slice()

  // 名簿管理ページの「番号」（配列の並び順 = index+1）を id から引けるマップ
  // UI表示専用。制約の参照は引き続き s.id を使う
  const studentDisplayNum = new Map<number, number>(students.map((s, i) => [s.id, i + 1]))

  // 班分散グループ: ダイアログ状態
  const [lgDialogOpen, setLgDialogOpen] = useState(false)
  const [lgEditId, setLgEditId] = useState<string | null>(null) // null = 新規追加
  const [lgName, setLgName] = useState('')
  const [lgSelectedIds, setLgSelectedIds] = useState<number[]>([])
  const [lgShowLabel, setLgShowLabel] = useState(true)
  const lgUniqueId = useId()

  function handleOpenLgDialog(group?: LeaderGroup) {
    if (group) {
      setLgEditId(group.id)
      setLgName(group.name)
      setLgSelectedIds([...group.studentIds])
      setLgShowLabel(group.showLabel ?? true)
    } else {
      setLgEditId(null)
      setLgName('')
      setLgSelectedIds([])
      setLgShowLabel(true)
    }
    setLgDialogOpen(true)
  }

  function handleConfirmLgDialog() {
    if (!lgName.trim() || lgSelectedIds.length < 2) return
    if (lgEditId) {
      updateLeaderGroup(lgEditId, { name: lgName.trim(), studentIds: lgSelectedIds, showLabel: lgShowLabel })
    } else {
      const newId = `${lgUniqueId}-${Date.now()}`
      addLeaderGroup({ id: newId, name: lgName.trim(), studentIds: lgSelectedIds, showLabel: lgShowLabel })
    }
    setLgDialogOpen(false)
  }

  function toggleLgStudent(id: number) {
    setLgSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id],
    )
  }

  // localStorage からのデータ復元が終わるまで描画しない（リロード直後に未設定状態が一瞬見えるのを防ぐ）
  if (!hydrated) return null

  return (
    <div className="flex flex-col gap-6 xl:flex-row xl:gap-8 xl:items-start">
      <div className="flex-1 min-w-0 space-y-6 md:space-y-8 xl:min-h-[600px]">
        <PageHeader
          step="/settings"
          lead="座席数・班レイアウトや希望の条件を設定してください。"
        />
        <div role="status" className="bg-warning-soft border border-warning rounded-lg px-4 py-3 text-sm text-warning-strong">
          <div className="flex items-center gap-2">
            <TriangleAlert size={16} className="shrink-0" />
            <span>設定を変更すると既存の席配置データは削除されます。</span>
          </div>
        </div>
        {/* タブナビゲーション: モバイルは折り返さず横スクロールの1行ストリップにする */}
        <div className="flex flex-nowrap overflow-x-auto border-b border-line [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {([
            ['grid', '座席・班設定'],
            ['gender', '性別配置設定'],
            ['constraints', '固定・隣接設定'],
            ['leader_groups', '班分散グループ'],
            ['prev_seat', '前回座席'],
            ['options', '最適化オプション'],
          ] as [SeatTab, string][]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              aria-current={activeTab === key ? true : undefined}
              className={`shrink-0 whitespace-nowrap py-2 px-3 md:px-4 text-xs md:text-sm border-b-2 -mb-px transition-colors ${activeTab === key
                ? 'border-primary text-primary font-bold'
                : 'border-transparent text-ink-muted font-medium hover:text-ink'
                }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* グリッド・班設定 */}
        {activeTab === 'grid' && <>
          <section className="card p-4 md:p-6 space-y-4">
            <CardHeader title="座席設定" />
            {/* lg 以上は「グリッド数 | 配慮エリア」の2カラム、それ未満は縦積み。
                ラベルを固定幅にして各カラム内でステッパーの水平位置を揃える */}
            <div className="flex flex-col gap-3 text-sm lg:flex-row lg:gap-6">
              <div className="space-y-3">
                <label className="flex items-center gap-3">
                  <span className="w-24 shrink-0">行数（前後）</span>
                  <NumberStepper
                    value={numRows}
                    min={1}
                    max={seatMaxRows}
                    onChange={(v) => updateSeat({ numRows: v })}
                  />
                </label>
                <label className="flex items-center gap-3">
                  <span className="w-24 shrink-0">列数（左右）</span>
                  <NumberStepper
                    value={numCols}
                    min={1}
                    max={seatMaxCols}
                    onChange={(v) => updateSeat({ numCols: v })}
                  />
                </label>
              </div>
              {/* 区切り線: 縦積み時は水平線、2カラム時は垂直線 */}
              <div className="border-t border-line-soft lg:border-t-0 lg:border-l" />
              <div className="space-y-3">
                <label className="flex items-center gap-3">
                  <span className="w-16 shrink-0">前から</span>
                  <NumberStepper
                    value={frontRowCount}
                    min={0}
                    max={numRows}
                    onChange={(v) => updateSeat({ frontRowCount: v })}
                  />
                  <span>行を前側配慮エリアにする</span>
                </label>
                <label className="flex items-center gap-3">
                  <span className="w-16 shrink-0">後ろから</span>
                  <NumberStepper
                    value={backRowCount}
                    min={0}
                    max={numRows}
                    onChange={(v) => updateSeat({ backRowCount: v })}
                  />
                  <span>行を後側配慮エリアにする</span>
                </label>
              </div>
            </div>
          </section>

          {/* 班設定（空席指定を統合） */}
          <section className="card p-4 md:p-6 space-y-4">
            <CardHeader
              title="班設定"
              action={
                <ClearAllButton
                  onClear={() => { setGroups([]); updateSeat({ emptySeats: [] }) }}
                  disabled={groups.length === 0 && emptySeats.length === 0}
                />
              }
            />
            <div className="space-y-2">
              <div className="flex items-center gap-4 text-sm flex-wrap">
                <label className="flex items-center gap-2">
                  班数:
                  <NumberStepper
                    value={numGroups}
                    min={1}
                    max={10}
                    onChange={(v) => handleNumGroupsChange(v)}
                  />
                </label>
                {/* ボタン列 */}
                <div className="flex gap-2 flex-wrap">
                  {Array.from({ length: numGroups }, (_, i) => i + 1).map((gid) => {
                    const isActive = activeGroupId === gid
                    // 選択中は座席セルと同じ班色を適用し、塗られる色をボタンで予告する
                    const gs = getGroupStyle(gid)
                    return (
                      <button
                        key={gid}
                        onClick={() => setActiveGroupId(gid === activeGroupId ? null : gid)}
                        style={isActive
                          ? {
                            backgroundColor: gs.backgroundColor,
                            borderColor: gs.borderColor,
                            color: gs.color,
                            // 枠線を実質2pxにして選択状態を強調する（レイアウトは動かさない）
                            boxShadow: `inset 0 0 0 1px ${gs.borderColor}`,
                          }
                          : undefined}
                        className={`px-3 py-1 rounded border text-xs font-medium transition-colors ${isActive
                          ? ''
                          : 'border-slate-300 text-slate-600 hover:bg-slate-50'
                          }`}
                      >
                        班 {gid}
                      </button>
                    )
                  })}
                  {/* 空席ボタン */}
                  <button
                    onClick={() => setActiveGroupId(activeGroupId === -1 ? null : -1)}
                    className={`px-3 py-1 rounded border text-xs font-medium transition-colors ${activeGroupId === -1
                      ? 'bg-slate-500 border-slate-500 text-white'
                      : 'border-slate-300 text-slate-500 hover:bg-slate-100'
                      }`}
                  >
                    空席
                  </button>
                </div>
              </div>
              {/* 案内テキスト（固定高さ） */}
              <div className="min-h-6 text-sm text-slate-500">
                {activeGroupId !== null && (
                  <span>
                    {activeGroupId === -1
                      ? '→ 座席をクリックして空席に設定（もう一度で解除）'
                      : `→ 座席をクリックして班 ${activeGroupId} に割り当て`}
                  </span>
                )}
              </div>
            </div>
            <SeatGrid
              numRows={numRows}
              numCols={numCols}
              frontRowCount={frontRowCount}
              backRowCount={backRowCount}
              onSeatClick={activeGroupId !== null ? handleSeatClick : undefined}
              seatLabels={new Map(seats.map((s) => {
                const g = activeGroups.find((gr) =>
                  gr.seatCoords.some((c) => c.row === s.row && c.col === s.col),
                )
                return [s.id, g ? `班${g.groupId}` : '']
              }))}
              groups={activeGroups}
              emptySeats={emptySeats}
            />
          </section>

        </>}

        {/* 性別配置制約 */}
        {activeTab === 'gender' && <section className="card p-4 md:p-6 space-y-4">
          <CardHeader
            title="性別配置設定"
            action={
              <ClearAllButton
                onClear={clearSeatGender}
                disabled={seatGenderConstraints.length === 0}
              />
            }
          />
          <p className="text-sm text-slate-500">
            {CONSTRAINT_DEFS.gender_constraint.settingDescription}
          </p>
          {/* モードボタン */}
          <div className="flex items-center gap-2 flex-wrap text-sm">
            <button
              onClick={() => setActiveGenderMode(activeGenderMode === 'male' ? null : 'male')}
              className={`px-3 py-1 rounded border text-xs font-medium transition-colors ${activeGenderMode === 'male'
                ? 'bg-blue-600 border-blue-600 text-white'
                : 'border-blue-300 text-blue-600 hover:bg-blue-50'
                }`}
            >
              <Mars size={14} className="mr-1 inline" />男性のみ
            </button>
            <button
              onClick={() => setActiveGenderMode(activeGenderMode === 'female' ? null : 'female')}
              className={`px-3 py-1 rounded border text-xs font-medium transition-colors ${activeGenderMode === 'female'
                ? 'bg-pink-600 border-pink-600 text-white'
                : 'border-pink-300 text-pink-600 hover:bg-pink-50'
                }`}
            >
              <Venus size={14} className="mr-1 inline" />女性のみ
            </button>
          </div>
          {/* 案内テキスト */}
          <div className="min-h-5 text-sm text-slate-500">
            {activeGenderMode !== null && (
              <span>
                → 座席をクリックして{activeGenderMode === 'male' ? '男性のみ' : '女性のみ'}に設定（同じ座席を再クリックで解除）
              </span>
            )}
          </div>

          {/* 固定制約との矛盾警告 */}
          {genderFixedConflicts.length > 0 && (
            <div role="alert" className="bg-error-soft border border-error rounded-lg px-3 py-2 text-sm text-error-strong">
              <div className="flex items-start gap-1.5">
                <OctagonAlert size={14} className="shrink-0 mt-0.5" />
                <div>
                  {genderFixedConflicts.length} 件の{CONSTRAINT_DEFS.fixed.label}と矛盾があります。
                  {genderFixedConflicts.map((c, i) => (
                    <div key={i} className="mt-0.5">
                      {c.row}行{c.col}列: {c.studentName} ({c.studentGender === 'male' ? '男性' : '女性'}) は {c.allowedGender === 'male' ? '男性のみ' : '女性のみ'} 席に固定されています
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* グリッド */}
          <GridScrollArea innerClassName="flex flex-col gap-1">
            <div className="w-full text-center text-xs text-ink-muted border-b-4 border-ink-soft pb-1 mb-1">
              黒板（前）
            </div>
            {/* 列番号ヘッダー */}
            <div className="flex items-center gap-1">
              <span className="w-8 shrink-0" />
              <div className="flex gap-2">
                {Array.from({ length: numCols }, (_, i) => i + 1).map((c) => (
                  <span key={c} className="w-20 text-center text-xs text-slate-400 font-medium shrink-0">
                    {c}列
                  </span>
                ))}
              </div>
            </div>
            {/* グリッド行 */}
            {Array.from({ length: numRows }, (_, ri) => {
              const rowNum = ri + 1
              const rowSeats = seats.filter((s) => s.row === rowNum)
              return (
                <div key={rowNum} className="flex items-center gap-1">
                  <span className="w-8 text-xs text-center font-medium shrink-0 text-slate-400">
                    {rowNum}行
                  </span>
                  <div className="flex gap-2">
                    {rowSeats.map((seat) => {
                      const isEmpty = emptySeats.some((c) => c.row === seat.row && c.col === seat.col)
                      const genderConstraint = seatGenderConstraints.find(
                        (sgc) => sgc.row === seat.row && sgc.col === seat.col,
                      )

                      if (isEmpty) {
                        return (
                          <div
                            key={seat.id}
                            className="w-20 h-14 shrink-0 rounded-sm border bg-slate-100 border-slate-200 flex items-center justify-center"
                          >
                            <span className="text-xs text-slate-300">空席</span>
                          </div>
                        )
                      }

                      const isMale = genderConstraint?.allowedGender === 'male'
                      const isFemale = genderConstraint?.allowedGender === 'female'

                      const toggleGenderCell = () => {
                        if (!activeGenderMode) return
                        if (genderConstraint?.allowedGender === activeGenderMode) {
                          removeSeatGender({ row: seat.row, col: seat.col })
                        } else {
                          addSeatGender({ row: seat.row, col: seat.col, allowedGender: activeGenderMode })
                        }
                      }
                      const genderState = isMaleSelectedLabel(genderConstraint?.allowedGender)
                      return (
                        <div
                          key={seat.id}
                          onClick={toggleGenderCell}
                          {...(activeGenderMode
                            ? cellButtonProps(toggleGenderCell, `${seat.row}行${seat.col}列: ${genderState}`)
                            : {})}
                          className={[
                            'w-20 h-14 shrink-0 rounded-sm border text-xs flex flex-col items-center justify-center gap-0.5 p-1 transition-colors',
                            activeGenderMode ? 'cursor-pointer' : 'cursor-default',
                            isMale
                              ? 'bg-blue-50 border-blue-300'
                              : isFemale
                                ? 'bg-pink-50 border-pink-300'
                                : activeGenderMode
                                  ? 'bg-white border-slate-200 hover:bg-slate-50'
                                  : 'bg-white border-slate-200',
                          ].join(' ')}
                        >
                          {isMale ? (
                            <>
                              <Mars size={14} className="text-blue-600" />
                              <span className="text-[9px] text-blue-500">男性のみ</span>
                            </>
                          ) : isFemale ? (
                            <>
                              <Venus size={14} className="text-pink-600" />
                              <span className="text-[9px] text-pink-500">女性のみ</span>
                            </>
                          ) : (
                            <span className="text-slate-300 text-lg">+</span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </GridScrollArea>
        </section>}

        {/* 固定・隣接設定 */}
        {activeTab === 'constraints' && <>
          {/* 座席固定カード */}
          <section className="card p-4 md:p-6 space-y-4">
            {/* 固定制約（グリッドUI） */}
            <div className="space-y-4">
              <CardHeader
                title={CONSTRAINT_DEFS.fixed.label}
                action={
                  <ClearAllButton
                    onClear={clearFixed}
                    disabled={fixedConstraints.length === 0}
                  />
                }
              />
              <p className="text-sm text-slate-500">座席をクリックして固定する氏名を指定してください</p>
              {(fixedSeatConflicts.length > 0 || genderFixedConflicts.length > 0 || fixedForbiddenConflicts.length > 0 || fixedRelativeConflicts.length > 0 || fixedSameGroupConflicts.length > 0) && (
                <div role="alert" className="bg-error-soft border border-error rounded-lg px-3 py-2 text-sm text-error-strong">
                  <div className="flex items-start gap-1.5">
                    <OctagonAlert size={14} className="shrink-0 mt-0.5" />
                    <div className="space-y-0.5">
                      {fixedSeatConflicts.map((c, i) => {
                        const names = c.studentIds.map((id) => students.find((s) => s.id === id)?.name ?? `ID${id}`).join('、')
                        return <div key={`fs-${i}`}>{c.row}行{c.col}列: {names} が同じ座席に重複固定されています</div>
                      })}
                      {genderFixedConflicts.map((c, i) => (
                        <div key={`gf-${i}`}>{c.row}行{c.col}列: {c.studentName} の性別（{c.studentGender === 'male' ? '男性' : '女性'}）が{CONSTRAINT_DEFS.gender_constraint.short}（{c.allowedGender === 'male' ? '男性のみ' : '女性のみ'}）と矛盾</div>
                      ))}
                      {fixedForbiddenConflicts.map((c, i) => {
                        const nameA = students.find((s) => s.id === c.studentIdA)?.name ?? `ID${c.studentIdA}`
                        const nameB = students.find((s) => s.id === c.studentIdB)?.name ?? `ID${c.studentIdB}`
                        return <div key={`ff-${i}`}>{nameA}（{c.rowA}行{c.colA}列）と {nameB}（{c.rowB}行{c.colB}列）: {CONSTRAINT_DEFS.forbidden_adjacent8.short}に指定されていますが位置が隣接しています</div>
                      })}
                      {fixedRelativeConflicts.map((c, i) => {
                        const nameA = students.find((s) => s.id === c.studentIdA)?.name ?? `ID${c.studentIdA}`
                        const nameB = students.find((s) => s.id === c.studentIdB)?.name ?? `ID${c.studentIdB}`
                        return <div key={`fr-${i}`}>{nameA}（{c.rowA}行{c.colA}列）と {nameB}（{c.rowB}行{c.colB}列）: {CONSTRAINT_DEFS.relative_fixed.short}（+{c.dRow}行{c.dCol >= 0 ? '+' : ''}{c.dCol}列）の条件を満たしていません</div>
                      })}
                      {fixedSameGroupConflicts.map((c, i) => {
                        const nameA = students.find((s) => s.id === c.studentIdA)?.name ?? `ID${c.studentIdA}`
                        const nameB = students.find((s) => s.id === c.studentIdB)?.name ?? `ID${c.studentIdB}`
                        return <div key={`fsg-${i}`}>{nameA}（{c.rowA}行{c.colA}列）と {nameB}（{c.rowB}行{c.colB}列）: {CONSTRAINT_DEFS.forbidden_same_group.short}ですが固定位置が同じ{c.groupId}班です</div>
                      })}
                    </div>
                  </div>
                </div>
              )}
              {students.length === 0 ? (
                <p className="text-sm text-slate-400">名簿が登録されていません</p>
              ) : (
                <GridScrollArea innerClassName="flex flex-col gap-1">
                  <div className="w-full text-center text-xs text-ink-muted border-b-4 border-ink-soft pb-1 mb-1">
                    黒板（前）
                  </div>
                  {/* 列番号ヘッダー */}
                  <div className="flex items-center gap-1">
                    <span className="w-8 shrink-0" />
                    <div className="flex gap-2">
                      {Array.from({ length: numCols }, (_, i) => i + 1).map((c) => (
                        <span key={c} className="w-20 text-center text-xs text-slate-400 font-medium shrink-0">
                          {c}列
                        </span>
                      ))}
                    </div>
                  </div>
                  {/* グリッド行 */}
                  {Array.from({ length: numRows }, (_, ri) => {
                    const rowNum = ri + 1
                    const rowSeats = seats.filter((s) => s.row === rowNum)
                    return (
                      <div key={rowNum} className="flex items-center gap-1">
                        <span className="w-8 text-xs text-center font-medium shrink-0 text-slate-400">
                          {rowNum}行
                        </span>
                        <div className="flex gap-2">
                          {rowSeats.map((seat) => {
                            const isEmpty = emptySeats.some((c) => c.row === seat.row && c.col === seat.col)
                            const fixed = fixedConstraints.find((f) => f.row === seat.row && f.col === seat.col)
                            const fixedStudent = fixed
                              ? students.find((s) => s.id === fixed.studentId)
                              : null
                            const isEditing = editSeatId === seat.id
                            const seatGroupId = activeGroups.find((g) =>
                              g.seatCoords.some((c) => c.row === seat.row && c.col === seat.col),
                            )?.groupId
                            const groupStyle: React.CSSProperties = !isEditing && seatGroupId !== undefined
                              ? (() => { const gs = getGroupStyle(seatGroupId); return { backgroundColor: gs.backgroundColor, borderColor: gs.borderColor } })()
                              : {}

                            if (isEmpty) {
                              return (
                                <div
                                  key={seat.id}
                                  className="w-20 h-14 shrink-0 rounded-sm border bg-slate-100 border-slate-200 flex items-center justify-center"
                                >
                                  <span className="text-xs text-slate-300">空席</span>
                                </div>
                              )
                            }

                            return (
                              <div
                                key={seat.id}
                                onClick={() => setEditSeatId(isEditing ? null : seat.id)}
                                {...(!isEditing
                                  ? cellButtonProps(
                                    () => setEditSeatId(seat.id),
                                    `${seat.row}行${seat.col}列: ${fixedStudent ? `${fixedStudent.name}を固定` : '固定なし'}`,
                                  )
                                  : {})}
                                style={groupStyle}
                                className={[
                                  'w-20 h-14 shrink-0 rounded-sm border text-xs flex flex-col items-center justify-center gap-0.5 p-1 cursor-pointer transition-colors',
                                  isEditing
                                    ? 'border-blue-400 bg-blue-50 ring-1 ring-blue-400'
                                    : seatGroupId !== undefined
                                      ? 'border hover:opacity-90'
                                      : fixed
                                        ? 'bg-amber-50 border-amber-300 hover:bg-amber-100'
                                        : 'bg-white border-slate-200 hover:bg-slate-50',
                                ].join(' ')}
                              >
                                {isEditing ? (
                                  <select
                                    autoFocus
                                    value={fixed?.studentId ?? ''}
                                    onChange={(e) => {
                                      const val = e.target.value
                                      if (fixed) removeFixed(fixed.studentId)
                                      if (val !== '') {
                                        const studentId = parseInt(val, 10)
                                        if (!isNaN(studentId)) addFixed({ studentId, row: seat.row, col: seat.col })
                                      }
                                      setEditSeatId(null)
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                    className="w-full text-xs border rounded-sm px-1 py-0.5 bg-white"
                                  >
                                    <option value="">-- なし --</option>
                                    {sortedStudents.map((s) => (
                                      <option key={s.id} value={s.id}>
                                        {studentDisplayNum.get(s.id)}: {s.name}
                                      </option>
                                    ))}
                                  </select>
                                ) : fixedStudent ? (
                                  <>
                                    {/* 氏名の背景は結果表示（SeatingGrid）と同じ男女色 */}
                                    <span className={`font-medium text-slate-800 text-center leading-tight truncate max-w-full block px-0.5 rounded-sm ${fixedStudent.gender === 'male' ? 'bg-blue-100' : 'bg-rose-100'}`}>
                                      {fixedStudent.name}
                                    </span>
                                    <span className="text-[9px] px-0.5 rounded font-bold inline-flex items-center gap-0.5 text-amber-800 bg-amber-100">
                                      <Pin size={9} className="block" />{CONSTRAINT_DEFS.fixed.badge}
                                    </span>
                                  </>
                                ) : (
                                  <span className="text-slate-300 text-lg">+</span>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </GridScrollArea>
              )}
            </div>
          </section>

          {/* 隣接禁止カード */}
          <section className="card p-4 md:p-6 space-y-4">
            <div className="space-y-4">
              <CardHeader
                title={CONSTRAINT_DEFS.forbidden_adjacent8.short}
                action={
                  <ClearAllButton
                    onClear={clearForbidden}
                    disabled={forbiddenConstraints.length === 0}
                  />
                }
              />
              {/* 追加フォーム */}
              <div className="flex gap-2 items-end">
                <div className="flex-1 min-w-0">
                  <label className="block text-sm text-slate-500 mb-1">基準</label>
                  <select
                    value={fbAddA}
                    onChange={(e) => setFbAddA(e.target.value)}
                    className="w-full border rounded-sm px-2 py-1.5 text-sm"
                  >
                    <option value="">-- 選択 --</option>
                    {sortedStudents.map((s) => (
                      <option key={s.id} value={s.id}>
                        {studentDisplayNum.get(s.id)}: {s.name}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  onClick={() => {
                    const id = parseInt(fbAddA)
                    if (id) handleOpenFbDialog(id)
                  }}
                  disabled={!fbAddA}
                  className="btn btn-sm btn-primary shrink-0"
                >
                  追加
                </button>
              </div>
              {/* 矛盾警告 */}
              {(rfFbConflicts.length > 0 || fixedForbiddenConflicts.length > 0 || fixedSameGroupConflicts.length > 0) && (
                <div role="alert" className="bg-error-soft border border-error rounded-lg px-3 py-2 text-sm text-error-strong">
                  <div className="flex items-start gap-1.5">
                    <OctagonAlert size={14} className="shrink-0 mt-0.5" />
                    <div className="space-y-0.5">
                      {rfFbConflicts.map((c, i) => {
                        const nameA = students.find((s) => s.id === c.studentIdA)?.name ?? `ID${c.studentIdA}`
                        const nameB = students.find((s) => s.id === c.studentIdB)?.name ?? `ID${c.studentIdB}`
                        return <div key={`rffb-${i}`}>{nameA} と {nameB}: {CONSTRAINT_DEFS.forbidden_adjacent8.short}ですが{CONSTRAINT_DEFS.relative_fixed.short}にも登録されています</div>
                      })}
                      {fixedForbiddenConflicts.map((c, i) => {
                        const nameA = students.find((s) => s.id === c.studentIdA)?.name ?? `ID${c.studentIdA}`
                        const nameB = students.find((s) => s.id === c.studentIdB)?.name ?? `ID${c.studentIdB}`
                        return <div key={`ffb-${i}`}>{nameA}（{c.rowA}行{c.colA}列）と {nameB}（{c.rowB}行{c.colB}列）: {CONSTRAINT_DEFS.forbidden_adjacent8.short}に設定されていますが固定位置が隣接しています</div>
                      })}
                      {fixedSameGroupConflicts.map((c, i) => {
                        const nameA = students.find((s) => s.id === c.studentIdA)?.name ?? `ID${c.studentIdA}`
                        const nameB = students.find((s) => s.id === c.studentIdB)?.name ?? `ID${c.studentIdB}`
                        return <div key={`fsg-${i}`}>{nameA}（{c.rowA}行{c.colA}列）と {nameB}（{c.rowB}行{c.colB}列）: {CONSTRAINT_DEFS.forbidden_same_group.short}ですが固定位置が同じ{c.groupId}班です</div>
                      })}
                    </div>
                  </div>
                </div>
              )}
              {/* 制約リスト: (A, type) ごとに1行、Bは集合で表示。
                  PC はテーブル、モバイル（< sm）は幅が収まらないためカード表示にする */}
              {isWide ? (
                <div className="overflow-auto max-h-64 border rounded-sm">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="bg-canvas text-ink-soft">
                        <th scope="col" className="sticky top-0 bg-canvas text-left px-3 py-2 font-medium whitespace-nowrap z-10">基準</th>
                        <th scope="col" className="sticky top-0 bg-canvas text-left px-3 py-2 font-medium z-10">対象</th>
                        <th scope="col" className="sticky top-0 bg-canvas text-left px-3 py-2 font-medium whitespace-nowrap z-10">種類</th>
                        <th scope="col" className="sticky top-0 bg-canvas w-24 z-10"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {fbDisplayGroups.length === 0 && (
                        <tr>
                          <td colSpan={4} className="px-3 py-4 text-center text-xs text-slate-400">
                            制約が登録されていません
                          </td>
                        </tr>
                      )}
                      {fbDisplayGroups.map((g) => {
                        const stA = students.find((s) => s.id === g.studentIdA)
                        const bNames = g.bIds.map((bid) => students.find((s) => s.id === bid)?.name ?? `ID${bid}`)
                        return (
                          <tr key={`${g.studentIdA}__${g.type}`} className="border-t border-slate-200 hover:bg-slate-50">
                            <td className="px-3 py-2 font-medium whitespace-nowrap">{stA?.name ?? `ID${g.studentIdA}`}</td>
                            <td className="px-3 py-2 text-sm text-slate-600">{bNames.join(', ')}</td>
                            <td className="px-3 py-2 text-sm text-slate-500 whitespace-nowrap">{FORBID_TYPE_LABELS[g.type] ?? g.type}</td>
                            <td className="px-3 py-2 text-right space-x-2 whitespace-nowrap">
                              <button
                                onClick={() => handleOpenFbEditGroupDialog(g.studentIdA, g.type)}
                                className="text-slate-500 hover:text-slate-700 text-sm px-2 py-1.5"
                              >
                                編集
                              </button>
                              <button
                                onClick={() => removeForbiddenGroupByType(g.studentIdA, g.type)}
                                className="text-error hover:text-error-strong text-sm px-2 py-1.5"
                              >
                                削除
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="max-h-64 overflow-y-auto border rounded-sm divide-y divide-line">
                  {fbDisplayGroups.length === 0 ? (
                    <p className="px-3 py-4 text-center text-xs text-slate-400">制約が登録されていません</p>
                  ) : (
                    fbDisplayGroups.map((g) => {
                      const stA = students.find((s) => s.id === g.studentIdA)
                      const nameA = stA?.name ?? `ID${g.studentIdA}`
                      const bNames = g.bIds.map((bid) => students.find((s) => s.id === bid)?.name ?? `ID${bid}`)
                      return (
                        <div key={`${g.studentIdA}__${g.type}`} className="flex items-start gap-2 px-3 py-2.5 bg-white">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium text-ink">{nameA}</span>
                              <span className="px-1.5 py-0.5 text-xs bg-slate-100 text-slate-600 rounded-sm">
                                {FORBID_TYPE_LABELS[g.type] ?? g.type}
                              </span>
                            </div>
                            <div className="text-sm text-slate-600 mt-1 break-words">→ {bNames.join(', ')}</div>
                          </div>
                          <div className="flex items-center shrink-0">
                            <button
                              onClick={() => handleOpenFbEditGroupDialog(g.studentIdA, g.type)}
                              aria-label={`${nameA} の制約を編集`}
                              className="p-2 text-slate-500 hover:text-slate-700"
                            >
                              <Pencil size={16} />
                            </button>
                            <button
                              onClick={() => removeForbiddenGroupByType(g.studentIdA, g.type)}
                              aria-label={`${nameA} の制約を削除`}
                              className="p-2 text-error hover:text-error-strong"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              )}
            </div>
          </section>

          {/* 隣接固定カード */}
          <section className="card p-4 md:p-6 space-y-4">
            <div className="space-y-4">
              <CardHeader
                title={CONSTRAINT_DEFS.relative_fixed.short}
                action={
                  <ClearAllButton
                    onClear={clearRelativeFixed}
                    disabled={relativeFixedConstraints.length === 0}
                  />
                }
              />
              {/* 追加フォーム */}
              <div className="flex gap-2 items-end">
                <div className="flex-1 min-w-0">
                  <label className="block text-sm text-slate-500 mb-1">基準</label>
                  <select
                    value={rfAddA}
                    onChange={(e) => setRfAddA(e.target.value)}
                    className="w-full border rounded-sm px-2 py-1.5 text-sm"
                  >
                    <option value="">-- 選択 --</option>
                    {sortedStudents.map((s) => (
                      <option key={s.id} value={s.id}>
                        {studentDisplayNum.get(s.id)}: {s.name}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  onClick={() => {
                    const id = parseInt(rfAddA)
                    if (id) handleOpenRfDialog(id)
                  }}
                  disabled={!rfAddA}
                  className="btn btn-sm btn-primary shrink-0"
                >
                  追加
                </button>
              </div>
              {/* 矛盾警告 */}
              {(rfFbConflicts.length > 0 || fixedRelativeConflicts.length > 0) && (
                <div role="alert" className="bg-error-soft border border-error rounded-lg px-3 py-2 text-sm text-error-strong">
                  <div className="flex items-start gap-1.5">
                    <OctagonAlert size={14} className="shrink-0 mt-0.5" />
                    <div className="space-y-0.5">
                      {rfFbConflicts.map((c, i) => {
                        const nameA = students.find((s) => s.id === c.studentIdA)?.name ?? `ID:${c.studentIdA}`
                        const nameB = students.find((s) => s.id === c.studentIdB)?.name ?? `ID:${c.studentIdB}`
                        return <div key={`rffb-${i}`}>{nameA} と {nameB}: {CONSTRAINT_DEFS.relative_fixed.short}と{CONSTRAINT_DEFS.forbidden_adjacent8.short}が矛盾</div>
                      })}
                      {fixedRelativeConflicts.map((c, i) => {
                        const nameA = students.find((s) => s.id === c.studentIdA)?.name ?? `ID${c.studentIdA}`
                        const nameB = students.find((s) => s.id === c.studentIdB)?.name ?? `ID${c.studentIdB}`
                        return <div key={`frr-${i}`}>{nameA}（固定: {c.rowA}行{c.colA}列）と {nameB}（固定: {c.rowB}行{c.colB}列）: {CONSTRAINT_DEFS.relative_fixed.short}（+{c.dRow}行{c.dCol >= 0 ? '+' : ''}{c.dCol}列）の条件を満たしていません</div>
                      })}
                    </div>
                  </div>
                </div>
              )}
              {/* 制約リスト: PC はテーブル、モバイル（< sm）はカード表示 */}
              {isWide ? (
                <div className="overflow-auto max-h-64 border rounded-sm">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="bg-canvas text-ink-soft">
                        <th scope="col" className="sticky top-0 bg-canvas text-left px-3 py-2 font-medium z-10">基準</th>
                        <th scope="col" className="sticky top-0 bg-canvas text-left px-3 py-2 font-medium z-10">周囲配置</th>
                        <th scope="col" className="sticky top-0 bg-canvas w-24 z-10"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {rfGroups.length === 0 && (
                        <tr>
                          <td colSpan={3} className="px-3 py-4 text-center text-xs text-slate-400">
                            制約が登録されていません
                          </td>
                        </tr>
                      )}
                      {rfGroups.map(([studentIdA, constraints]) => {
                        const stA = students.find((s) => s.id === studentIdA)
                        const bNames = constraints.map((c) => {
                          const st = students.find((s) => s.id === c.studentIdB)
                          return st?.name ?? `ID${c.studentIdB}`
                        })
                        return (
                          <tr key={studentIdA} className="border-t border-slate-200 hover:bg-slate-50">
                            <td className="px-3 py-2 font-medium">{stA?.name ?? `ID${studentIdA}`}</td>
                            <td className="px-3 py-2 text-sm text-slate-600">{bNames.join(', ')}</td>
                            <td className="px-3 py-2 text-right space-x-2 whitespace-nowrap">
                              <button
                                onClick={() => handleOpenRfDialog(studentIdA)}
                                className="text-slate-500 hover:text-slate-700 text-sm px-2 py-1.5"
                              >
                                編集
                              </button>
                              <button
                                onClick={() => removeRelativeFixedGroup(studentIdA)}
                                className="text-error hover:text-error-strong text-sm px-2 py-1.5"
                              >
                                削除
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="max-h-64 overflow-y-auto border rounded-sm divide-y divide-line">
                  {rfGroups.length === 0 ? (
                    <p className="px-3 py-4 text-center text-xs text-slate-400">制約が登録されていません</p>
                  ) : (
                    rfGroups.map(([studentIdA, constraints]) => {
                      const stA = students.find((s) => s.id === studentIdA)
                      const nameA = stA?.name ?? `ID${studentIdA}`
                      const bNames = constraints.map((c) => {
                        const st = students.find((s) => s.id === c.studentIdB)
                        return st?.name ?? `ID${c.studentIdB}`
                      })
                      return (
                        <div key={studentIdA} className="flex items-start gap-2 px-3 py-2.5 bg-white">
                          <div className="min-w-0 flex-1">
                            <span className="font-medium text-ink">{nameA}</span>
                            <div className="text-sm text-slate-600 mt-1 break-words">→ {bNames.join(', ')}</div>
                          </div>
                          <div className="flex items-center shrink-0">
                            <button
                              onClick={() => handleOpenRfDialog(studentIdA)}
                              aria-label={`${nameA} の周囲配置を編集`}
                              className="p-2 text-slate-500 hover:text-slate-700"
                            >
                              <Pencil size={16} />
                            </button>
                            <button
                              onClick={() => removeRelativeFixedGroup(studentIdA)}
                              aria-label={`${nameA} の周囲配置を削除`}
                              className="p-2 text-error hover:text-error-strong"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              )}
            </div>
          </section>

          {/* ダイアログ Portal — activeTab === 'constraints' 中でのみ存在 */}
          {/* 隣接禁止ダイアログ（モーダル）— Portal で body 直下にレンダリング */}
          {fbDialogOpen && fbAnchorId && (() => {
            const anchorStudent = students.find((s) => s.id === fbAnchorId)
            return createPortal(
              <Modal onClose={() => setFbDialogOpen(false)} maxWidth="md" labelledBy="fb-dialog-title">
                <div className="p-4 md:p-6 space-y-4">
                  <h4 id="fb-dialog-title" className="font-semibold text-slate-700 text-center">
                    「{anchorStudent?.name ?? `ID${fbAnchorId}`}」の隣接禁止設定
                  </h4>
                  {/* 種類チェックボックス */}
                  <div>
                    <label className="block text-sm text-slate-500 mb-1">種類（複数選択可）</label>
                    <div className="space-y-1">
                      {([
                        ['adjacent8', CONSTRAINT_DEFS.forbidden_adjacent8.label],
                        ['same_group', CONSTRAINT_DEFS.forbidden_same_group.label],
                      ] as ['adjacent8' | 'same_group', string][]).map(([val, label]) => (
                        <label key={val} className="flex items-center gap-2 text-sm cursor-pointer">
                          <input
                            type="checkbox"
                            checked={fbDialogTypes.includes(val)}
                            onChange={(e) => {
                              setFbDialogTypes(
                                e.target.checked
                                  ? [...fbDialogTypes, val]
                                  : fbDialogTypes.filter((t) => t !== val),
                              )
                            }}
                            className="rounded-sm"
                          />
                          <span>{label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  {/* 氏名Bチェックボックスリスト */}
                  <div>
                    <label className="block text-sm text-slate-500 mb-1">
                      対象（複数選択可）
                    </label>
                    <div className="border rounded-sm p-2 max-h-48 overflow-y-auto space-y-1 bg-white">
                      {sortedStudents
                        .filter((s) => s.id !== fbAnchorId)
                        .map((s) => (
                          <label key={s.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-slate-50 px-1 py-0.5 rounded-sm">
                            <input
                              type="checkbox"
                              checked={fbDialogBList.includes(s.id)}
                              onChange={(e) => {
                                setFbDialogBList(
                                  e.target.checked
                                    ? [...fbDialogBList, s.id]
                                    : fbDialogBList.filter((id) => id !== s.id),
                                )
                              }}
                              className="rounded-sm"
                            />
                            <span>{studentDisplayNum.get(s.id)}: {s.name}</span>
                          </label>
                        ))}
                    </div>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button
                      onClick={() => setFbDialogOpen(false)}
                      className="btn btn-sm btn-quiet"
                    >
                      キャンセル
                    </button>
                    <button
                      onClick={handleConfirmFbDialog}
                      disabled={fbDialogBList.length === 0 || fbDialogTypes.length === 0}
                      className="btn btn-sm btn-primary"
                    >
                      確定
                    </button>
                  </div>
                </div>
              </Modal>,
              document.body,
            )
          })()}

          {/* 隣接禁止: グループ編集ダイアログ（ラジオボタン + Bチェックボックス） */}
          {fbEditDialogOpen && fbEditAnchorId !== null && (() => {
            const stA = students.find((s) => s.id === fbEditAnchorId)
            return createPortal(
              <Modal onClose={() => setFbEditDialogOpen(false)} maxWidth="md" labelledBy="fb-edit-dialog-title">
                <div className="p-4 md:p-6 space-y-4">
                  <h4 id="fb-edit-dialog-title" className="font-semibold text-slate-700 text-center">
                    「{stA?.name ?? `ID${fbEditAnchorId}`}」の禁止設定を編集
                  </h4>
                  {/* 種類ラジオボタン */}
                  <div>
                    <label className="block text-sm text-slate-500 mb-2">種類</label>
                    <div className="space-y-1">
                      {([
                        ['adjacent8', CONSTRAINT_DEFS.forbidden_adjacent8.label],
                        ['same_group', CONSTRAINT_DEFS.forbidden_same_group.label],
                      ] as ['adjacent8' | 'same_group', string][]).map(([val, label]) => (
                        <label key={val} className="flex items-center gap-2 text-sm cursor-pointer">
                          <input
                            type="radio"
                            name="fbEditType"
                            value={val}
                            checked={fbEditType === val}
                            onChange={() => setFbEditType(val)}
                          />
                          <span>{label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  {/* Bチェックボックス */}
                  <div>
                    <label className="block text-sm text-slate-500 mb-1">対象（複数選択可）</label>
                    <div className="border rounded-sm p-2 max-h-48 overflow-y-auto space-y-1 bg-white">
                      {sortedStudents
                        .filter((s) => s.id !== fbEditAnchorId)
                        .map((s) => (
                          <label key={s.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-slate-50 px-1 py-0.5 rounded-sm">
                            <input
                              type="checkbox"
                              checked={fbEditBList.includes(s.id)}
                              onChange={(e) => {
                                setFbEditBList(
                                  e.target.checked
                                    ? [...fbEditBList, s.id]
                                    : fbEditBList.filter((id) => id !== s.id),
                                )
                              }}
                              className="rounded-sm"
                            />
                            <span>{studentDisplayNum.get(s.id)}: {s.name}</span>
                          </label>
                        ))}
                    </div>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button
                      onClick={() => setFbEditDialogOpen(false)}
                      className="btn btn-sm btn-quiet"
                    >
                      キャンセル
                    </button>
                    <button
                      onClick={handleConfirmFbEditGroup}
                      disabled={fbEditBList.length === 0}
                      className="btn btn-sm btn-primary"
                    >
                      確定
                    </button>
                  </div>
                </div>
              </Modal>,
              document.body,
            )
          })()}

          {/* 隣接固定ダイアログ（モーダル）— Portal で body 直下にレンダリング */}
          {rfDialogOpen && rfAnchorId && (() => {
            const anchorStudent = students.find((s) => s.id === rfAnchorId)
            const usedIds = new Set(
              Object.values(rfGrid).filter((v): v is number => v != null),
            )
            return createPortal(
              <Modal onClose={() => setRfDialogOpen(false)} maxWidth="sm" labelledBy="rf-dialog-title">
                <div className="p-4 md:p-6 space-y-4">
                  <h4 id="rf-dialog-title" className="font-semibold text-slate-700 text-center">
                    「{anchorStudent?.name ?? `ID${rfAnchorId}`}」の周囲配置
                  </h4>
                  <p className="text-sm text-slate-500 text-center">
                    セルをクリックして設定
                  </p>
                  <div className="grid grid-cols-3 gap-2 mx-auto w-fit">
                    {RF_OFFSETS.map(([dRow, dCol]) => {
                      const key = `${dRow},${dCol}`
                      if (dRow === 0 && dCol === 0) {
                        return (
                          <div
                            key={key}
                            className="w-20 h-14 rounded-sm border bg-slate-200 border-slate-300 flex items-center justify-center text-xs font-medium text-slate-600 truncate px-1"
                          >
                            {anchorStudent?.name ?? `ID${rfAnchorId}`}
                          </div>
                        )
                      }
                      const assigned = rfGrid[key] ?? null
                      const isEditing = rfEditCell === key
                      const assignedStudent = assigned ? students.find((s) => s.id === assigned) : null
                      return (
                        <div
                          key={key}
                          onClick={() => setRfEditCell(isEditing ? null : key)}
                          {...(!isEditing
                            ? cellButtonProps(
                              () => setRfEditCell(key),
                              `相対位置 ${dRow > 0 ? '後' : dRow < 0 ? '前' : ''}${dCol > 0 ? '右' : dCol < 0 ? '左' : ''}${dRow === 0 && dCol === 0 ? '中央' : ''}: ${assignedStudent ? assignedStudent.name : '未設定'}`,
                            )
                            : {})}
                          className={[
                            'w-20 h-14 rounded-sm border text-xs flex items-center justify-center cursor-pointer transition-colors truncate px-1',
                            isEditing
                              ? 'border-blue-400 bg-blue-50 ring-1 ring-blue-400'
                              : assigned
                                ? 'bg-amber-50 border-amber-300 hover:bg-amber-100'
                                : 'bg-white border-slate-200 hover:bg-slate-50',
                          ].join(' ')}
                        >
                          {isEditing ? (
                            <select
                              autoFocus
                              value={assigned ?? ''}
                              onChange={(e) => {
                                const val = e.target.value
                                setRfGrid((prev) => ({
                                  ...prev,
                                  [key]: val === '' ? null : parseInt(val),
                                }))
                                setRfEditCell(null)
                              }}
                              onClick={(e) => e.stopPropagation()}
                              className="w-full text-xs border rounded-sm px-1 py-0.5 bg-white"
                            >
                              <option value="">-- なし --</option>
                              {sortedStudents
                                .filter((s) => s.id !== rfAnchorId && (!usedIds.has(s.id) || s.id === assigned))
                                .map((s) => (
                                  <option key={s.id} value={s.id}>
                                    {studentDisplayNum.get(s.id)}: {s.name}
                                  </option>
                                ))}
                            </select>
                          ) : assignedStudent ? (
                            <span className="font-medium text-amber-700 text-center leading-tight">
                              {assignedStudent.name}
                            </span>
                          ) : (
                            <span className="text-slate-300 text-lg">+</span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button
                      onClick={() => setRfDialogOpen(false)}
                      className="btn btn-sm btn-quiet"
                    >
                      キャンセル
                    </button>
                    <button
                      onClick={handleConfirmRfDialog}
                      className="btn btn-sm btn-primary"
                    >
                      確定
                    </button>
                  </div>
                </div>
              </Modal>,
              document.body,
            )
          })()}
        </>}

        {/* 前回座席タブ */}
        {activeTab === 'prev_seat' && <section className="card p-4 md:p-6 space-y-4">
          <CardHeader
            title="前回座席"
            action={
              <ClearAllButton
                onClear={() => setPrevAssign([])}
                disabled={prevAssign.length === 0}
              />
            }
          />
          <p className="text-sm text-slate-500">
            前回の座席配置を手動で入力します。「最適化オプション」タブで前回座席考慮オプションを設定できます。
          </p>

          {/* 編集可能グリッド */}
          <GridScrollArea innerClassName="flex flex-col gap-1">
            <div className="w-full text-center text-xs text-ink-muted border-b-4 border-ink-soft pb-1 mb-1">
              黒板（前）
            </div>
            {/* 列番号ヘッダー */}
            <div className="flex items-center gap-1">
              <span className="w-8 shrink-0" />
              <div className="flex gap-2">
                {Array.from({ length: numCols }, (_, i) => i + 1).map((c) => (
                  <span key={c} className="w-20 text-center text-xs text-slate-400 font-medium shrink-0">
                    {c}列
                  </span>
                ))}
              </div>
            </div>
            {/* グリッド行 */}
            {Array.from({ length: numRows }, (_, ri) => {
              const row = ri + 1
              return (
                <div key={row} className="flex items-center gap-1">
                  <span className="w-8 text-xs text-center font-medium shrink-0 text-slate-400">{row}行</span>
                  <div className="flex gap-2">
                    {Array.from({ length: numCols }, (_, ci) => {
                      const col = ci + 1
                      const seatKey = `${row},${col}`
                      const isEmpty = emptySeats.some((c) => c.row === row && c.col === col)
                      const prevEntry = prevAssign.find((pa) => pa.row === row && pa.col === col)
                      const prevStudent = prevEntry ? students.find((s) => s.id === prevEntry.student_id) : undefined
                      const isEditing = editPrevSeatCoord === seatKey
                      const assignedElsewhere = new Set(
                        prevAssign.filter((pa) => !(pa.row === row && pa.col === col)).map((pa) => pa.student_id)
                      )
                      return (
                        <div
                          key={seatKey}
                          onClick={() => {
                            if (isEmpty) return
                            setEditPrevSeatCoord(isEditing ? null : seatKey)
                          }}
                          {...(!isEmpty && !isEditing
                            ? cellButtonProps(
                              () => setEditPrevSeatCoord(seatKey),
                              `${row}行${col}列: ${prevStudent ? prevStudent.name : '未設定'}`,
                            )
                            : {})}
                          className={`w-20 h-14 shrink-0 rounded border text-xs flex flex-col items-center justify-center text-center transition-colors ${isEmpty
                            ? 'bg-slate-100 border-slate-200 text-slate-300 cursor-default'
                            : isEditing
                              ? 'border-blue-400 bg-blue-50 ring-1 ring-blue-400 cursor-pointer'
                              : prevStudent
                                ? 'bg-blue-50 border-blue-200 hover:bg-blue-100 cursor-pointer'
                                : 'bg-white border-slate-200 hover:bg-slate-50 cursor-pointer'
                            }`}
                        >
                          {isEmpty ? (
                            <span>空席</span>
                          ) : isEditing ? (
                            <select
                              autoFocus
                              defaultValue={prevEntry ? String(prevEntry.student_id) : ''}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => {
                                const val = e.target.value
                                const filtered = prevAssign.filter((pa) => !(pa.row === row && pa.col === col))
                                if (val !== '') {
                                  setPrevAssign([...filtered, { student_id: parseInt(val), row, col }])
                                } else {
                                  setPrevAssign(filtered)
                                }
                                setEditPrevSeatCoord(null)
                              }}
                              onBlur={() => setEditPrevSeatCoord(null)}
                              className="w-full text-xs border-none bg-transparent text-center outline-hidden"
                            >
                              <option value="">なし</option>
                              {students
                                .filter((s) => !assignedElsewhere.has(s.id))
                                .map((s) => (
                                  <option key={s.id} value={s.id}>{studentDisplayNum.get(s.id)}: {s.name}</option>
                                ))}
                            </select>
                          ) : prevStudent ? (
                            // 氏名の背景は結果表示（SeatingGrid）と同じ男女色
                            <span className={`font-medium text-slate-800 text-center leading-tight truncate max-w-full block px-1 rounded-sm ${prevStudent.gender === 'male' ? 'bg-blue-100' : 'bg-rose-100'}`}>
                              {prevStudent.name}
                            </span>
                          ) : (
                            <span className="text-slate-300">+</span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </GridScrollArea>
        </section>}

        {/* 班分散グループ */}
        {activeTab === 'leader_groups' && <section className="card p-4 md:p-6 space-y-4">
          <CardHeader title="班分散グループ" />
          <p className="text-sm text-slate-500">
            グループ内の児童・生徒同士が同じ班に配置されないよう制約を設定します。班長など特定の役割の児童・生徒を各班に分散させたい場合に使用します。
          </p>
          {/* 警告: グループ内人数 > 班数 */}
          {leaderGroups.some((lg) => lg.studentIds.length > numGroups) && (
            <div role="status" className="bg-warning-soft border border-warning rounded-lg px-3 py-2 text-sm text-warning-strong flex items-start gap-1.5">
              <TriangleAlert size={13} className="shrink-0 mt-0.5" />
              <div>
                {leaderGroups
                  .filter((lg) => lg.studentIds.length > numGroups)
                  .map((lg, i) => (
                    <div key={i}>「{lg.name}」グループ({lg.studentIds.length}人)の人数が班数({numGroups}班)を超えています。解が見つからない可能性があります。</div>
                  ))}
              </div>
            </div>
          )}
          {/* グループ一覧 */}
          <div className="space-y-2">
            {leaderGroups.map((lg) => (
              <div key={lg.id} className="flex items-start gap-2 p-3 border rounded-lg">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{lg.name}</span>
                    <span className="text-xs text-slate-400">({lg.studentIds.length}人)</span>
                    {(lg.showLabel !== false) ? (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700 font-medium">印刷時表示</span>
                    ) : (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-400 font-medium">印刷時非表示</span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {lg.studentIds.map((sid) => {
                      const stu = students.find((s) => s.id === sid)
                      return (
                        <span key={sid} className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-primary-soft text-primary-strong">
                          {stu ? stu.name || `ID:${sid}` : `ID:${sid}`}
                        </span>
                      )
                    })}
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button
                    onClick={() => handleOpenLgDialog(lg)}
                    className="p-2.5 text-slate-500 hover:text-primary hover:bg-primary-soft rounded-lg transition-colors"
                    title="編集"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                  </button>
                  <ConfirmButton
                    onConfirm={() => removeLeaderGroup(lg.id)}
                    title="削除"
                    aria-label={`${lg.name} を削除`}
                    className="p-2.5 rounded-lg transition-colors"
                    idleClassName="text-slate-500 hover:text-error-strong hover:bg-error-soft"
                    confirmClassName="bg-error text-white hover:bg-error-strong"
                    confirmChildren={<Check size={14} />}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                  </ConfirmButton>
                </div>
              </div>
            ))}
            {leaderGroups.length === 0 && (
              <p className="text-sm text-slate-400">グループが登録されていません。</p>
            )}
          </div>
          <button
            onClick={() => handleOpenLgDialog()}
            className="btn btn-sm btn-secondary"
          >
            + グループを追加
          </button>

          {/* ダイアログ */}
          {lgDialogOpen && createPortal(
            <Modal onClose={() => setLgDialogOpen(false)} maxWidth="md" labelledBy="lg-dialog-title">
              <div className="p-4 md:p-6 space-y-4">
                <h4 id="lg-dialog-title" className="font-semibold text-slate-700">
                  {lgEditId ? 'グループを編集' : 'グループを追加'}
                </h4>
                <div>
                  <label className="text-sm text-slate-500 block mb-1">グループ名</label>
                  <input
                    type="text"
                    value={lgName}
                    onChange={(e) => setLgName(e.target.value)}
                    placeholder="例: 班長"
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="text-sm text-slate-500 block mb-1">児童・生徒を選択（2人以上）</label>
                  <div className="max-h-48 overflow-y-auto border rounded-lg p-2 space-y-1">
                    {sortedStudents.map((s) => (
                      <label key={s.id} className="flex items-center gap-2 cursor-pointer px-2 py-1 rounded-sm hover:bg-slate-50">
                        <input
                          type="checkbox"
                          checked={lgSelectedIds.includes(s.id)}
                          onChange={() => toggleLgStudent(s.id)}
                          className="w-4 h-4 accent-primary"
                        />
                        <span className="text-sm">{studentDisplayNum.get(s.id)}: {s.name}</span>
                      </label>
                    ))}
                    {sortedStudents.length === 0 && (
                      <p className="text-xs text-slate-400 px-2 py-1">名簿にメンバーが登録されていません</p>
                    )}
                  </div>
                  <p className="text-sm text-slate-400 mt-1">選択中: {lgSelectedIds.length}人</p>
                </div>
                {lgSelectedIds.length > numGroups && (
                  <p className="text-sm text-warning-strong flex items-center gap-1">
                    <TriangleAlert size={12} />
                    グループ人数({lgSelectedIds.length}人)が班数({numGroups}班)を超えています
                  </p>
                )}
                <label className="flex items-center gap-2 cursor-pointer select-none text-sm">
                  <input
                    type="checkbox"
                    checked={lgShowLabel}
                    onChange={(e) => setLgShowLabel(e.target.checked)}
                    className="w-4 h-4 accent-purple-600"
                  />
                  <span className="text-slate-700">グループ名を結果画面・印刷時に表示する</span>
                </label>
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setLgDialogOpen(false)}
                    className="btn btn-sm btn-quiet"
                  >
                    キャンセル
                  </button>
                  <button
                    onClick={handleConfirmLgDialog}
                    disabled={!lgName.trim() || lgSelectedIds.length < 2}
                    className="btn btn-sm btn-primary"
                  >
                    {lgEditId ? '更新' : '追加'}
                  </button>
                </div>
              </div>
            </Modal>,
            document.body,
          )}
        </section>}

        {/* 最適化オプション */}
        {activeTab === 'options' && <section className="card p-4 md:p-6 space-y-4">
          <CardHeader title="最適化オプション" />
          <p className="text-sm text-slate-500">
            各オプションの条件を満たすように最適化された配置を探索します。
          </p>

          {/* 性別バランス */}
          <div className="space-y-2">
            <h4 className="font-semibold text-slate-700">性別バランス</h4>
            <div className="space-y-2">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={constraintToggles.gender_balance}
                  onChange={(e) => updateConstraintToggle('gender_balance', e.target.checked)}
                  className="w-4 h-4 accent-primary mt-0.5 shrink-0"
                />
                <span className="flex flex-col sm:flex-row sm:items-center sm:gap-3">
                  <span className="text-sm font-medium">{CONSTRAINT_DEFS.group_gender_imbalance.label}</span>
                  <span className="text-xs text-slate-400">{CONSTRAINT_DEFS.group_gender_imbalance.settingDescription}</span>
                </span>
              </label>
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={constraintToggles.loneliness}
                  onChange={(e) => updateConstraintToggle('loneliness', e.target.checked)}
                  className="w-4 h-4 accent-primary mt-0.5 shrink-0"
                />
                <span className="flex flex-col sm:flex-row sm:items-center sm:gap-3">
                  <span className="text-sm font-medium">{CONSTRAINT_DEFS.loneliness.label}</span>
                  <span className="text-xs text-slate-400">{CONSTRAINT_DEFS.loneliness.settingDescription}</span>
                </span>
              </label>
            </div>
          </div>

          {/* 前回座席考慮 */}
          <div className="space-y-2">
            <h4 className="font-semibold text-slate-700">前回座席考慮</h4>
            <div className="space-y-2">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={constraintToggles.differ_seat}
                  onChange={(e) => updateConstraintToggle('differ_seat', e.target.checked)}
                  className="w-4 h-4 accent-primary mt-0.5 shrink-0"
                />
                <span className="flex flex-col sm:flex-row sm:items-center sm:gap-3">
                  <span className="text-sm font-medium">{CONSTRAINT_DEFS.prev_assign_same.label}</span>
                  <span className="text-xs text-slate-400">{CONSTRAINT_DEFS.prev_assign_same.settingDescription}</span>
                </span>
              </label>
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={constraintToggles.differ_neighbor}
                  onChange={(e) => updateConstraintToggle('differ_neighbor', e.target.checked)}
                  className="w-4 h-4 accent-primary mt-0.5 shrink-0"
                />
                <span className="flex flex-col sm:flex-row sm:items-center sm:gap-3">
                  <span className="text-sm font-medium">{CONSTRAINT_DEFS.prev_neighbor_same.label}</span>
                  <span className="text-xs text-slate-400">{CONSTRAINT_DEFS.prev_neighbor_same.settingDescription}</span>
                </span>
              </label>
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={constraintToggles.differ_group}
                  onChange={(e) => updateConstraintToggle('differ_group', e.target.checked)}
                  className="w-4 h-4 accent-primary mt-0.5 shrink-0"
                />
                <span className="flex flex-col sm:flex-row sm:items-center sm:gap-3">
                  <span className="text-sm font-medium">{CONSTRAINT_DEFS.prev_group_same.label}</span>
                  <span className="text-xs text-slate-400">{CONSTRAINT_DEFS.prev_group_same.settingDescription}</span>
                </span>
              </label>
            </div>
          </div>

        </section>}

        <NextStepBar
          href="/solve"
          label="次へ: 実行"
          note="条件の設定が済んだら、実行ステップで配置を計算します。"
        />
      </div>
      <HelpPanel
        title="使い方"
        steps={[
          '「座席・班設定」: 座席数、前後配慮エリアの範囲指定、班レイアウトの設定を行えます',
          '「性別配置設定」: 座席ごとに男女の配置を指定できます',
          '「固定・隣接設定」: 座席の固定や近づけたい・近づけたくない児童・生徒の組み合わせを指定できます',
          '「班分散グループ」: 班長など特定の児童・生徒を各班に分散させる設定ができます',
          '「前回座席」: 前回の座席配置を確認・編集できます',
          '「最適化オプション」: 性別バランスや前回座席考慮などのオプションを設定できます',
        ]}
        tips={[
          '最適化オプション以外の設定は必ず守るべき条件として扱い、条件に合わない配置は許容しません。',
          '班分散グループでは、グループ内の児童・生徒が別々の班に配置されるよう制約できます。グループ人数が班数を超えると解なしになります。',
          '隣接禁止では、近づけたくない組み合わせを指定できます。周囲8席の禁止と、同じ班の禁止の2種類を指定できます。',
          '隣接固定では、前後や左右など指定した位置関係で近づけたい組み合わせを指定できます。',
          '前回座席は、前回のデータがある場合は自動で読み込まれます。手動で入力することも可能です。',
        ]}
      />
    </div>
  )
}
