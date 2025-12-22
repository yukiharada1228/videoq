import { render, screen } from '@testing-library/react'
import { OpenAIApiKeyRequiredBanner } from '../OpenAIApiKeyRequiredBanner'

describe('OpenAIApiKeyRequiredBanner', () => {
  it('renders with empty className when not provided', () => {
    const { container } = render(<OpenAIApiKeyRequiredBanner />)

    expect(screen.getByText('openaiApiKey.banner.title')).toBeInTheDocument()
    expect(screen.getByText('openaiApiKey.banner.message')).toBeInTheDocument()

    const link = screen.getByRole('link', { name: 'openaiApiKey.banner.settingsLink' })
    expect(link).toHaveAttribute('href', '/settings')

    expect(container.firstChild).toHaveAttribute('class', '')
  })

  it('applies provided className', () => {
    const { container } = render(<OpenAIApiKeyRequiredBanner className="my-banner" />)

    expect(container.firstChild).toHaveClass('my-banner')
  })
})
