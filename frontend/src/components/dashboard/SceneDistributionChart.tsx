import { useTranslation } from 'react-i18next';

interface SceneDistributionChartProps {
  data: {
    video_id: number;
    title: string;
    start_time: string;
    end_time: string;
    question_count: number;
  }[];
}

function formatTime(time: string) {
  // "00:05:30" → "5:30"
  return time.replace(/^0+:/, '').replace(/^0/, '');
}

function truncateTitle(title: string, maxLen: number) {
  return title.length > maxLen ? title.slice(0, maxLen) + '…' : title;
}

export function SceneDistributionChart({ data }: SceneDistributionChartProps) {
  const { t } = useTranslation();

  const rankedScenes = [...data]
    .sort((a, b) => b.question_count - a.question_count)
    .map((item) => ({
      ...item,
      label: truncateTitle(item.title, 28),
    }));

  const totalQuestions = data.reduce((sum, item) => sum + item.question_count, 0);
  const maxCount = rankedScenes[0]?.question_count ?? 0;

  if (rankedScenes.length === 0) return null;

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-std-16B-170 text-solid-gray-800">
          {t('dashboard.sceneDistribution.title')}
        </h3>
        <span className="text-xs text-solid-gray-600">
          {t('dashboard.sceneDistribution.coverage', {
            count: rankedScenes.length,
          })}
        </span>
      </div>

      <div className="h-[220px] space-y-2 overflow-y-auto pr-1">
        {rankedScenes.map((item, index) => {
          const share = Math.round((item.question_count / totalQuestions) * 100);
          const width = maxCount > 0 ? Math.max((item.question_count / maxCount) * 100, 8) : 0;
          const isTop = index === 0;

          return (
            <div
              key={`${item.video_id}-${item.start_time}-${item.end_time}`}
              className={`rounded-8 border px-3 py-2 ${
                isTop
                  ? 'border-blue-200 bg-blue-50'
                  : 'border-solid-gray-200 bg-solid-gray-50'
              }`}
            >
              <div className="flex items-start gap-2.5">
                <div
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
                    isTop
                      ? 'bg-blue-900 text-white'
                      : 'border border-solid-gray-200 bg-white text-solid-gray-700'
                  }`}
                >
                  {index + 1}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium text-solid-gray-800">
                        {item.label}
                      </p>
                      <p className="text-[11px] text-solid-gray-600">
                        {t('dashboard.sceneDistribution.timeRange', {
                          start: formatTime(item.start_time),
                          end: formatTime(item.end_time),
                        })}
                      </p>
                    </div>

                    <div className="shrink-0 text-right">
                      <p className="text-[11px] font-semibold text-solid-gray-800">
                        {t('dashboard.sceneDistribution.questions', {
                          count: item.question_count,
                        })}
                      </p>
                      <p className="text-[11px] text-solid-gray-600">
                        {t('dashboard.sceneDistribution.share', {
                          percentage: `${share}%`,
                        })}
                      </p>
                    </div>
                  </div>

                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white">
                    <div
                      className={`h-full rounded-full ${isTop ? 'bg-blue-900' : 'bg-blue-400'}`}
                      style={{ width: `${width}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
