import { useTranslation } from 'react-i18next';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import type { EvaluationSummary } from '@/lib/api';

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
        <span className="font-medium text-gray-700">{label}</span>
        <span className="font-semibold text-gray-900">{formatPercent(value)}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-gray-100">
        <div className="h-full rounded-full bg-[#00652c]" style={{ width: `${percentage}%` }} />
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
        <h3 className="text-sm font-semibold text-gray-900">
          {t('dashboard.evaluation.title')}
        </h3>
        <div className="flex h-[180px] items-center justify-center rounded-lg border border-dashed border-gray-200 bg-gray-50/60 px-4 text-center text-sm text-gray-500">
          {t('dashboard.evaluation.empty')}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-gray-900">
          {t('dashboard.evaluation.title')}
        </h3>
        <span className="text-xs font-medium text-gray-500">
          {t('dashboard.evaluation.evaluatedCount', { count: summary.evaluated_count })}
        </span>
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
