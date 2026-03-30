import { render, screen } from '@testing-library/react'
import UseCaseCorporateTrainingPage from '../UseCaseCorporateTrainingPage'

describe('UseCaseCorporateTrainingPage', () => {
  describe('Hero section', () => {
    it('renders hero title', () => {
      render(<UseCaseCorporateTrainingPage />)
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
        'useCases.corporateTraining.hero.title'
      )
    })

    it('renders hero subtitle', () => {
      render(<UseCaseCorporateTrainingPage />)
      expect(screen.getByText('useCases.corporateTraining.hero.subtitle')).toBeInTheDocument()
    })

    it('renders signup CTA link pointing to /signup', () => {
      render(<UseCaseCorporateTrainingPage />)
      const signupLinks = screen.getAllByText('useCases.corporateTraining.hero.ctaSignup')
      expect(signupLinks.length).toBeGreaterThan(0)
      expect(signupLinks[0].closest('a')).toHaveAttribute('href', '/signup')
    })

    it('renders API docs CTA link pointing to /docs', () => {
      render(<UseCaseCorporateTrainingPage />)
      const apiDocsLinks = screen.getAllByText('useCases.corporateTraining.hero.ctaApiDocs')
      expect(apiDocsLinks.length).toBeGreaterThan(0)
      expect(apiDocsLinks[0].closest('a')).toHaveAttribute('href', '/docs')
    })
  })

  describe('Problems section', () => {
    it('renders problems section title', () => {
      render(<UseCaseCorporateTrainingPage />)
      expect(screen.getByText('useCases.corporateTraining.problems.title')).toBeInTheDocument()
    })

    it('renders tooMany problem', () => {
      render(<UseCaseCorporateTrainingPage />)
      expect(screen.getByText('useCases.corporateTraining.problems.tooMany.problem')).toBeInTheDocument()
      expect(screen.getByText('useCases.corporateTraining.problems.tooMany.solution')).toBeInTheDocument()
    })

    it('renders noRecord problem', () => {
      render(<UseCaseCorporateTrainingPage />)
      expect(screen.getByText('useCases.corporateTraining.problems.noRecord.problem')).toBeInTheDocument()
      expect(screen.getByText('useCases.corporateTraining.problems.noRecord.solution')).toBeInTheDocument()
    })

    it('renders newHire problem', () => {
      render(<UseCaseCorporateTrainingPage />)
      expect(screen.getByText('useCases.corporateTraining.problems.newHire.problem')).toBeInTheDocument()
      expect(screen.getByText('useCases.corporateTraining.problems.newHire.solution')).toBeInTheDocument()
    })

    it('renders highCost problem', () => {
      render(<UseCaseCorporateTrainingPage />)
      expect(screen.getByText('useCases.corporateTraining.problems.highCost.problem')).toBeInTheDocument()
      expect(screen.getByText('useCases.corporateTraining.problems.highCost.solution')).toBeInTheDocument()
    })
  })

  describe('Use cases section', () => {
    it('renders use cases section title', () => {
      render(<UseCaseCorporateTrainingPage />)
      expect(screen.getByText('useCases.corporateTraining.useCases.title')).toBeInTheDocument()
    })

    it('renders onboarding use case', () => {
      render(<UseCaseCorporateTrainingPage />)
      expect(screen.getByText('useCases.corporateTraining.useCases.onboarding.title')).toBeInTheDocument()
      expect(screen.getByText('useCases.corporateTraining.useCases.onboarding.description')).toBeInTheDocument()
    })

    it('renders compliance use case', () => {
      render(<UseCaseCorporateTrainingPage />)
      expect(screen.getByText('useCases.corporateTraining.useCases.compliance.title')).toBeInTheDocument()
      expect(screen.getByText('useCases.corporateTraining.useCases.compliance.description')).toBeInTheDocument()
    })

    it('renders manual use case', () => {
      render(<UseCaseCorporateTrainingPage />)
      expect(screen.getByText('useCases.corporateTraining.useCases.manual.title')).toBeInTheDocument()
      expect(screen.getByText('useCases.corporateTraining.useCases.manual.description')).toBeInTheDocument()
    })

    it('renders seminar use case', () => {
      render(<UseCaseCorporateTrainingPage />)
      expect(screen.getByText('useCases.corporateTraining.useCases.seminar.title')).toBeInTheDocument()
      expect(screen.getByText('useCases.corporateTraining.useCases.seminar.description')).toBeInTheDocument()
    })
  })

  describe('API integration section', () => {
    it('renders API integration section title', () => {
      render(<UseCaseCorporateTrainingPage />)
      expect(screen.getByText('useCases.corporateTraining.api.title')).toBeInTheDocument()
    })

    it('renders slack integration', () => {
      render(<UseCaseCorporateTrainingPage />)
      expect(screen.getByText('useCases.corporateTraining.api.slack.title')).toBeInTheDocument()
      expect(screen.getByText('useCases.corporateTraining.api.slack.description')).toBeInTheDocument()
    })

    it('renders mcp integration', () => {
      render(<UseCaseCorporateTrainingPage />)
      expect(screen.getByText('useCases.corporateTraining.api.mcp.title')).toBeInTheDocument()
      expect(screen.getByText('useCases.corporateTraining.api.mcp.description')).toBeInTheDocument()
    })
  })

  describe('Bottom CTA section', () => {
    it('renders bottom CTA title', () => {
      render(<UseCaseCorporateTrainingPage />)
      expect(screen.getByText('useCases.corporateTraining.cta.title')).toBeInTheDocument()
    })

    it('renders bottom signup CTA link', () => {
      render(<UseCaseCorporateTrainingPage />)
      const signupLinks = screen.getAllByText('useCases.corporateTraining.hero.ctaSignup')
      expect(signupLinks.length).toBeGreaterThanOrEqual(2)
    })

    it('renders bottom API docs CTA link', () => {
      render(<UseCaseCorporateTrainingPage />)
      const apiDocsLinks = screen.getAllByText('useCases.corporateTraining.hero.ctaApiDocs')
      expect(apiDocsLinks.length).toBeGreaterThanOrEqual(2)
    })
  })

  describe('SEO', () => {
    it('sets document.title on mount', () => {
      render(<UseCaseCorporateTrainingPage />)
      expect(document.title).toBe('社内研修動画をAI検索 | VideoQ 企業研修向け')
    })

    it('injects FAQPage schema on mount', () => {
      render(<UseCaseCorporateTrainingPage />)
      const script = document.getElementById('faq-schema-corporate-training')
      expect(script).not.toBeNull()
      expect(script?.getAttribute('type')).toBe('application/ld+json')
      const json = JSON.parse(script?.textContent ?? '{}')
      expect(json['@type']).toBe('FAQPage')
      expect(json.mainEntity).toHaveLength(3)
    })

    it('restores document.title on unmount', () => {
      document.title = 'original title'
      const { unmount } = render(<UseCaseCorporateTrainingPage />)
      unmount()
      expect(document.title).toBe('original title')
    })

    it('sets canonical href to EN URL on mount (en locale)', () => {
      const link = document.createElement('link')
      link.rel = 'canonical'
      link.href = 'https://videoq.jp/'
      document.head.appendChild(link)

      render(<UseCaseCorporateTrainingPage />)
      expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(
        'https://videoq.jp/use-cases/corporate-training'
      )

      link.remove()
    })

    it('restores canonical href on unmount', () => {
      const link = document.createElement('link')
      link.rel = 'canonical'
      link.href = 'https://videoq.jp/'
      document.head.appendChild(link)

      const { unmount } = render(<UseCaseCorporateTrainingPage />)
      unmount()
      expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(
        'https://videoq.jp/'
      )

      link.remove()
    })

    it('sets og:url to EN URL on mount', () => {
      const meta = document.createElement('meta')
      meta.setAttribute('property', 'og:url')
      meta.setAttribute('content', 'https://videoq.jp/')
      document.head.appendChild(meta)

      render(<UseCaseCorporateTrainingPage />)
      expect(
        document.querySelector('meta[property="og:url"]')?.getAttribute('content')
      ).toBe('https://videoq.jp/use-cases/corporate-training')

      meta.remove()
    })

    it('restores og:url on unmount', () => {
      const meta = document.createElement('meta')
      meta.setAttribute('property', 'og:url')
      meta.setAttribute('content', 'https://videoq.jp/')
      document.head.appendChild(meta)

      const { unmount } = render(<UseCaseCorporateTrainingPage />)
      unmount()
      expect(
        document.querySelector('meta[property="og:url"]')?.getAttribute('content')
      ).toBe('https://videoq.jp/')

      meta.remove()
    })
  })
})
