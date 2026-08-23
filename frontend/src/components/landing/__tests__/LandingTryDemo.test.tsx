import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { apiClient } from '@/lib/api'
import { LandingTryDemo } from '../LandingTryDemo'

describe('LandingTryDemo', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('loads the public linear algebra sample in the demo', async () => {
    render(<LandingTryDemo />)

    expect(screen.getByRole('heading', { level: 2, name: 'landing.demo.title' })).toBeInTheDocument()

    await waitFor(() => {
      expect(apiClient.getSharedGroup).toHaveBeenCalledWith('yobinori-linearalgebra')
    })

    expect(await screen.findByTitle('Sample lecture 1')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sample lecture 2' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'landing.demo.openFull' })).toHaveAttribute(
      'href',
      '/share/yobinori-linearalgebra',
    )
    expect(screen.getByRole('link', { name: 'landing.tryOwn' })).toHaveAttribute('href', '/signup')
  })

  it('switches to the deep learning sample', async () => {
    render(<LandingTryDemo />)

    await waitFor(() => {
      expect(apiClient.getSharedGroup).toHaveBeenCalledWith('yobinori-linearalgebra')
    })

    fireEvent.click(screen.getByRole('button', { name: 'landing.publicSamples.deepLearning.title' }))

    await waitFor(() => {
      expect(apiClient.getSharedGroup).toHaveBeenCalledWith('aicia-deeplearning')
    })

    expect(screen.getByRole('link', { name: 'landing.demo.openFull' })).toHaveAttribute(
      'href',
      '/share/aicia-deeplearning',
    )
  })

  it('shows a fallback when the public sample cannot be loaded', async () => {
    ;(apiClient.getSharedGroup as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('offline'))

    render(<LandingTryDemo />)

    expect(await screen.findByText('landing.demo.loadError')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'landing.demo.openFull' })).toHaveAttribute(
      'href',
      '/share/yobinori-linearalgebra',
    )
  })
})
