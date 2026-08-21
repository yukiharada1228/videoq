// @vitest-environment node
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { describe, it, expect, beforeAll } from 'vitest'
import { docsSectionIds } from '@/lib/docs/sections'

const __dirname = dirname(fileURLToPath(import.meta.url))

const BASE = 'https://videoq.jp'

describe('llms.txt', () => {
  let content: string

  beforeAll(() => {
    content = readFileSync(
      resolve(__dirname, '../../public/llms.txt'),
      'utf-8'
    )
  })

  // ── Structure ────────────────────────────────────────────────────────────────

  it('starts with # VideoQ heading', () => {
    expect(content.trimStart()).toMatch(/^# VideoQ/)
  })

  it('has a blockquote description (> ...)', () => {
    expect(content).toMatch(/^>/m)
  })

  // ── Required sections ────────────────────────────────────────────────────────

  const REQUIRED_SECTIONS = [
    '## Key Features',
    '## Use Cases',
    '## Integrations',
    '## Documentation',
  ]

  it.each(REQUIRED_SECTIONS)('contains section "%s"', (section) => {
    expect(content).toContain(section)
  })

  // ── Use Cases section ────────────────────────────────────────────────────────

  it('Use Cases section mentions education', () => {
    const idx = content.indexOf('## Use Cases')
    const nextSection = content.indexOf('\n## ', idx + 1)
    const section = content.slice(idx, nextSection === -1 ? undefined : nextSection)
    expect(section.toLowerCase()).toMatch(/educat/)
  })

  it('Use Cases section mentions corporate training', () => {
    const idx = content.indexOf('## Use Cases')
    const nextSection = content.indexOf('\n## ', idx + 1)
    const section = content.slice(idx, nextSection === -1 ? undefined : nextSection)
    expect(section.toLowerCase()).toMatch(/corporate|training|企業/)
  })

  // ── Integrations section ─────────────────────────────────────────────────────

  it('Integrations section mentions OpenAI-compatible endpoint', () => {
    const idx = content.indexOf('## Integrations')
    const nextSection = content.indexOf('\n## ', idx + 1)
    const section = content.slice(idx, nextSection === -1 ? undefined : nextSection)
    expect(section).toMatch(/\/api\/v1\/chat\/completions/)
  })

  it('Integrations section mentions MCP', () => {
    const idx = content.indexOf('## Integrations')
    const nextSection = content.indexOf('\n## ', idx + 1)
    const section = content.slice(idx, nextSection === -1 ? undefined : nextSection)
    expect(section).toMatch(/MCP|Model Context Protocol/)
  })

  // ── Documentation links ──────────────────────────────────────────────────────

  // Every docs section the app renders must be discoverable from llms.txt.
  const REQUIRED_DOC_LINKS = docsSectionIds.map((id) => `${BASE}/docs/${id}`)

  it.each(REQUIRED_DOC_LINKS)('contains link to %s', (url) => {
    expect(content).toContain(url)
  })

  // ── No mixed Japanese/English on the same bullet line ───────────────────────

  it('does not mix Japanese and ASCII text on the same bullet line with a slash separator', () => {
    const lines = content.split('\n')
    const mixedLines = lines.filter((line) => {
      if (!line.startsWith('- ')) return false
      // Detect lines with Japanese characters AND " / " (slash-separated bilingual)
      const hasJapanese = /[\u3000-\u9fff\uff00-\uffef]/.test(line)
      const hasSlashSeparator = / \/ /.test(line)
      return hasJapanese && hasSlashSeparator
    })
    expect(mixedLines).toHaveLength(0)
  })
})
