import { useTranslation } from 'react-i18next';
import type { ChatAnalytics, ChatAnalyticsKeywords, EvaluationSummary } from '@/lib/api';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { DashboardEmptyState } from './DashboardEmptyState';
import { DashboardPanel } from './DashboardPanel';
import { QuestionTimeSeriesChart } from './QuestionTimeSeriesChart';
import { FeedbackDonutChart } from './FeedbackDonutChart';
import { KeywordCloudChart } from './KeywordCloudChart';
import { EvaluationSummaryCard } from './EvaluationSummaryCard';

interface AnalyticsDashboardProps {
  data: ChatAnalytics | undefined;
  evaluationSummary?: EvaluationSummary;
  isLoading: boolean;
  isEvaluationLoading?: boolean;
  keywordsData?: ChatAnalyticsKeywords;
  isKeywordsLoading?: boolean;
}

export function AnalyticsDashboard({
  data,
  evaluationSummary,
  isLoading,
  isEvaluationLoading = false,
  keywordsData,
  isKeywordsLoading = false,
}: AnalyticsDashboardProps) {
  const { t } = useTranslation();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <LoadingSpinner />
      </div>
    );
  }

  if (!data || data.summary.total_questions === 0) {
    return <DashboardEmptyState />;
  }

  return (
    <div className="space-y-6">
      <div className="text-std-16N-170 text-solid-gray-700">
        <span className="font-medium">
          {t('dashboard.totalQuestions', { count: data.summary.total_questions })}
        </span>
        {data.summary.date_range.first && data.summary.date_range.last && (
          <span className="ml-3">
            {t('dashboard.dateRange', {
              first: data.summary.date_range.first.slice(0, 10),
              last: data.summary.date_range.last.slice(0, 10),
            })}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {data.time_series.length > 0 && (
          <DashboardPanel>
            <QuestionTimeSeriesChart data={data.time_series} />
          </DashboardPanel>
        )}

        <DashboardPanel>
          <FeedbackDonutChart data={data.feedback} />
        </DashboardPanel>

        <DashboardPanel>
          <EvaluationSummaryCard
            summary={evaluationSummary}
            isLoading={isEvaluationLoading}
          />
        </DashboardPanel>

        {isKeywordsLoading && (
          <DashboardPanel
            className="flex items-center justify-center"
            data-testid="keywords-loading"
          >
            <LoadingSpinner />
          </DashboardPanel>
        )}

        {!isKeywordsLoading && keywordsData && keywordsData.keywords.length > 0 && (
          <DashboardPanel>
            <KeywordCloudChart data={keywordsData.keywords} />
          </DashboardPanel>
        )}
      </div>
    </div>
  );
}
