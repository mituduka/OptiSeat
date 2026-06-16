import LegalPage from '@/components/LegalPage'
import { loadRepoRootDocument } from '@/lib/legal'

export const metadata = {
  title: '第三者ソフトウェア表示 | OptiSeat',
  description: 'OptiSeat が利用するオープンソースソフトウェアの一覧',
}

export default function NoticePage() {
  const markdown = loadRepoRootDocument('NOTICE.md')
  return <LegalPage title="第三者ソフトウェア表示" markdown={markdown} />
}
