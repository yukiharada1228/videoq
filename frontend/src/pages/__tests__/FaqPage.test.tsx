import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import FaqPage from '../FaqPage'
import { AppNav } from '@/components/layout/AppNav'

vi.mock('@/components/layout/AppNav', () => ({
  AppNav: vi.fn(() => null),
}))

describe('FaqPage', () => {
  afterEach(() => {
    globalThis.__setMockLanguage('en')
  })

  describe('Page structure', () => {
    it('renders page heading', () => {
      render(<FaqPage />)
      expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
    })

    it('renders at least 10 FAQ items', () => {
      render(<FaqPage />)
      const questions = screen.getAllByRole('button')
      expect(questions.length).toBeGreaterThanOrEqual(10)
    })

    it('renders all FAQ category headings', () => {
      render(<FaqPage />)
      expect(screen.getByText('faq.categories.pricing.title')).toBeInTheDocument()
      expect(screen.getByText('faq.categories.features.title')).toBeInTheDocument()
      expect(screen.getByText('faq.categories.education.title')).toBeInTheDocument()
      expect(screen.getByText('faq.categories.security.title')).toBeInTheDocument()
      expect(screen.getByText('faq.categories.technical.title')).toBeInTheDocument()
    })
  })

  describe('FAQ items content', () => {
    it('renders pricing FAQ questions', () => {
      render(<FaqPage />)
      expect(screen.getByText('faq.categories.pricing.items.free.question')).toBeInTheDocument()
      expect(screen.getByText('faq.categories.pricing.items.paidPlan.question')).toBeInTheDocument()
    })

    it('renders features FAQ questions', () => {
      render(<FaqPage />)
      expect(screen.getByText('faq.categories.features.items.formats.question')).toBeInTheDocument()
      expect(screen.getByText('faq.categories.features.items.accuracy.question')).toBeInTheDocument()
      expect(screen.getByText('faq.categories.features.items.japanese.question')).toBeInTheDocument()
      expect(screen.getByText('faq.categories.features.items.duration.question')).toBeInTheDocument()
    })

    it('renders education FAQ questions', () => {
      render(<FaqPage />)
      expect(screen.getByText('faq.categories.education.items.school.question')).toBeInTheDocument()
      expect(screen.getByText('faq.categories.education.items.sharing.question')).toBeInTheDocument()
      expect(screen.getByText('faq.categories.education.items.integration.question')).toBeInTheDocument()
    })

    it('renders security FAQ questions', () => {
      render(<FaqPage />)
      expect(screen.getByText('faq.categories.security.items.privacy.question')).toBeInTheDocument()
      expect(screen.getByText('faq.categories.security.items.storage.question')).toBeInTheDocument()
    })

    it('renders technical FAQ questions', () => {
      render(<FaqPage />)
      expect(screen.getByText('faq.categories.technical.items.api.question')).toBeInTheDocument()
      expect(screen.getByText('faq.categories.technical.items.llm.question')).toBeInTheDocument()
    })
  })

  describe('Accordion behavior', () => {
    it('answers are not visible by default', () => {
      render(<FaqPage />)
      expect(screen.queryByText('faq.categories.pricing.items.free.answer')).not.toBeInTheDocument()
    })

    it('shows answer when question is clicked', async () => {
      const user = userEvent.setup()
      render(<FaqPage />)
      const btn = screen.getByText('faq.categories.pricing.items.free.question')
      await user.click(btn)
      expect(screen.getByText('faq.categories.pricing.items.free.answer')).toBeInTheDocument()
    })

    it('hides answer when question is clicked again', async () => {
      const user = userEvent.setup()
      render(<FaqPage />)
      const btn = screen.getByText('faq.categories.pricing.items.free.question')
      await user.click(btn)
      await user.click(btn)
      expect(screen.queryByText('faq.categories.pricing.items.free.answer')).not.toBeInTheDocument()
    })
  })

  describe('SEO', () => {
    it('sets english metadata on mount', () => {
      globalThis.__setMockLanguage('en')
      render(<FaqPage />)
      expect(document.title).toBe('FAQ | VideoQ')
      expect(
        document.querySelector('meta[name="description"]')?.getAttribute('content')
      ).toBe('Frequently asked questions about VideoQ: pricing, features, security, and more.')
      expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(
        'https://videoq.jp/faq'
      )
    })

    it('sets japanese metadata on mount', () => {
      globalThis.__setMockLanguage('ja')
      render(<FaqPage />)
      expect(document.title).toBe('よくある質問 | VideoQ')
      expect(
        document.querySelector('meta[name="description"]')?.getAttribute('content')
      ).toBe('VideoQ のよくある質問。料金・機能・セキュリティ・API 連携などをまとめています。')
      expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(
        'https://videoq.jp/ja/faq'
      )
    })

    it('injects FAQPage JSON-LD schema with at least 10 entries', () => {
      render(<FaqPage />)
      const script = document.getElementById('faq-schema-faq')
      expect(script).not.toBeNull()
      expect(script?.getAttribute('type')).toBe('application/ld+json')
      const json = JSON.parse(script?.textContent ?? '{}')
      expect(json['@type']).toBe('FAQPage')
      expect(json['@context']).toBe('https://schema.org')
      expect(json.mainEntity.length).toBeGreaterThanOrEqual(10)
    })

    it('each schema entity has correct @type', () => {
      render(<FaqPage />)
      const script = document.getElementById('faq-schema-faq')
      const json = JSON.parse(script?.textContent ?? '{}')
      json.mainEntity.forEach((entity: { '@type': string; acceptedAnswer: { '@type': string } }) => {
        expect(entity['@type']).toBe('Question')
        expect(entity.acceptedAnswer['@type']).toBe('Answer')
      })
    })

    it('restores document.title on unmount', () => {
      document.title = 'original title'
      const { unmount } = render(<FaqPage />)
      unmount()
      expect(document.title).toBe('original title')
    })
  })

  describe('Navbar', () => {
    it('passes activePage="home" to AppNav', () => {
      render(<FaqPage />)
      expect(vi.mocked(AppNav)).toHaveBeenCalledWith(
        expect.objectContaining({ activePage: 'home' }),
        undefined,
      )
    })
  })
})
