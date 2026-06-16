import Link from 'next/link'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'

export const REPO_URL = 'https://github.com/mituduka/OptiSeat'
const REPO_BLOB_BASE = `${REPO_URL}/blob/main`

const BUNDLED_OVERRIDES: Record<string, string> = {
  // legal/license.md からの参照
  '../LICENSE': '/LICENSE.txt',
  '../NOTICE.md': '/legal/notice',
  // NOTICE.md（リポジトリ直下）からの参照
  './legal/third-party/NotoSansJP-OFL.txt': '/third-party/NotoSansJP-OFL.txt',
}

function normalizeHref(href?: string): string | undefined {
  if (!href) return href
  if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('#') || href.startsWith('mailto:')) {
    return href
  }
  if (BUNDLED_OVERRIDES[href]) return BUNDLED_OVERRIDES[href]
  const sameDirMd = href.match(/^\.\/(terms|privacy|license)\.md$/)
  if (sameDirMd) return `/legal/${sameDirMd[1]}`
  if (href.startsWith('./')) {
    return `${REPO_BLOB_BASE}/legal/${href.slice(2)}`
  }
  if (href.startsWith('../')) {
    return `${REPO_BLOB_BASE}/${href.slice(3)}`
  }
  return href
}

const markdownComponents: Components = {
  h1: ({ children }) => (
    <h1 className="text-2xl md:text-3xl font-bold text-ink mt-0 mb-4">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="text-xl md:text-2xl font-semibold text-ink mt-8 mb-3 border-b border-line-soft pb-1">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-lg font-semibold text-ink mt-6 mb-2">{children}</h3>
  ),
  p: ({ children }) => <p className="text-ink-soft leading-relaxed my-3">{children}</p>,
  ul: ({ children }) => (
    <ul className="list-disc pl-6 my-3 space-y-1 text-ink-soft">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="list-decimal pl-6 my-3 space-y-1 text-ink-soft">{children}</ol>
  ),
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  a: ({ href, children }) => {
    const normalized = normalizeHref(href)
    const isExternal = normalized?.startsWith('http')
    return (
      <a
        href={normalized}
        className="text-primary hover:text-primary-strong underline"
        {...(isExternal ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      >
        {children}
      </a>
    )
  },
  blockquote: ({ children }) => (
    <blockquote className="border-l-4 border-line bg-canvas px-4 py-2 my-4 text-ink-soft text-sm">
      {children}
    </blockquote>
  ),
  code: ({ children }) => (
    <code className="bg-canvas text-ink px-1.5 py-0.5 rounded-sm text-sm font-mono">
      {children}
    </code>
  ),
  pre: ({ children }) => (
    <pre className="bg-ink text-white p-4 rounded-sm my-4 overflow-x-auto text-sm font-mono">
      {children}
    </pre>
  ),
  table: ({ children }) => (
    <div className="my-4 overflow-x-auto">
      <table className="min-w-full border border-line-soft text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-canvas">{children}</thead>,
  th: ({ children }) => (
    <th className="border border-line-soft px-3 py-2 text-left font-semibold text-ink">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border border-line-soft px-3 py-2 text-ink-soft align-top">{children}</td>
  ),
  hr: () => <hr className="my-6 border-line-soft" />,
  strong: ({ children }) => <strong className="font-semibold text-ink">{children}</strong>,
}

interface LegalPageProps {
  title: string
  markdown: string
  appendix?: React.ReactNode
}

export default function LegalPage({ title, markdown, appendix }: LegalPageProps) {
  return (
    <div className="max-w-3xl mx-auto px-4 py-8 md:py-12">
      <nav className="text-sm mb-6">
        <Link href="/legal" className="text-primary hover:text-primary-strong underline">
          ← 法的情報トップへ戻る
        </Link>
      </nav>
      <article className="text-ink-soft">
        <h1 className="sr-only">{title}</h1>
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
          {markdown}
        </ReactMarkdown>
        {appendix}
      </article>
    </div>
  )
}
