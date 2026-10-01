import { render, screen } from '@testing-library/react'
import { AnalyticsDashboard } from '../AnalyticsDashboard'

describe('AnalyticsDashboard', () => {
  it('keeps question analytics and feedback after retiring AI scoring', () => {
    render(<AnalyticsDashboard data={{
      summary: { total_questions: 24, date_range: { first: null, last: null } },
      time_series: [], feedback: { good: 1, bad: 0, none: 23 },
    }} isLoading={false} />)
    expect(screen.getByText(/dashboard.totalQuestions/)).toBeInTheDocument()
    expect(screen.queryByText('dashboard.evaluation.title')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'dashboard.feedback.title' })).toBeInTheDocument()
  })
})
