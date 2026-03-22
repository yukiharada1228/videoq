import { render, screen } from '@testing-library/react'
import { LoadingSpinner } from '../LoadingSpinner'

describe('LoadingSpinner', () => {
  it('should render spinner', () => {
    const { container } = render(<LoadingSpinner />)

    expect(screen.getByRole('status')).toBeInTheDocument()
    const spinnerRing = container.querySelector('.loading-ring')
    expect(spinnerRing).toBeInTheDocument()
  })

  it('should display custom message', () => {
    render(<LoadingSpinner message="Loading data..." />)

    expect(screen.getByText('Loading data...')).toBeInTheDocument()
  })

  it('should not display message when not provided', () => {
    render(<LoadingSpinner />)

    expect(screen.getByText('Loading')).toBeInTheDocument()
  })
})
