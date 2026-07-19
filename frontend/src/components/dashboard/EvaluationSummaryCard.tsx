import { useTranslation } from 'react-i18next';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import type { EvaluationSummary } from '@/lib/api';
import { Divider } from '@/components/ui/divider';
import { Heading, HeadingTitle } from '@/components/ui/heading';
import { DashboardChartTitle } from './DashboardPanel';

interface EvaluationSummaryCardProps {
  summary: EvaluationSummary | undefined;
  isLoading: boolean;
}

function formatPercent(value: number | null | undefined) {
  if (value == null) return '-';
  return `${Math.round(value * 100)}%`;
}

function MetricRow({ label, value }: { label: string; value: number | null | undefined }) {
  const percentage = value == null ? 0 : Math.max(0, Math.min(value * 100, 100));

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="font-medium text-solid-gray-700">{label}</span>
        <span className="font-semibold text-solid-gray-800">{formatPercent(value)}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-solid-gray-100">
        <div className="h-full rounded-full bg-key-900" style={{ width: `${percentage}%` }} />
      </div>
    </div>
  );
}

export function EvaluationSummaryCard({ summary, isLoading }: EvaluationSummaryCardProps) {
  const { t } = useTranslation();

  if (isLoading) {
    return (
      <div className="flex h-[220px] items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  if (!summary || summary.evaluated_count === 0) {
    return (
      <div className="space-y-3">
        <DashboardChartTitle>{t('dashboard.evaluation.title')}</DashboardChartTitle>
        <div className="flex h-[180px] items-center justify-center border border-dashed border-solid-gray-420 px-4 text-center text-sm text-solid-gray-600">
          {t('dashboard.evaluation.empty')}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <Heading size="16" hasChip>
            <HeadingTitle level="h3">{t('dashboard.evaluation.title')}</HeadingTitle>
          </Heading>
          <span className="shrink-0 text-xs font-medium text-solid-gray-600">
            {t('dashboard.evaluation.evaluatedCount', { count: summary.evaluated_count })}
          </span>
        </div>
        <Divider />
      </div>

      <div className="space-y-4">
        <MetricRow
          label={t('dashboard.evaluation.metrics.faithfulness')}
          value={summary.avg_faithfulness}
        />
        <MetricRow
          label={t('dashboard.evaluation.metrics.answerRelevancy')}
          value={summary.avg_answer_relevancy}
        />
        <MetricRow
          label={t('dashboard.evaluation.metrics.contextPrecision')}
          value={summary.avg_context_precision}
        />
      </div>
    </div>
  );
}
