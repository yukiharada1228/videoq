import { render } from '@testing-library/react'
import DeveloperDocsPage from '../DeveloperDocsPage'

describe('DeveloperDocsPage SEO', () => {
  afterEach(() => {
    globalThis.__setMockLanguage('en')
  })

  it('sets english title, description, canonical, and og tags', () => {
    globalThis.__setMockLanguage('en')
    render(<DeveloperDocsPage />)

    expect(document.title).toBe('Developer Docs | VideoQ')
    expect(document.querySelector('meta[name="description"]')?.getAttribute('content')).toBe(
      'VideoQ API reference. Authentication, videos, chat, and OpenAI-compatible API docs.'
    )
    expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(
      'https://videoq.jp/docs'
    )
    expect(document.querySelector('meta[property="og:title"]')?.getAttribute('content')).toBe(
      'Developer Docs | VideoQ'
    )
    expect(document.querySelector('meta[property="og:description"]')?.getAttribute('content')).toBe(
      'VideoQ API reference. Authentication, videos, chat, and OpenAI-compatible API docs.'
    )
    expect(document.querySelector('meta[property="og:url"]')?.getAttribute('content')).toBe(
      'https://videoq.jp/docs'
    )
  })

  it('switches title and canonical for japanese locale', () => {
    globalThis.__setMockLanguage('ja')
    render(<DeveloperDocsPage />)

    expect(document.title).toBe('開発者ドキュメント | VideoQ')
    expect(document.querySelector('meta[name="description"]')?.getAttribute('content')).toBe(
      'VideoQ API リファレンス。認証、動画、チャット、OpenAI互換 API をまとめて確認できます。'
    )
    expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(
      'https://videoq.jp/ja/docs'
    )
    expect(document.querySelector('link[rel="alternate"][hreflang="en"]')?.getAttribute('href')).toBe(
      'https://videoq.jp/docs'
    )
    expect(document.querySelector('link[rel="alternate"][hreflang="ja"]')?.getAttribute('href')).toBe(
      'https://videoq.jp/ja/docs'
    )
  })
})
