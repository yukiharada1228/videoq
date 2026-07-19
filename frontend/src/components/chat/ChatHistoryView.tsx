import { BookOpen, Download, ThumbsDown, ThumbsUp } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ChatHistoryItem, ChatLogEvaluation } from '@/lib/api';
import { InlineSpinner } from '@/components/common/InlineSpinner';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { MessageBody } from '@/components/chat/MessageBody';
import { Button } from '@/components/ui/button';
import { ChipLabel } from '@/components/ui/chip-label';
import { Divider } from '@/components/ui/divider';

interface ChatHistoryViewProps {
  history: ChatHistoryItem[] | null;
  historyLoading: boolean;
  isExportingHistoryCsv: boolean;
  onExportHistoryCsv: () => Promise<void>;
  onVideoNavigate: (videoId: number, startTime: string) => void;
}

function formatEvaluationPercent(value: number | null | undefined) {
  if (value == null) return '-';
  return `${Math.round(value * 100)}%`;
}

function EvaluationMetric({
  label,
  value,
}: {
  label: string;
  value: number | null | undefined;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-solid-gray-600">{label}</span>
      <span className="font-semibold text-solid-gray-800">{formatEvaluationPercent(value)}</span>
    </div>
  );
}

function HistoryEvaluation({ evaluation }: { evaluation?: ChatLogEvaluation }) {
  const { t } = useTranslation();

  if (!evaluation) return null;

  if (evaluation.status === 'pending') {
    return (
      <div className="border border-solid-gray-420 bg-solid-gray-50 px-3 py-2 text-dns-14N-130 font-medium text-solid-gray-600">
        {t('chat.evaluation.status.pending')}
      </div>
    );
  }

  if (evaluation.status === 'failed') {
    return (
      <div className="border border-solid-gray-420 bg-solid-gray-50 px-3 py-2 text-dns-14N-130 font-medium text-solid-gray-600">
        {t('chat.evaluation.status.failed')}
      </div>
    );
  }

  return (
    <div className="border border-solid-gray-420 bg-solid-gray-50 px-3 py-2">
      <div className="mb-2 text-dns-14B-120 text-key-900">
        {t('chat.evaluation.status.completed')}
      </div>
      <div className="space-y-1.5 text-dns-14N-130">
        <EvaluationMetric
          label={t('chat.evaluation.metrics.faithfulness')}
          value={evaluation.faithfulness}
        />
        <EvaluationMetric
          label={t('chat.evaluation.metrics.answerRelevancy')}
          value={evaluation.answer_relevancy}
        />
        <EvaluationMetric
          label={t('chat.evaluation.metrics.contextPrecision')}
          value={evaluation.context_precision}
        />
      </div>
    </div>
  );
}

function HistoryItem({
  item,
  onVideoNavigate,
}: {
  item: ChatHistoryItem;
  onVideoNavigate: (videoId: number, startTime: string) => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="space-y-3">
      <div className="flex justify-center">
        <ChipLabel variant="filled-1" color="gray" className="min-h-0 text-oln-14N-100">
          {new Date(item.created_at).toLocaleString()}
        </ChipLabel>
      </div>

      <div className="flex flex-col items-end">
        <div className="max-w-[90%] border border-solid-gray-420 bg-solid-gray-50 px-4 py-3 text-std-16N-170 text-solid-gray-800">
          {item.question}
        </div>
      </div>

      <div className="flex flex-col items-start">
        <div className="max-w-[90%] space-y-2 border border-solid-gray-420 border-l-4 border-l-key-900 bg-white p-4 text-std-16N-170">
          <div className="flex items-center gap-2 text-dns-14B-120 font-bold text-key-900">
            <BookOpen className="h-3.5 w-3.5" />
            AI {t('chat.teacher')}
          </div>
          <MessageBody
            content={item.answer}
            citations={item.citations}
            onVideoNavigate={onVideoNavigate}
          />
          <HistoryEvaluation evaluation={item.evaluation} />
          {item.feedback && (
            <div className={`flex items-center gap-1 pt-1 text-dns-14B-120 ${item.feedback === 'good' ? 'text-key-900' : 'text-error-1'}`}>
              {item.feedback === 'good' ? <ThumbsUp className="w-3 h-3" /> : <ThumbsDown className="w-3 h-3" />}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function ChatHistoryView({
  history,
  historyLoading,
  isExportingHistoryCsv,
  onExportHistoryCsv,
  onVideoNavigate,
}: ChatHistoryViewProps) {
  const { t } = useTranslation();
  const historyCount = history?.length ?? 0;

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {!historyLoading && historyCount > 0 && (
        <div className="flex justify-end px-4 pt-3 shrink-0">
          <Button
            type="button"
            variant="text"
            size="xs"
            onClick={() => void onExportHistoryCsv()}
            disabled={isExportingHistoryCsv}
          >
            {isExportingHistoryCsv ? <InlineSpinner className="w-3 h-3 mr-1.5" /> : <Download className="w-3 h-3 mr-1.5" />}
            {t('chat.exportCsvShort', 'CSV')}
          </Button>
        </div>
      )}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {historyLoading && (
          <LoadingSpinner />
        )}
        {!historyLoading && historyCount === 0 && (
          <p className="text-std-16N-170 text-solid-gray-420 text-center py-8">{t('chat.historyEmpty')}</p>
        )}
        {!historyLoading && history?.map((item, i) => (
          <div key={item.id}>
            {i > 0 && <Divider className="mb-6" />}
            <HistoryItem item={item} onVideoNavigate={onVideoNavigate} />
          </div>
        ))}
      </div>
    </div>
  );
}
