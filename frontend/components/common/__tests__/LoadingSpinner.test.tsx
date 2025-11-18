import { render, screen } from '@testing-library/react'
import { LoadingSpinner } from '../LoadingSpinner'

// Mock i18n
jest.mock('@/i18n/config', () => ({
  initI18n: () => ({
    t: (key: string) => key,
  }),
}))

describe('LoadingSpinner', () => {
  it('should render full screen spinner by default', () => {
    const { container } = render(<LoadingSpinner />)
    
    const spinner = container.querySelector('.min-h-screen')
    expect(spinner).toBeInTheDocument()
  })

  it('should render inline spinner when fullScreen is false', () => {
    const { container } = render(<LoadingSpinner fullScreen={false} />)
    
    const spinner = container.querySelector('.flex.justify-center')
    expect(spinner).toBeInTheDocument()
    expect(container.querySelector('.min-h-screen')).not.toBeInTheDocument()
  })

  it('should display custom message', () => {
    render(<LoadingSpinner message="Loading data..." />)
    
    expect(screen.getByText('Loading data...')).toBeInTheDocument()
  })

  it('should display default message', () => {
    render(<LoadingSpinner />)
    
    expect(screen.getByText('common.loading')).toBeInTheDocument()
  })
})

