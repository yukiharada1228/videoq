import { useTranslation } from 'react-i18next';
import type { ChatAnalytics, EvaluationSummary } from '@/lib/api';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { DashboardEmptyState } from './DashboardEmptyState';
import { QuestionTimeSeriesChart } from './QuestionTimeSeriesChart';
import { FeedbackDonutChart } from './FeedbackDonutChart';
import { KeywordCloudChart } from './KeywordCloudChart';
import { EvaluationSummaryCard } from './EvaluationSummaryCard';

interface AnalyticsDashboardProps {
  data: ChatAnalytics | undefined;
  evaluationSummary?: EvaluationSummary;
  isLoading: boolean;
  isEvaluationLoading?: boolean;
}

export function AnalyticsDashboard({
  data,
  evaluationSummary,
  isLoading,
  isEvaluationLoading = false,
}: AnalyticsDashboardProps) {
  const { t } = useTranslation();

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-16">
        <LoadingSpinner />
      </div>
    );
  }

  if (!data || data.summary.total_questions === 0) {
    return <DashboardEmptyState />;
  }

  return (
    <div className="space-y-6">
      <div className="text-sm text-gray-600">
        <span className="font-medium">{t('dashboard.totalQuestions', { count: data.summary.total_questions })}</span>
        {data.summary.date_range.first && data.summary.date_range.last && (
          <span className="ml-3">
            {t('dashboard.dateRange', {
              first: data.summary.date_range.first.slice(0, 10),
              last: data.summary.date_range.last.slice(0, 10),
            })}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {data.time_series.length > 0 && (
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <QuestionTimeSeriesChart data={data.time_series} />
          </div>
        )}

        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <FeedbackDonutChart data={data.feedback} />
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <EvaluationSummaryCard
            summary={evaluationSummary}
            isLoading={isEvaluationLoading}
          />
        </div>

        {data.keywords.length > 0 && (
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <KeywordCloudChart data={data.keywords} />
          </div>
        )}
      </div>
    </div>
  );
}
