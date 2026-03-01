import { useTranslation } from 'react-i18next';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

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

function buildLabel(title: string, startTime: string, maxLen: number) {
  const time = formatTime(startTime);
  const suffix = ` ${time}`;
  const available = maxLen - suffix.length;
  const truncated = title.length > available ? title.slice(0, available) + '…' : title;
  return truncated + suffix;
}

export function SceneDistributionChart({ data }: SceneDistributionChartProps) {
  const { t } = useTranslation();

  const chartData = data.slice(0, 10).map((item) => ({
    name: buildLabel(item.title, item.start_time, 20),
    fullName: `${item.title} (${item.start_time}–${item.end_time})`,
    count: item.question_count,
  }));

  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-900 mb-3">
        {t('dashboard.sceneDistribution.title')}
      </h3>
      <ResponsiveContainer width="100%" height={Math.max(200, chartData.length * 40)}>
        <BarChart data={chartData} layout="vertical" margin={{ left: 0, right: 20, top: 5, bottom: 5 }}>
          <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
          <YAxis
            type="category"
            dataKey="name"
            width={140}
            tick={{ fontSize: 11 }}
            tickLine={false}
          />
          <Tooltip
            formatter={(value) => [t('dashboard.sceneDistribution.questions', { count: Number(value) }), '']}
            labelFormatter={(_label, payload) => {
              const item = payload?.[0]?.payload as { fullName?: string } | undefined;
              return item?.fullName ?? '';
            }}
          />
          <Bar dataKey="count" radius={[0, 4, 4, 0]} label={false}>
            {chartData.map((_, index) => (
              <Cell key={index} fill={index === 0 ? '#3b82f6' : '#93c5fd'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
