import fs from 'node:fs'
import path from 'node:path'

export type LegalSlug = 'terms' | 'privacy' | 'license'

export function loadLegalDocument(slug: LegalSlug): string {
  const file = path.resolve(process.cwd(), '..', 'legal', `${slug}.md`)
  return fs.readFileSync(file, 'utf-8')
}

export function loadRepoRootDocument(filename: string): string {
  const file = path.resolve(process.cwd(), '..', filename)
  return fs.readFileSync(file, 'utf-8')
}
