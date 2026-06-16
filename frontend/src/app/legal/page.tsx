import Link from 'next/link'
import { REPO_URL } from '@/components/LegalPage'

export const metadata = {
  title: '法的情報 | OptiSeat',
  description: 'OptiSeat の利用規約・プライバシーポリシー・免責事項・ライセンス情報',
}

const docs = [
  {
    href: '/legal/terms',
    title: '利用規約',
    description: '本サービスの利用条件・禁止事項・準拠法など',
  },
  {
    href: '/legal/privacy',
    title: 'プライバシーポリシー',
    description: '取り扱う情報の範囲・保存場所（localStorage）・第三者提供など',
  },
  {
    href: '/legal/license',
    title: 'ライセンス情報',
    description: 'MIT License の日本語要約と全文',
  },
]

export default function LegalIndexPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-8 md:py-12">
      <h1 className="text-2xl md:text-3xl font-bold text-slate-900 mb-2">法的情報</h1>
      <p className="text-sm text-slate-500 mb-8">最終更新: 2026-06-17</p>

      <p className="text-slate-700 leading-relaxed mb-6">
        OptiSeat は OSS プロジェクトです。本サービスの利用にあたっては、以下の各書類の内容をご確認ください。
      </p>

      <ul className="space-y-4">
        {docs.map((doc) => (
          <li
            key={doc.href}
            className="border border-slate-200 rounded-lg p-4 hover:border-primary transition-colors"
          >
            <Link href={doc.href} className="block">
              <h2 className="text-lg font-semibold text-primary mb-1">{doc.title}</h2>
              <p className="text-sm text-slate-600">{doc.description}</p>
            </Link>
          </li>
        ))}
      </ul>

      <div className="mt-10 border-t border-slate-200 pt-6 text-sm text-slate-600 space-y-2">
        <p>
          ソースコード:{' '}
          <a
            href={REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:text-primary-strong underline"
          >
            {REPO_URL}
          </a>
        </p>
        <p>本サービスは MIT License のもとで配布されています。</p>
      </div>
    </div>
  )
}
