import { render, screen } from '@testing-library/react'
import { LoadingState } from '../LoadingState'

// Mock i18n
jest.mock('@/i18n/config', () => ({
  initI18n: () => ({
    t: (key: string) => key,
  }),
}))

describe('LoadingState', () => {
  it('should render loading spinner when isLoading is true', () => {
    const { container } = render(
      <LoadingState isLoading={true} error={null}>
        <div>Content</div>
      </LoadingState>
    )
    
    // Check for spinner element
    const spinner = container.querySelector('.animate-spin')
    expect(spinner).toBeInTheDocument()
    expect(screen.queryByText('Content')).not.toBeInTheDocument()
  })

  it('should render error message when error is provided', () => {
    render(
      <LoadingState isLoading={false} error="Error message">
        <div>Content</div>
      </LoadingState>
    )
    
    expect(screen.getByText('Error message')).toBeInTheDocument()
    expect(screen.queryByText('Content')).not.toBeInTheDocument()
  })

  it('should render children when not loading and no error', () => {
    render(
      <LoadingState isLoading={false} error={null}>
        <div>Content</div>
      </LoadingState>
    )
    
    expect(screen.getByText('Content')).toBeInTheDocument()
    expect(screen.queryByText('common.loading')).not.toBeInTheDocument()
  })

  it('should use custom loading message when provided', () => {
    const { container } = render(
      <LoadingState isLoading={true} error={null} loadingMessage="Loading...">
        <div>Content</div>
      </LoadingState>
    )
    
    // Check for spinner element (message is passed to LoadingSpinner)
    const spinner = container.querySelector('.animate-spin')
    expect(spinner).toBeInTheDocument()
  })

  it('should use custom error message when provided', () => {
    render(
      <LoadingState isLoading={false} error="Error" errorMessage="Custom error">
        <div>Content</div>
      </LoadingState>
    )
    
    expect(screen.getByText('Custom error')).toBeInTheDocument()
  })

  it('should use error prop when errorMessage is not provided', () => {
    render(
      <LoadingState isLoading={false} error="Error message">
        <div>Content</div>
      </LoadingState>
    )
    
    expect(screen.getByText('Error message')).toBeInTheDocument()
  })

  it('should render full screen loading when fullScreen is true', () => {
    const { container } = render(
      <LoadingState isLoading={true} error={null} fullScreen={true}>
        <div>Content</div>
      </LoadingState>
    )
    
    const loadingContainer = container.querySelector('.min-h-screen')
    expect(loadingContainer).toBeInTheDocument()
  })

  it('should render inline loading when fullScreen is false', () => {
    const { container } = render(
      <LoadingState isLoading={true} error={null} fullScreen={false}>
        <div>Content</div>
      </LoadingState>
    )
    
    const loadingContainer = container.querySelector('.h-64')
    expect(loadingContainer).toBeInTheDocument()
  })
})

