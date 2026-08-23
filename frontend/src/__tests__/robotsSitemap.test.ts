// @vitest-environment node
import { readFileSync } from 'fs'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'
import { describe, expect, it } from 'vitest'
import { PUBLIC_INDEX_PATHS, SITE_ORIGIN, absoluteUrl } from '@/lib/seo'

const __dirname = dirname(fileURLToPath(import.meta.url))

describe('robots.txt', () => {
  const content = readFileSync(resolve(__dirname, '../../public/robots.txt'), 'utf-8')

  it('declares a sitemap', () => {
    expect(content).toContain('Sitemap: https://videoq.jp/sitemap.xml')
  })

  it('disallows app and auth paths in both locales', () => {
    expect(content).toContain('Disallow: /videos')
    expect(content).toContain('Disallow: /en/videos')
    expect(content).toContain('Disallow: /login')
    expect(content).toContain('Disallow: /en/login')
    expect(content).toContain('Disallow: /settings')
    expect(content).toContain('Disallow: /admin')
  })

  it('disallows every share page', () => {
    expect(content).toContain('Disallow: /share/')
    expect(content).toContain('Disallow: /en/share/')
    expect(content).not.toContain('Allow: /share/')
    expect(content).not.toContain('Allow: /en/share/')
  })

  it('does not disallow the homepage', () => {
    expect(content).not.toMatch(/^Disallow: \/$/m)
  })
})

describe('sitemap.xml', () => {
  const content = readFileSync(resolve(__dirname, '../../public/sitemap.xml'), 'utf-8')

  it('is an XML urlset', () => {
    expect(content).toContain('<?xml version="1.0"')
    expect(content).toContain('<urlset')
  })

  it('lists every public index path in Japanese and English', () => {
    for (const path of PUBLIC_INDEX_PATHS) {
      expect(content).toContain(`<loc>${absoluteUrl(path, 'ja')}</loc>`)
      expect(content).toContain(`<loc>${absoluteUrl(path, 'en')}</loc>`)
    }
  })

  it('does not list app, auth, or share URLs', () => {
    expect(content).not.toContain(`${SITE_ORIGIN}/videos`)
    expect(content).not.toContain(`${SITE_ORIGIN}/login`)
    expect(content).not.toContain(`${SITE_ORIGIN}/settings`)
    expect(content).not.toContain(`${SITE_ORIGIN}/share/`)
  })

  it('does not keep the old /ja/ locale prefix', () => {
    expect(content).not.toContain(`${SITE_ORIGIN}/ja/`)
    expect(content).not.toContain(`${SITE_ORIGIN}/ja</`)
  })
})

describe('index.html crawler copy', () => {
  const html = readFileSync(resolve(__dirname, '../../index.html'), 'utf-8')

  it('points hreflang at Japanese default and /en/', () => {
    expect(html).toContain('hreflang="ja" href="https://videoq.jp/"')
    expect(html).toContain('hreflang="en" href="https://videoq.jp/en/"')
    expect(html).toContain('hreflang="x-default" href="https://videoq.jp/"')
    expect(html).not.toContain('https://videoq.jp/ja/')
  })

  it('keeps JSON-LD aligned with the lecture-search product', () => {
    expect(html).toContain('EducationalApplication')
    expect(html).toContain('AggregateOffer')
    expect(html).not.toContain('AI動画ナビゲーター')
    expect(html).not.toContain('PGVector')
    expect(html).not.toContain('Web, Docker')
  })
})
