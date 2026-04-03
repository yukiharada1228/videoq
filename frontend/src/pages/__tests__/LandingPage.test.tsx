import { render, screen } from '@testing-library/react'
import LandingPage from '../LandingPage'

describe('LandingPage', () => {
  describe('Hero section', () => {
    it('renders h1 with persona-focused copy', () => {
      render(<LandingPage />)
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
        'landing.hero.title'
      )
    })

    it('renders hero subtitle', () => {
      render(<LandingPage />)
      expect(screen.getByText('landing.hero.subtitle')).toBeInTheDocument()
    })

    it('renders signup CTA link pointing to /signup', () => {
      render(<LandingPage />)
      const signupLinks = screen.getAllByText('landing.hero.ctaSignup')
      expect(signupLinks.length).toBeGreaterThan(0)
      expect(signupLinks[0].closest('a')).toHaveAttribute('href', '/signup')
    })

    it('renders docs CTA link pointing to /docs', () => {
      render(<LandingPage />)
      const docsLink = screen.getByText('landing.hero.ctaDocs')
      expect(docsLink.closest('a')).toHaveAttribute('href', '/docs')
    })
  })

  describe('Personas section (こんな方に)', () => {
    it('renders personas section title', () => {
      render(<LandingPage />)
      expect(screen.getByText('landing.personas.title')).toBeInTheDocument()
    })

    it('renders educator persona card', () => {
      render(<LandingPage />)
      expect(screen.getByText('landing.personas.educator.title')).toBeInTheDocument()
      expect(screen.getByText('landing.personas.educator.description')).toBeInTheDocument()
    })

    it('renders educator CTA link pointing to /use-cases/education', () => {
      render(<LandingPage />)
      const link = screen.getByText('landing.personas.educator.ctaLink')
      expect(link.closest('a')).toHaveAttribute('href', '/use-cases/education')
    })

    it('renders corporate trainer persona card', () => {
      render(<LandingPage />)
      expect(screen.getByText('landing.personas.corporateTrainer.title')).toBeInTheDocument()
      expect(screen.getByText('landing.personas.corporateTrainer.description')).toBeInTheDocument()
    })

    it('renders corporate trainer CTA link pointing to /use-cases/corporate-training', () => {
      render(<LandingPage />)
      const link = screen.getByText('landing.personas.corporateTrainer.ctaLink')
      expect(link.closest('a')).toHaveAttribute('href', '/use-cases/corporate-training')
    })

    it('renders developer persona card', () => {
      render(<LandingPage />)
      expect(screen.getByText('landing.personas.developer.title')).toBeInTheDocument()
      expect(screen.getByText('landing.personas.developer.description')).toBeInTheDocument()
    })

    it('renders developer CTA link pointing to /docs', () => {
      render(<LandingPage />)
      const link = screen.getByText('landing.personas.developer.ctaLink')
      expect(link.closest('a')).toHaveAttribute('href', '/docs')
    })
  })

  describe('Features section', () => {
    it('renders features section title', () => {
      render(<LandingPage />)
      expect(screen.getByText('landing.features.title')).toBeInTheDocument()
    })

    it('renders transcription feature', () => {
      render(<LandingPage />)
      expect(screen.getByText('landing.features.transcription.title')).toBeInTheDocument()
      expect(screen.getByText('landing.features.transcription.description')).toBeInTheDocument()
    })

    it('renders chat feature', () => {
      render(<LandingPage />)
      expect(screen.getByText('landing.features.chat.title')).toBeInTheDocument()
      expect(screen.getByText('landing.features.chat.description')).toBeInTheDocument()
    })

    it('renders API feature', () => {
      render(<LandingPage />)
      expect(screen.getByText('landing.features.api.title')).toBeInTheDocument()
      expect(screen.getByText('landing.features.api.description')).toBeInTheDocument()
    })
  })

  describe('SEO', () => {
    afterEach(() => {
      globalThis.__setMockLanguage('en')
    })

    it('sets english title and description on mount', () => {
      globalThis.__setMockLanguage('en')
      render(<LandingPage />)
      expect(document.title).toBe(
        'Upload Your Video. AI Transcription & Instant Search for Education & Training | VideoQ'
      )
      expect(document.querySelector('meta[name="description"]')?.getAttribute('content')).toBe(
        'VideoQ is an AI video learning platform for education and corporate training. Upload your video and AI transcribes lectures, training sessions, and seminars. Search instantly in natural language. Free to start.'
      )
    })

    it('restores document.title on unmount', () => {
      document.title = 'original title'
      const { unmount } = render(<LandingPage />)
      unmount()
      expect(document.title).toBe('original title')
    })

    it('sets canonical href to / on mount (en locale)', () => {
      globalThis.__setMockLanguage('en')
      render(<LandingPage />)
      expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(
        'https://videoq.jp/'
      )
    })

    it('sets og:url to / on mount (en locale)', () => {
      globalThis.__setMockLanguage('en')
      render(<LandingPage />)
      expect(
        document.querySelector('meta[property="og:url"]')?.getAttribute('content')
      ).toBe('https://videoq.jp/')
    })

    it('switches to japanese metadata', () => {
      globalThis.__setMockLanguage('ja')
      render(<LandingPage />)
      expect(document.title).toBe(
        '動画をアップロードするだけ。教育・研修動画をAIで文字起こし→即検索 | VideoQ'
      )
      expect(document.querySelector('meta[name="description"]')?.getAttribute('content')).toBe(
        'VideoQは教育・企業研修向けのAI動画学習プラットフォームです。動画をアップロードするだけでAIが授業・研修・セミナーを文字起こし。自然言語で即検索できます。無料で始められます。'
      )
      expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(
        'https://videoq.jp/ja/'
      )
    })
  })
})
