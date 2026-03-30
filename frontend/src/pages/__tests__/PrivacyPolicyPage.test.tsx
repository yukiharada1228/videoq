import { render } from '@testing-library/react'
import PrivacyPolicyPage from '../PrivacyPolicyPage'

describe('PrivacyPolicyPage SEO', () => {
  afterEach(() => {
    globalThis.__setMockLanguage('en')
  })

  it('sets english metadata', () => {
    globalThis.__setMockLanguage('en')
    render(<PrivacyPolicyPage />)

    expect(document.title).toBe('Privacy Policy | VideoQ')
    expect(document.querySelector('meta[name="description"]')?.getAttribute('content')).toBe(
      'Read how VideoQ collects, uses, stores, and protects personal data and uploaded content.'
    )
    expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(
      'https://videoq.jp/privacy'
    )
  })

  it('switches metadata for japanese locale', () => {
    globalThis.__setMockLanguage('ja')
    render(<PrivacyPolicyPage />)

    expect(document.title).toBe('プライバシーポリシー | VideoQ')
    expect(document.querySelector('meta[name="description"]')?.getAttribute('content')).toBe(
      'VideoQ が個人情報やアップロード動画をどのように収集・利用・保護するかを説明します。'
    )
    expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(
      'https://videoq.jp/ja/privacy'
    )
  })
})
