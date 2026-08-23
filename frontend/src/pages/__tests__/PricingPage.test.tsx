import { render, screen } from '@testing-library/react'
import PricingPage from '../PricingPage'
import { apiClient } from '@/lib/api'

describe('PricingPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(apiClient.getBillingPlans as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        code: 'free',
        interval: null,
        lookup_key: null,
        amount_yen: 0,
        currency: 'jpy',
        entitlements: {
          max_video_upload_size_mb: 200,
          storage_limit_gb: 1,
          processing_limit_minutes: 45,
          ai_answers_limit: 30,
        },
      },
      {
        code: 'basic',
        interval: 'month',
        lookup_key: 'basic_monthly',
        amount_yen: 1480,
        currency: 'jpy',
        entitlements: {
          max_video_upload_size_mb: 1024,
          storage_limit_gb: 20,
          processing_limit_minutes: 300,
          ai_answers_limit: 500,
        },
      },
    ])
  })

  it('renders plan names from the catalog', async () => {
    render(<PricingPage />)
    expect(await screen.findByText('pricing.plans.free.name')).toBeInTheDocument()
    expect(screen.getByText('pricing.plans.basic.name')).toBeInTheDocument()
  })
})
