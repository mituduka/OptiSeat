import LegalPage from '@/components/LegalPage'
import { loadLegalDocument, loadRepoRootDocument } from '@/lib/legal'

export const metadata = {
  title: 'ライセンス情報 | OptiSeat',
  description: 'OptiSeat のライセンス情報（MIT License）',
}

function embedNoticeAsSection(noticeMarkdown: string): string {
  let result = noticeMarkdown.replace(/^(##+) /gm, (_match, hashes: string) => `#${hashes} `)
  result = result.replace(/^# .+\n+/, '## 第三者ソフトウェア\n\n')
  return result
}

export default function LicensePage() {
  const license = loadLegalDocument('license')
  const notice = loadRepoRootDocument('NOTICE.md')
  const combined = `${license}\n\n${embedNoticeAsSection(notice)}`
  return <LegalPage title="ライセンス情報" markdown={combined} />
}
