'use client'

import { useState } from 'react'
import {
  DndContext,
  useSensor,
  useSensors,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { SquarePen, Trash2, Check } from 'lucide-react'
import ConfirmButton from '@/components/ConfirmButton'
import { useStore } from '@/lib/store'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import type { Gender, TagType, Student } from '@/types'

const TAG_LABELS: Record<TagType, string> = {
  front_preferred: '前側配慮',
  back_preferred: '後側配慮',
}

// ---------------------------------------------------------------------------
// ソータブル行コンポーネント
// ---------------------------------------------------------------------------

interface SortableRowProps {
  student: Student
  attendanceNumber: number
  editingId: number | null
  editName: string
  editGender: Gender
  editTags: TagType[]
  onStartEditing: (s: Student) => void
  onSaveEditing: () => void
  onCancelEditing: () => void
  onRemove: (id: number) => void
  index: number
  setEditName: (v: string) => void
  setEditGender: (v: Gender) => void
  setEditTags: (v: TagType[]) => void
  /** 'table' = PC のテーブル行 / 'card' = モバイルのカード行 */
  variant: 'table' | 'card'
}

function SortableRow({
  student: s,
  attendanceNumber,
  editingId,
  editName,
  editGender,
  editTags,
  onStartEditing,
  onSaveEditing,
  onCancelEditing,
  onRemove,
  index,
  setEditName,
  setEditGender,
  setEditTags,
  variant,
}: SortableRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: s.id, disabled: editingId === s.id })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  // -------------------------------------------------------------------------
  // モバイル: カード行（テーブルだと 6 列が iPhone 幅に収まらず折り返すため）
  // -------------------------------------------------------------------------
  if (variant === 'card') {
    if (s.id === editingId) {
      return (
        <div ref={setNodeRef} style={style} className="bg-blue-50 px-3 py-3 flex flex-col gap-3">
          <input
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            aria-label="氏名"
            className="border rounded-lg bg-white px-2 py-1.5 text-sm w-full focus:outline-hidden focus:ring-2 focus:ring-primary"
          />
          <div className="flex gap-4 text-sm">
            {(['male', 'female'] as Gender[]).map((g) => (
              <label key={g} className="flex items-center gap-1 cursor-pointer">
                <input
                  type="radio"
                  value={g}
                  checked={editGender === g}
                  onChange={() => setEditGender(g)}
                />
                {g === 'male' ? '男' : '女'}
              </label>
            ))}
          </div>
          <div className="flex flex-wrap gap-4 text-sm">
            {(['front_preferred', 'back_preferred'] as TagType[]).map((tag) => (
              <label key={tag} className="flex items-center gap-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={editTags.includes(tag)}
                  onChange={(e) =>
                    setEditTags(
                      e.target.checked
                        ? [...editTags, tag]
                        : editTags.filter((t) => t !== tag),
                    )
                  }
                />
                {TAG_LABELS[tag]}
              </label>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={onSaveEditing} className="btn btn-sm btn-primary">
              保存
            </button>
            <button onClick={onCancelEditing} className="btn btn-sm btn-quiet">
              キャンセル
            </button>
          </div>
        </div>
      )
    }

    return (
      <div ref={setNodeRef} style={style} className="flex items-center gap-1 px-3 py-2.5 bg-white">
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label="ドラッグして並べ替え"
          className="touch-none shrink-0 px-1 py-1 text-slate-300 hover:text-slate-500 cursor-grab active:cursor-grabbing"
        >
          <span aria-hidden="true">⠿</span>
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="font-medium text-ink truncate">{s.name}</span>
            <span className="shrink-0 text-xs text-slate-500">
              {s.gender === 'male' ? '男' : '女'}
            </span>
          </div>
          {s.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {s.tags.map((tag) => (
                <span
                  key={tag}
                  className="px-1.5 py-0.5 text-xs bg-amber-100 text-amber-800 rounded-sm"
                >
                  {TAG_LABELS[tag]}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => onStartEditing(s)}
            aria-label={`${s.name} を編集`}
            title="編集"
            className="p-2.5 text-slate-500 hover:text-primary hover:bg-primary-soft rounded-lg transition-colors"
          >
            <SquarePen size={16} />
          </button>
          <ConfirmButton
            onConfirm={() => onRemove(s.id)}
            aria-label={`${s.name} を削除`}
            title="削除"
            className="p-2.5 rounded-lg transition-colors"
            idleClassName="text-slate-500 hover:text-error-strong hover:bg-error-soft"
            confirmClassName="bg-error text-white hover:bg-error-strong"
            confirmChildren={<Check size={16} />}
          >
            <Trash2 size={16} />
          </ConfirmButton>
        </div>
      </div>
    )
  }

  // -------------------------------------------------------------------------
  // PC: テーブル行
  // -------------------------------------------------------------------------
  if (s.id === editingId) {
    return (
      <tr ref={setNodeRef} style={style} key={s.id} className="border-t border-slate-100 bg-blue-50">
        <td className="px-2 py-2 w-8"></td>
        <td className="hidden sm:table-cell px-3 py-2 text-slate-400">{attendanceNumber}</td>
        <td className="px-3 py-2">
          <input
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            className="border rounded-sm px-2 py-0.5 text-sm w-32"
          />
        </td>
        <td className="px-3 py-2">
          {(['male', 'female'] as Gender[]).map((g) => (
            <label key={g} className="mr-2 text-xs">
              <input
                type="radio"
                value={g}
                checked={editGender === g}
                onChange={() => setEditGender(g)}
                className="mr-1"
              />
              {g === 'male' ? '男' : '女'}
            </label>
          ))}
        </td>
        <td className="px-3 py-2">
          {(['front_preferred', 'back_preferred'] as TagType[]).map((tag) => (
            <label key={tag} className="mr-2 text-xs">
              <input
                type="checkbox"
                checked={editTags.includes(tag)}
                onChange={(e) =>
                  setEditTags(
                    e.target.checked
                      ? [...editTags, tag]
                      : editTags.filter((t) => t !== tag),
                  )
                }
                className="mr-1"
              />
              {TAG_LABELS[tag]}
            </label>
          ))}
        </td>
        <td className="px-3 py-2 text-right space-x-2 whitespace-nowrap">
          <button
            onClick={onSaveEditing}
            className="text-primary hover:text-primary-strong text-sm px-2 py-1.5"
          >
            保存
          </button>
          <button
            onClick={onCancelEditing}
            className="text-slate-500 hover:text-slate-700 text-sm px-2 py-1.5"
          >
            キャンセル
          </button>
        </td>
      </tr>
    )
  }

  return (
    <tr
      ref={setNodeRef}
      style={style}
      key={s.id}
      className="border-t border-slate-100 hover:bg-slate-50"
    >
      <td
        className="px-2 py-2 w-8 cursor-grab text-slate-300 hover:text-slate-500"
        {...attributes}
        {...listeners}
        title="ドラッグして並べ替え"
      >
        <span aria-hidden="true">⠿</span>
        <span className="sr-only">ドラッグして並べ替え</span>
      </td>
      <td className="hidden sm:table-cell px-3 py-2 text-slate-400">{attendanceNumber}</td>
      <td className="px-3 py-2 font-medium">{s.name}</td>
      <td className="px-3 py-2 text-slate-500">
        {s.gender === 'male' ? '男' : '女'}
      </td>
      <td className="px-3 py-2">
        <div className="flex gap-1 flex-wrap">
          {s.tags.map((tag) => (
            <span
              key={tag}
              className="px-1.5 py-0.5 text-xs bg-amber-100 text-amber-800 rounded-sm"
            >
              {TAG_LABELS[tag]}
            </span>
          ))}
        </div>
      </td>
      <td className="px-2 py-2 whitespace-nowrap">
        <div className="flex items-center justify-end gap-1">
          <button
            onClick={() => onStartEditing(s)}
            aria-label={`${s.name} を編集`}
            title="編集"
            className="p-2.5 text-slate-500 hover:text-primary hover:bg-primary-soft rounded-lg transition-colors"
          >
            <SquarePen size={16} />
          </button>
          <ConfirmButton
            onConfirm={() => onRemove(s.id)}
            aria-label={`${s.name} を削除`}
            title="削除"
            className="p-2.5 rounded-lg transition-colors"
            idleClassName="text-slate-500 hover:text-error-strong hover:bg-error-soft"
            confirmClassName="bg-error text-white hover:bg-error-strong"
            confirmChildren={<Check size={16} />}
          >
            <Trash2 size={16} />
          </ConfirmButton>
        </div>
      </td>
    </tr>
  )
}

// ---------------------------------------------------------------------------
// メインコンポーネント
// ---------------------------------------------------------------------------

export default function StudentTable() {
  const {
    students,
    addStudent,
    removeStudent,
    updateStudent,
    reorderStudents,
  } = useStore()
  const maxStudents = useStore((s) => s.maxStudents)
  // sm 未満はテーブルが収まらないためカード表示に切り替える（Tailwind の sm = 640px）
  const isWide = useMediaQuery('(min-width: 640px)')

  const [name, setName] = useState('')
  const [gender, setGender] = useState<Gender>('male')
  const [tags, setTags] = useState<TagType[]>([])
  const [error, setError] = useState<string | null>(null)

  // インライン編集用 state
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editName, setEditName] = useState('')
  const [editGender, setEditGender] = useState<Gender>('male')
  const [editTags, setEditTags] = useState<TagType[]>([])

  function startEditing(s: Student) {
    setEditingId(s.id)
    setEditName(s.name)
    setEditGender(s.gender)
    setEditTags(s.tags)
  }

  function saveEditing() {
    if (editingId === null) return
    updateStudent(editingId, { name: editName.trim() || editName, gender: editGender, tags: editTags })
    setEditingId(null)
  }

  function cancelEditing() {
    setEditingId(null)
  }

  const nextId =
    students.length === 0 ? 1 : Math.max(...students.map((s) => s.id)) + 1

  function toggleTag(tag: TagType) {
    setTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    )
  }

  function handleAdd() {
    const trimmed = name.trim()
    if (!trimmed) return
    if (students.length >= maxStudents) {
      setError(`登録数の上限（${maxStudents}名）に達しています`)
      return
    }
    setError(null)
    const student: Student = { id: nextId, name: trimmed, gender, tags }
    addStudent(student)
    setName('')
    setGender('male')
    setTags([])
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') handleAdd()
  }

  // DnD センサー設定
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
    // Enter/Space で並べ替え開始、矢印キーで移動（キーボード操作対応）
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const fromIndex = students.findIndex((s) => s.id === active.id)
    const toIndex = students.findIndex((s) => s.id === over.id)
    if (fromIndex !== -1 && toIndex !== -1) {
      reorderStudents(fromIndex, toIndex)
    }
  }

  return (
    <div className="flex flex-col gap-4 xl:flex-1 xl:min-h-0">
      {/* 追加フォーム */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-3 p-4 bg-canvas rounded-lg border border-line">
        <div className="w-full sm:flex-1 sm:min-w-0">
          <label htmlFor="student-name-input" className="block text-sm text-slate-500 mb-1">氏名</label>
          <input
            id="student-name-input"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder=""
            autoComplete="off"
            className="border rounded-lg bg-white px-2 py-1.5 text-sm w-full focus:outline-hidden focus:ring-2 focus:ring-primary"
          />
        </div>
        <div>
          <label className="block text-sm text-slate-500 mb-1">性別</label>
          <div className="flex gap-3 text-sm h-[34px] items-center">
            <label className="flex items-center gap-1 cursor-pointer">
              <input
                type="radio"
                name="gender"
                value="male"
                checked={gender === 'male'}
                onChange={() => setGender('male')}
              />
              男
            </label>
            <label className="flex items-center gap-1 cursor-pointer">
              <input
                type="radio"
                name="gender"
                value="female"
                checked={gender === 'female'}
                onChange={() => setGender('female')}
              />
              女
            </label>
          </div>
        </div>
        <div>
          <label className="block text-sm text-slate-500 mb-1">配慮事項</label>
          <div className="flex gap-3 text-sm h-[34px] items-center">
            {(Object.keys(TAG_LABELS) as TagType[]).map((tag) => (
              <label key={tag} className="flex items-center gap-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={tags.includes(tag)}
                  onChange={() => toggleTag(tag)}
                />
                {TAG_LABELS[tag]}
              </label>
            ))}
          </div>
        </div>
        <div className="w-full sm:w-auto">
          <span className="hidden sm:block text-xs text-transparent mb-1 select-none" aria-hidden="true">&nbsp;</span>
          <button
            onClick={handleAdd}
            disabled={!name.trim()}
            className="btn btn-sm btn-primary w-full sm:w-auto h-[34px] px-4"
          >
            追加
          </button>
        </div>
      </div>

      {error && (
        <div role="alert" className="bg-error-soft border border-error text-error-strong rounded-lg px-4 py-3 text-sm">
          {error}
        </div>
      )}

      {/* 名簿テーブル */}
      {students.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-8">
          名簿が登録されていません
        </p>
      ) : (
        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          <SortableContext
            items={students.map((s) => s.id)}
            strategy={verticalListSortingStrategy}
          >
            {isWide ? (
              // PC: テーブル表示
              <div className="overflow-auto xl:flex-1 xl:min-h-0 border rounded-sm">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-canvas text-slate-600">
                      <th scope="col" className="sticky top-0 z-10 bg-canvas w-8"></th>
                      <th scope="col" className="hidden sm:table-cell sticky top-0 z-10 bg-canvas text-left px-3 py-2 font-medium w-16 whitespace-nowrap">番号</th>
                      <th scope="col" className="sticky top-0 z-10 bg-canvas text-left px-3 py-2 font-medium">氏名</th>
                      <th scope="col" className="sticky top-0 z-10 bg-canvas text-left px-3 py-2 font-medium w-16">性別</th>
                      <th scope="col" className="sticky top-0 z-10 bg-canvas text-left px-3 py-2 font-medium">配慮事項</th>
                      <th scope="col" className="sticky top-0 z-10 bg-canvas w-32"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {students.map((s, index) => (
                      <SortableRow
                        key={s.id}
                        variant="table"
                        student={s}
                        attendanceNumber={index + 1}
                        index={index}
                        editingId={editingId}
                        editName={editName}
                        editGender={editGender}
                        editTags={editTags}
                        onStartEditing={startEditing}
                        onSaveEditing={saveEditing}
                        onCancelEditing={cancelEditing}
                        onRemove={removeStudent}
                        setEditName={setEditName}
                        setEditGender={setEditGender}
                        setEditTags={setEditTags}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              // モバイル: カード表示
              <div className="border rounded-lg divide-y divide-line overflow-hidden">
                {students.map((s, index) => (
                  <SortableRow
                    key={s.id}
                    variant="card"
                    student={s}
                    attendanceNumber={index + 1}
                    index={index}
                    editingId={editingId}
                    editName={editName}
                    editGender={editGender}
                    editTags={editTags}
                    onStartEditing={startEditing}
                    onSaveEditing={saveEditing}
                    onCancelEditing={cancelEditing}
                    onRemove={removeStudent}
                    setEditName={setEditName}
                    setEditGender={setEditGender}
                    setEditTags={setEditTags}
                  />
                ))}
              </div>
            )}
          </SortableContext>
        </DndContext>
      )}
    </div>
  )
}
