import LegalPage from '@/components/LegalPage'
import { loadLegalDocument } from '@/lib/legal'

export const metadata = {
  title: '利用規約 | OptiSeat',
  description: 'OptiSeat の利用規約',
}

export default function TermsPage() {
  const markdown = loadLegalDocument('terms')
  return <LegalPage title="利用規約" markdown={markdown} />
}
