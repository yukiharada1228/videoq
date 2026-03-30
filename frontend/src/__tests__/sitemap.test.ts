// @vitest-environment node
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { describe, it, expect, beforeAll } from 'vitest'
import { DOMParser } from '@xmldom/xmldom'

const __dirname = dirname(fileURLToPath(import.meta.url))

const BASE = 'https://videoq.jp'

const SITEMAP_NS = 'http://www.sitemaps.org/schemas/sitemap/0.9'
const XHTML_NS = 'http://www.w3.org/1999/xhtml'

interface UrlEntry {
  loc: string
  lastmod: string | null
  changefreq: string | null
  priority: string | null
  alternates: { hreflang: string; href: string }[]
}

function parseSitemap(xml: string): UrlEntry[] {
  const doc = new DOMParser().parseFromString(xml, 'text/xml')
  const urlNodes = doc.getElementsByTagNameNS(SITEMAP_NS, 'url')
  const entries: UrlEntry[] = []

  for (let i = 0; i < urlNodes.length; i++) {
    const urlNode = urlNodes.item(i)!
    const loc =
      urlNode.getElementsByTagNameNS(SITEMAP_NS, 'loc').item(0)?.textContent ?? ''
    const lastmod =
      urlNode.getElementsByTagNameNS(SITEMAP_NS, 'lastmod').item(0)?.textContent ?? null
    const changefreq =
      urlNode.getElementsByTagNameNS(SITEMAP_NS, 'changefreq').item(0)?.textContent ?? null
    const priority =
      urlNode.getElementsByTagNameNS(SITEMAP_NS, 'priority').item(0)?.textContent ?? null

    const linkNodes = urlNode.getElementsByTagNameNS(XHTML_NS, 'link')
    const alternates: { hreflang: string; href: string }[] = []
    for (let j = 0; j < linkNodes.length; j++) {
      const linkNode = linkNodes.item(j)!
      const hreflang = linkNode.getAttribute('hreflang') ?? ''
      const href = linkNode.getAttribute('href') ?? ''
      alternates.push({ hreflang, href })
    }

    entries.push({ loc, lastmod, changefreq, priority, alternates })
  }

  return entries
}

describe('sitemap.xml', () => {
  let entries: UrlEntry[]
  let locs: Set<string>

  beforeAll(() => {
    const xml = readFileSync(
      resolve(__dirname, '../../public/sitemap.xml'),
      'utf-8'
    )
    entries = parseSitemap(xml)
    locs = new Set(entries.map((e) => e.loc))
  })

  // ── Required pages ──────────────────────────────────────────────────────────

  const REQUIRED_PAGES: [string, string][] = [
    // [en URL, ja URL]
    [`${BASE}/`, `${BASE}/ja/`],
    [`${BASE}/docs`, `${BASE}/ja/docs`],
    [`${BASE}/docs/auth`, `${BASE}/ja/docs/auth`],
    [`${BASE}/docs/videos`, `${BASE}/ja/docs/videos`],
    [`${BASE}/docs/chat`, `${BASE}/ja/docs/chat`],
    [`${BASE}/docs/openai`, `${BASE}/ja/docs/openai`],
    [`${BASE}/faq`, `${BASE}/ja/faq`],
    [`${BASE}/use-cases/education`, `${BASE}/ja/use-cases/education`],
    [`${BASE}/use-cases/corporate-training`, `${BASE}/ja/use-cases/corporate-training`],
    [`${BASE}/terms`, `${BASE}/ja/terms`],
    [`${BASE}/privacy`, `${BASE}/ja/privacy`],
    [`${BASE}/commercial-disclosure`, `${BASE}/ja/commercial-disclosure`],
  ]

  it.each(REQUIRED_PAGES)('contains %s', (enUrl) => {
    expect(locs).toContain(enUrl)
  })

  it.each(REQUIRED_PAGES)('contains %s (ja)', (_enUrl, jaUrl) => {
    expect(locs).toContain(jaUrl)
  })

  // ── changefreq and priority ─────────────────────────────────────────────────

  const LP_FAQ_PAGES = [
    `${BASE}/`,
    `${BASE}/ja/`,
    `${BASE}/faq`,
    `${BASE}/ja/faq`,
    `${BASE}/use-cases/education`,
    `${BASE}/ja/use-cases/education`,
    `${BASE}/use-cases/corporate-training`,
    `${BASE}/ja/use-cases/corporate-training`,
  ]

  const LEGAL_PAGES = [
    `${BASE}/terms`,
    `${BASE}/ja/terms`,
    `${BASE}/privacy`,
    `${BASE}/ja/privacy`,
    `${BASE}/commercial-disclosure`,
    `${BASE}/ja/commercial-disclosure`,
  ]

  it.each(LP_FAQ_PAGES)('%s has changefreq=monthly', (url) => {
    const entry = entries.find((e) => e.loc === url)
    expect(entry?.changefreq).toBe('monthly')
  })

  it.each(LP_FAQ_PAGES)('%s has priority=0.8', (url) => {
    const entry = entries.find((e) => e.loc === url)
    expect(entry?.priority).toBe('0.8')
  })

  it.each(LEGAL_PAGES)('%s has changefreq=yearly', (url) => {
    const entry = entries.find((e) => e.loc === url)
    expect(entry?.changefreq).toBe('yearly')
  })

  it.each(LEGAL_PAGES)('%s has priority=0.3', (url) => {
    const entry = entries.find((e) => e.loc === url)
    expect(entry?.priority).toBe('0.3')
  })

  // ── hreflang alternates ─────────────────────────────────────────────────────

  it.each(REQUIRED_PAGES)(
    '%s has hreflang en/ja/x-default alternates',
    (enUrl, jaUrl) => {
      const entry = entries.find((e) => e.loc === enUrl)!
      const hreflangs = entry.alternates.map((a) => a.hreflang)
      expect(hreflangs).toContain('en')
      expect(hreflangs).toContain('ja')
      expect(hreflangs).toContain('x-default')

      const enAlt = entry.alternates.find((a) => a.hreflang === 'en')
      const jaAlt = entry.alternates.find((a) => a.hreflang === 'ja')
      const defaultAlt = entry.alternates.find((a) => a.hreflang === 'x-default')

      expect(enAlt?.href).toBe(enUrl)
      expect(jaAlt?.href).toBe(jaUrl)
      expect(defaultAlt?.href).toBe(enUrl)
    }
  )

  // ── lastmod present ─────────────────────────────────────────────────────────

  it('every url has a lastmod date', () => {
    for (const entry of entries) {
      expect(entry.lastmod).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
  })

  // ── no duplicates ───────────────────────────────────────────────────────────

  it('has no duplicate locs', () => {
    const locArray = entries.map((e) => e.loc)
    expect(locArray.length).toBe(new Set(locArray).size)
  })
})
