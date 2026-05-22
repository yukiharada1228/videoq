import { render, screen } from '@testing-library/react'
import { AnalyticsDashboard } from '../AnalyticsDashboard'
import type { ChatAnalytics, ChatAnalyticsKeywords, EvaluationSummary } from '@/lib/api'

vi.mock('../KeywordCloudChart', () => ({
  KeywordCloudChart: ({ data }: { data: { word: string; count: number }[] }) => (
    <div data-testid="keyword-cloud">
      {data.map((kw) => (
        <span key={kw.word}>{kw.word}</span>
      ))}
    </div>
  ),
}))

const analytics: ChatAnalytics = {
  summary: {
    total_questions: 24,
    date_range: { first: '2026-04-01T00:00:00Z', last: '2026-04-22T00:00:00Z' },
  },
  scene_distribution: [
    {
      video_id: 1,
      title: 'Scene title',
      start_time: '00:00:10',
      end_time: '00:00:20',
      question_count: 3,
    },
  ],
  time_series: [],
  feedback: { good: 1, bad: 0, none: 23 },
}

const evaluationSummary: EvaluationSummary = {
  group_id: 1,
  evaluated_count: 24,
  avg_faithfulness: 0.86,
  avg_answer_relevancy: 0.81,
  avg_context_precision: 0.78,
}

const keywordsData: ChatAnalyticsKeywords = {
  keywords: [
    { word: 'machine learning', count: 5 },
    { word: 'python', count: 3 },
  ],
}

describe('AnalyticsDashboard', () => {
  it('replaces scene distribution with RAG evaluation summary', () => {
    render(
      <AnalyticsDashboard
        data={analytics}
        evaluationSummary={evaluationSummary}
        isLoading={false}
        isEvaluationLoading={false}
      />,
    )

    expect(screen.getByText('dashboard.evaluation.title')).toBeInTheDocument()
    expect(screen.getByText(/dashboard\.evaluation\.evaluatedCount/)).toBeInTheDocument()
    expect(screen.getByText('86%')).toBeInTheDocument()
    expect(screen.getByText('81%')).toBeInTheDocument()
    expect(screen.getByText('78%')).toBeInTheDocument()
    expect(screen.queryByText('dashboard.sceneDistribution.title')).not.toBeInTheDocument()
  })

  it('shows evaluation empty state when no answers are evaluated', () => {
    render(
      <AnalyticsDashboard
        data={analytics}
        evaluationSummary={{ ...evaluationSummary, evaluated_count: 0 }}
        isLoading={false}
        isEvaluationLoading={false}
      />,
    )

    expect(screen.getByText('dashboard.evaluation.empty')).toBeInTheDocument()
  })

  it('renders keyword cloud when keywords data is provided', () => {
    render(
      <AnalyticsDashboard
        data={analytics}
        evaluationSummary={evaluationSummary}
        isLoading={false}
        isEvaluationLoading={false}
        keywordsData={keywordsData}
        isKeywordsLoading={false}
      />,
    )

    expect(screen.getByText('machine learning')).toBeInTheDocument()
  })

  it('shows keywords loading spinner independently when keywords are loading', () => {
    render(
      <AnalyticsDashboard
        data={analytics}
        evaluationSummary={evaluationSummary}
        isLoading={false}
        isEvaluationLoading={false}
        isKeywordsLoading={true}
      />,
    )

    // Main dashboard content should still be visible
    expect(screen.getByText(/dashboard\.totalQuestions/)).toBeInTheDocument()
    // Keywords spinner should appear inside keywords card area
    expect(screen.getByTestId('keywords-loading')).toBeInTheDocument()
  })

  it('does not render keywords section when keywords data is undefined and not loading', () => {
    render(
      <AnalyticsDashboard
        data={analytics}
        evaluationSummary={evaluationSummary}
        isLoading={false}
        isEvaluationLoading={false}
        isKeywordsLoading={false}
      />,
    )

    // Main dashboard should be shown regardless
    expect(screen.getByText(/dashboard\.totalQuestions/)).toBeInTheDocument()
    // No keyword cloud when data is absent and not loading
    expect(screen.queryByTestId('keywords-loading')).not.toBeInTheDocument()
  })
})
