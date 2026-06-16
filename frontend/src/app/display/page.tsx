'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useStore } from '@/lib/store'
import { useHasHydrated } from '@/hooks/useHasHydrated'
import { ArrowLeft, Download, FileText, PenLine } from 'lucide-react'
import SeatingResult from '@/components/SeatingResult'
import HelpPanel from '@/components/HelpPanel'
import PageHeader from '@/components/PageHeader'

export default function DisplayPage() {
  const router = useRouter()
  const {
    students,
    seat,
    groups,
    fixedConstraints,
    leaderGroups,
    finalizedAssignments,
    chartTitle,
    setChartTitle,
    openDataModal,
  } = useStore()

  const hydrated = useHasHydrated()

  const { numGroups } = seat

  const [isGenerating, setIsGenerating] = useState(false)
  const [pdfError, setPdfError] = useState<string | null>(null)

  const activeGroups = groups.filter((g) => g.groupId <= numGroups)

  async function handleDownloadPdf() {
    if (!finalizedAssignments) return
    setIsGenerating(true)
    setPdfError(null)
    const title = chartTitle.trim() || '座席表'
    try {
      // pdf-lib / フォントを遅延ロード（初期バンドルに含めない）
      const { generateSeatingPdf } = await import('@/lib/pdf/seatingPdf')
      const blob = await generateSeatingPdf({
        students,
        seat,
        groups: activeGroups,
        leaderGroups,
        assignments: finalizedAssignments,
        title,
      })
      const d = new Date()
      const dateStr =
        d.getFullYear().toString() +
        (d.getMonth() + 1).toString().padStart(2, '0') +
        d.getDate().toString().padStart(2, '0')
      // ファイル名に使えない文字のみ除去
      const safeTitle = title.replace(/[\\/:*?"<>|]/g, '') || '座席表'
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${safeTitle}${dateStr}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (e) {
      console.error('PDF生成に失敗しました', e)
      setPdfError('PDFの生成に失敗しました。時間をおいて再度お試しください。')
    } finally {
      setIsGenerating(false)
    }
  }

  const helpPanel = (
    <HelpPanel
      title="使い方"
      steps={[
        '確定された配置を確認',
        '「PDFをダウンロード」で座席表をPDFとして保存',
        '「データをエクスポート」でJSONとしてデータを保存',
        '「配置調整に戻る」で修正可能',
      ]}
      tips={[
        'PDFは端末の画面サイズによらず同じレイアウトで出力されます。PCでもスマホでも同じ座席表が得られます。',
        'エクスポートしたデータは、次回の利用時にインポートして復元できます。名簿や制約、今回確定した配置が自動で入力されるので便利です。',
      ]}
    />
  )

  // localStorage からのデータ復元が終わるまで描画しない（配置があるのに「確定された配置がありません」が一瞬見えるのを防ぐ）
  if (!hydrated) return null

  if (!finalizedAssignments) {
    return (
      <div className="flex flex-col gap-6 xl:flex-row xl:gap-8 xl:items-start">
        <div className="flex-1 min-w-0 space-y-6 xl:min-h-[600px]">
          <PageHeader step="/display" />
          <div className="card text-center py-12 px-4 text-ink-muted">
            <p className="text-lg font-bold text-ink-soft">確定された配置がありません</p>
            <p className="text-sm mt-2">
              ひとつ前の「配置調整」ステップで「配置確定」を選択してください。
            </p>
            <Link href="/finalize" className="btn btn-primary mt-5">
              <ArrowLeft size={16} />
              配置調整に戻る
            </Link>
          </div>
        </div>
        {helpPanel}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6 xl:flex-row xl:gap-8 xl:items-start">
      <div className="flex-1 min-w-0 space-y-6 xl:min-h-[600px]">
        <PageHeader
          step="/display"
          lead="確定された座席配置（読み取り専用）"
          actions={
            <>
              <button
                onClick={handleDownloadPdf}
                disabled={isGenerating}
                className="btn btn-primary w-full sm:w-auto"
              >
                <FileText size={15} />
                {isGenerating ? 'PDF生成中…' : 'PDFをダウンロード'}
              </button>
              <button
                onClick={() => openDataModal('export')}
                className="btn btn-quiet w-full sm:w-auto"
              >
                <Download size={15} />
                データをエクスポート
              </button>
              <button
                onClick={() => router.push('/finalize')}
                className="btn btn-quiet w-full sm:w-auto"
              >
                <PenLine size={15} />
                配置調整に戻る
              </button>
            </>
          }
        />

        {pdfError && (
          <p className="text-sm text-error-strong" role="alert">
            {pdfError}
          </p>
        )}

        <div className="card p-4 flex flex-col sm:flex-row sm:items-center gap-2">
          <label htmlFor="chart-title" className="text-sm text-slate-500 shrink-0">
            座席表のタイトル
          </label>
          <input
            id="chart-title"
            type="text"
            value={chartTitle}
            onChange={(e) => setChartTitle(e.target.value)}
            placeholder="座席表"
            maxLength={40}
            className="w-full sm:max-w-xs border rounded-lg px-3 py-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-primary"
          />
          <p className="text-xs text-slate-400 sm:ml-1">PDFの上部とファイル名に表示されます</p>
        </div>

        <SeatingResult
          numRows={seat.numRows}
          numCols={seat.numCols}
          frontRows={[]}
          assignments={finalizedAssignments}
          students={students}
          scoreBreakdown={null}
          scoreTotal={0}
          groups={activeGroups}
          fixedConstraints={fixedConstraints}
          leaderGroups={leaderGroups}
        />
      </div>
      {helpPanel}
    </div>
  )
}
