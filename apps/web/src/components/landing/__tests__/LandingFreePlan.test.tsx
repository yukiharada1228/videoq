import { render, screen } from '@testing-library/react'
import { LandingFreePlan } from '../LandingFreePlan'

describe('LandingFreePlan', () => {
  it('shows the limits returned by the pricing catalog, including changed limits', async () => {
    globalThis.__setTrpcHandler('billing.plans', () => [{
      code: 'free', interval: null, lookup_key: null, unit_amount: 0, currency: 'jpy',
      entitlements: { max_video_upload_size_mb: 150, storage_limit_gb: 2, processing_limit_minutes: 60, ai_answers_limit: 40 },
    }])
    render(<LandingFreePlan />)
    expect(await screen.findByText('landing.free.minutes {"minutes":60}')).toBeInTheDocument()
    expect(screen.getByText('landing.free.answerCount {"count":40}')).toBeInTheDocument()
    expect(screen.getByText('landing.free.gb {"gb":2}')).toBeInTheDocument()
    expect(screen.getByText('landing.free.mb {"mb":150}')).toBeInTheDocument()
  })

  it('keeps signup and pricing available if the catalog fails', async () => {
    globalThis.__setTrpcHandler('billing.plans', () => { throw new Error('Unavailable') })
    render(<LandingFreePlan />)
    expect(await screen.findByText('landing.free.unavailable')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /landing.start/ })).toHaveAttribute('href', '/signup')
    expect(screen.getByRole('link', { name: /landing.next.pricing.title/ })).toHaveAttribute('href', '/pricing')
    expect(screen.queryByText(/landing.free.minutes/)).not.toBeInTheDocument()
  })
})
