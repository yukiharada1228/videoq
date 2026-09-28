import { render, screen } from '@testing-library/react'
import { LoadingSpinner } from '../LoadingSpinner'

describe('LoadingSpinner', () => {
  it('should render spinner', () => {
    render(<LoadingSpinner />)

    expect(screen.getByRole('progressbar')).toBeInTheDocument()
  })

  it('should display custom message', () => {
    render(<LoadingSpinner message="Loading data..." />)

    expect(screen.getByText('Loading data...')).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: 'Loading data...' }).textContent).toBe('Loading data...')
  })

  it('uses the translated default message when none is provided', () => {
    render(<LoadingSpinner />)

    expect(screen.getByRole('progressbar', { name: 'common.messages.loading' })).toHaveTextContent('common.messages.loading')
  })
})
