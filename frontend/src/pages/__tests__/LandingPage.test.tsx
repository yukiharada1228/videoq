import { render, screen } from '@testing-library/react'
import LandingPage from '../LandingPage'

describe('LandingPage', () => {
  it('renders the product heading, not a login heading', () => {
    render(<LandingPage />)

    expect(screen.getByRole('heading', { level: 1, name: 'landing.title' })).toBeInTheDocument()
    expect(screen.queryByText('auth.login.title')).not.toBeInTheDocument()
  })

  it('links to signup, login, pricing, and docs', () => {
    render(<LandingPage />)

    expect(screen.getAllByRole('link', { name: 'landing.start' })[0]).toHaveAttribute('href', '/signup')
    expect(screen.getByRole('link', { name: 'landing.login' })).toHaveAttribute('href', '/login')
    expect(screen.getByRole('link', { name: /landing\.next\.pricing\.title/ })).toHaveAttribute(
      'href',
      '/pricing',
    )
    expect(screen.getByRole('link', { name: /landing\.next\.docs\.title/ })).toHaveAttribute(
      'href',
      '/docs',
    )
  })

  it('lets visitors use the public sample lectures in the demo', async () => {
    render(<LandingPage />)

    expect(screen.getByRole('heading', { level: 2, name: 'landing.demo.title' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'landing.publicSamples.linearAlgebra.title' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'landing.publicSamples.deepLearning.title' })).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: 'landing.demo.openFull' })).toHaveAttribute(
      'href',
      '/share/yobinori-linearalgebra',
    )
  })

  it('does not mention a public repository or society journal', () => {
    const { container } = render(<LandingPage />)
    expect(container.textContent).not.toMatch(/github/i)
    expect(container.textContent).not.toMatch(/情報処理学会|ipsj/i)
  })
})
