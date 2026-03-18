import { render, screen } from '@testing-library/react'
import { LoadingSpinner } from '../LoadingSpinner'

describe('LoadingSpinner', () => {
  it('should render spinner', () => {
    const { container } = render(<LoadingSpinner />)

    const spinner = container.querySelector('.animate-spin')
    expect(spinner).toBeInTheDocument()
  })

  it('should display custom message', () => {
    render(<LoadingSpinner message="Loading data..." />)

    expect(screen.getByText('Loading data...')).toBeInTheDocument()
  })

  it('should not display message when not provided', () => {
    const { container } = render(<LoadingSpinner />)

    const message = container.querySelector('p')
    expect(message).not.toBeInTheDocument()
  })
})
