import { render } from '@testing-library/react'
import TermsPage from '../TermsPage'

describe('TermsPage SEO', () => {
  afterEach(() => {
    globalThis.__setMockLanguage('en')
  })

  it('sets english metadata', () => {
    globalThis.__setMockLanguage('en')
    render(<TermsPage />)

    expect(document.title).toBe('Terms of Service | VideoQ')
    expect(document.querySelector('meta[name="description"]')?.getAttribute('content')).toBe(
      'Read the VideoQ Terms of Service covering accounts, billing, acceptable use, and liability.'
    )
    expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(
      'https://videoq.jp/terms'
    )
  })

  it('switches metadata for japanese locale', () => {
    globalThis.__setMockLanguage('ja')
    render(<TermsPage />)

    expect(document.title).toBe('利用規約 | VideoQ')
    expect(document.querySelector('meta[name="description"]')?.getAttribute('content')).toBe(
      'VideoQ のアカウント、課金、禁止事項、免責事項などを定めた利用規約です。'
    )
    expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(
      'https://videoq.jp/ja/terms'
    )
  })
})
