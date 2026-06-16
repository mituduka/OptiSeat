import LegalPage from '@/components/LegalPage'
import { loadLegalDocument } from '@/lib/legal'

export const metadata = {
  title: 'プライバシーポリシー | OptiSeat',
  description: 'OptiSeat のプライバシーポリシー',
}

export default function PrivacyPage() {
  const markdown = loadLegalDocument('privacy')
  return <LegalPage title="プライバシーポリシー" markdown={markdown} />
}
