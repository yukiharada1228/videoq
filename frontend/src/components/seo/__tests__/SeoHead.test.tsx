import { render } from '@testing-library/react'
import { SeoHead } from '../SeoHead'

const DEFAULT_OG_IMAGE = 'https://videoq.jp/og-image.png'

describe('SeoHead', () => {
  afterEach(() => {
    globalThis.__setMockLanguage('en')
  })

  describe('og:image', () => {
    it('outputs default og:image when ogImage prop is omitted', () => {
      render(<SeoHead title="Test" description="Test desc" path="/test" />)
      expect(
        document.querySelector('meta[property="og:image"]')?.getAttribute('content')
      ).toBe(DEFAULT_OG_IMAGE)
    })

    it('outputs custom og:image when ogImage prop is provided', () => {
      render(
        <SeoHead
          title="Test"
          description="Test desc"
          path="/test"
          ogImage="https://videoq.jp/custom.png"
        />
      )
      expect(
        document.querySelector('meta[property="og:image"]')?.getAttribute('content')
      ).toBe('https://videoq.jp/custom.png')
    })

    it('outputs og:image:width as 1200', () => {
      render(<SeoHead title="Test" description="Test desc" path="/test" />)
      expect(
        document.querySelector('meta[property="og:image:width"]')?.getAttribute('content')
      ).toBe('1200')
    })

    it('outputs og:image:height as 630', () => {
      render(<SeoHead title="Test" description="Test desc" path="/test" />)
      expect(
        document.querySelector('meta[property="og:image:height"]')?.getAttribute('content')
      ).toBe('630')
    })
  })

  describe('twitter:image', () => {
    it('outputs default twitter:image when ogImage prop is omitted', () => {
      render(<SeoHead title="Test" description="Test desc" path="/test" />)
      expect(
        document.querySelector('meta[name="twitter:image"]')?.getAttribute('content')
      ).toBe(DEFAULT_OG_IMAGE)
    })

    it('outputs custom twitter:image when ogImage prop is provided', () => {
      render(
        <SeoHead
          title="Test"
          description="Test desc"
          path="/test"
          ogImage="https://videoq.jp/custom.png"
        />
      )
      expect(
        document.querySelector('meta[name="twitter:image"]')?.getAttribute('content')
      ).toBe('https://videoq.jp/custom.png')
    })
  })

  describe('existing meta tags still work', () => {
    it('sets title', () => {
      render(<SeoHead title="My Page | VideoQ" description="desc" path="/my-page" />)
      expect(document.title).toBe('My Page | VideoQ')
    })

    it('sets og:title', () => {
      render(<SeoHead title="My Page | VideoQ" description="desc" path="/my-page" />)
      expect(
        document.querySelector('meta[property="og:title"]')?.getAttribute('content')
      ).toBe('My Page | VideoQ')
    })

    it('sets canonical for english locale', () => {
      globalThis.__setMockLanguage('en')
      render(<SeoHead title="Test" description="desc" path="/test" />)
      expect(
        document.querySelector('link[rel="canonical"]')?.getAttribute('href')
      ).toBe('https://videoq.jp/test')
    })

    it('sets canonical for japanese locale', () => {
      globalThis.__setMockLanguage('ja')
      render(<SeoHead title="Test" description="desc" path="/test" />)
      expect(
        document.querySelector('link[rel="canonical"]')?.getAttribute('href')
      ).toBe('https://videoq.jp/ja/test')
    })
  })
})
