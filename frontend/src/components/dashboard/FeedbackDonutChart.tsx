import { useTranslation } from 'react-i18next';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';

interface FeedbackDonutChartProps {
  data: { good: number; bad: number; none: number };
}

const FEEDBACK_ITEMS = [
  { key: 'good' as const, color: '#22c55e' },
  { key: 'bad' as const, color: '#ef4444' },
  { key: 'none' as const, color: '#d1d5db' },
];

export function FeedbackDonutChart({ data }: FeedbackDonutChartProps) {
  const { t } = useTranslation();

  const chartData = FEEDBACK_ITEMS
    .filter(({ key }) => data[key] > 0)
    .map(({ key, color }) => ({
      name: t(`dashboard.feedback.${key}`),
      value: data[key],
      color,
    }));

  if (chartData.length === 0) return null;

  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-900 mb-3">
        {t('dashboard.feedback.title')}
      </h3>
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            innerRadius={50}
            outerRadius={80}
            paddingAngle={2}
            dataKey="value"
          >
            {chartData.map((entry, index) => (
              <Cell key={index} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
