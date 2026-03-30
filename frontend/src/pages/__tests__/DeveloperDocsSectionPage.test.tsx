import React from 'react'
import { render } from '@testing-library/react'
import { vi } from 'vitest'
import DeveloperDocsSectionPage from '../DeveloperDocsSectionPage'

vi.mock('@/components/docs/ApiEndpointList', () => ({
  ApiEndpointList: () => null,
}))

vi.mock('@/components/docs/OpenAiSdkExampleList', () => ({
  OpenAiSdkExampleList: () => null,
}))

vi.mock('react-router-dom', () => {
  return {
    Navigate: () => null,
    useParams: () => ({ section: 'auth' }),
    Link: ({ children, to, ...props }: { children?: React.ReactNode; to?: string } & Record<string, unknown>) =>
      React.createElement('a', { href: to ?? '', ...props }, children),
  }
})

describe('DeveloperDocsSectionPage SEO', () => {
  afterEach(() => {
    globalThis.__setMockLanguage('en')
  })

  it('sets english metadata for the auth section', () => {
    globalThis.__setMockLanguage('en')
    render(<DeveloperDocsSectionPage />)

    expect(document.title).toBe('Authentication API | VideoQ Developer Docs')
    expect(document.querySelector('meta[name="description"]')?.getAttribute('content')).toBe(
      'How to issue and use VideoQ API keys for server-to-server authentication.'
    )
    expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(
      'https://videoq.jp/docs/auth'
    )
    expect(document.querySelector('meta[property="og:url"]')?.getAttribute('content')).toBe(
      'https://videoq.jp/docs/auth'
    )
  })

  it('switches metadata for japanese locale', () => {
    globalThis.__setMockLanguage('ja')
    render(<DeveloperDocsSectionPage />)

    expect(document.title).toBe('認証 API | VideoQ 開発者ドキュメント')
    expect(document.querySelector('meta[name="description"]')?.getAttribute('content')).toBe(
      'VideoQ の連携用 API キーを発行し、サーバー間認証で利用する方法。'
    )
    expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(
      'https://videoq.jp/ja/docs/auth'
    )
  })
})
