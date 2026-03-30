import { render, screen } from '@testing-library/react'
import UseCaseEducationPage from '../UseCaseEducationPage'

describe('UseCaseEducationPage', () => {
  describe('Hero section', () => {
    it('renders hero title', () => {
      render(<UseCaseEducationPage />)
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
        'useCases.education.hero.title'
      )
    })

    it('renders hero subtitle', () => {
      render(<UseCaseEducationPage />)
      expect(screen.getByText('useCases.education.hero.subtitle')).toBeInTheDocument()
    })

    it('renders signup CTA link pointing to /signup', () => {
      render(<UseCaseEducationPage />)
      const signupLinks = screen.getAllByText('useCases.education.hero.ctaSignup')
      expect(signupLinks.length).toBeGreaterThan(0)
      expect(signupLinks[0].closest('a')).toHaveAttribute('href', '/signup')
    })

    it('renders features CTA link pointing to #features', () => {
      render(<UseCaseEducationPage />)
      const featuresLink = screen.getByText('useCases.education.hero.ctaFeatures')
      expect(featuresLink.closest('a')).toHaveAttribute('href', '#features')
    })
  })

  describe('Problems section', () => {
    it('renders problems section title', () => {
      render(<UseCaseEducationPage />)
      expect(screen.getByText('useCases.education.problems.title')).toBeInTheDocument()
    })

    it('renders findContent problem', () => {
      render(<UseCaseEducationPage />)
      expect(screen.getByText('useCases.education.problems.findContent.problem')).toBeInTheDocument()
      expect(screen.getByText('useCases.education.problems.findContent.solution')).toBeInTheDocument()
    })

    it('renders repeatQuestions problem', () => {
      render(<UseCaseEducationPage />)
      expect(screen.getByText('useCases.education.problems.repeatQuestions.problem')).toBeInTheDocument()
      expect(screen.getByText('useCases.education.problems.repeatQuestions.solution')).toBeInTheDocument()
    })

    it('renders lostLectures problem', () => {
      render(<UseCaseEducationPage />)
      expect(screen.getByText('useCases.education.problems.lostLectures.problem')).toBeInTheDocument()
      expect(screen.getByText('useCases.education.problems.lostLectures.solution')).toBeInTheDocument()
    })
  })

  describe('Use cases section', () => {
    it('renders use cases section title', () => {
      render(<UseCaseEducationPage />)
      expect(screen.getByText('useCases.education.useCases.title')).toBeInTheDocument()
    })

    it('renders university use case', () => {
      render(<UseCaseEducationPage />)
      expect(screen.getByText('useCases.education.useCases.university.title')).toBeInTheDocument()
      expect(screen.getByText('useCases.education.useCases.university.description')).toBeInTheDocument()
    })

    it('renders school use case', () => {
      render(<UseCaseEducationPage />)
      expect(screen.getByText('useCases.education.useCases.school.title')).toBeInTheDocument()
      expect(screen.getByText('useCases.education.useCases.school.description')).toBeInTheDocument()
    })

    it('renders flipped classroom use case', () => {
      render(<UseCaseEducationPage />)
      expect(screen.getByText('useCases.education.useCases.flipped.title')).toBeInTheDocument()
      expect(screen.getByText('useCases.education.useCases.flipped.description')).toBeInTheDocument()
    })
  })

  describe('Features section', () => {
    it('renders features section title', () => {
      render(<UseCaseEducationPage />)
      expect(screen.getByText('useCases.education.features.title')).toBeInTheDocument()
    })

    it('renders groups feature', () => {
      render(<UseCaseEducationPage />)
      expect(screen.getByText('useCases.education.features.groups.title')).toBeInTheDocument()
      expect(screen.getByText('useCases.education.features.groups.description')).toBeInTheDocument()
    })

    it('renders sharing feature', () => {
      render(<UseCaseEducationPage />)
      expect(screen.getByText('useCases.education.features.sharing.title')).toBeInTheDocument()
      expect(screen.getByText('useCases.education.features.sharing.description')).toBeInTheDocument()
    })

    it('renders analytics feature', () => {
      render(<UseCaseEducationPage />)
      expect(screen.getByText('useCases.education.features.analytics.title')).toBeInTheDocument()
      expect(screen.getByText('useCases.education.features.analytics.description')).toBeInTheDocument()
    })
  })

  describe('Bottom CTA section', () => {
    it('renders bottom CTA title', () => {
      render(<UseCaseEducationPage />)
      expect(screen.getByText('useCases.education.cta.title')).toBeInTheDocument()
    })

    it('renders bottom signup CTA link', () => {
      render(<UseCaseEducationPage />)
      const signupLinks = screen.getAllByText('useCases.education.hero.ctaSignup')
      expect(signupLinks.length).toBeGreaterThanOrEqual(2)
    })
  })

  describe('SEO', () => {
    it('sets document.title on mount', () => {
      render(<UseCaseEducationPage />)
      expect(document.title).toBe('授業・講義動画を AI 検索 | VideoQ 教育向け')
    })

    it('injects FAQPage schema on mount', () => {
      render(<UseCaseEducationPage />)
      const script = document.getElementById('faq-schema-education')
      expect(script).not.toBeNull()
      expect(script?.getAttribute('type')).toBe('application/ld+json')
      const json = JSON.parse(script?.textContent ?? '{}')
      expect(json['@type']).toBe('FAQPage')
      expect(json.mainEntity).toHaveLength(3)
    })

    it('restores document.title on unmount', () => {
      document.title = 'original title'
      const { unmount } = render(<UseCaseEducationPage />)
      unmount()
      expect(document.title).toBe('original title')
    })
  })
})
