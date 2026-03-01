import { useTranslation } from 'react-i18next';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';

interface FeedbackDonutChartProps {
  data: { good: number; bad: number; none: number };
}

const COLORS = ['#22c55e', '#ef4444', '#d1d5db'];

export function FeedbackDonutChart({ data }: FeedbackDonutChartProps) {
  const { t } = useTranslation();

  const chartData = [
    { name: t('dashboard.feedback.good'), value: data.good },
    { name: t('dashboard.feedback.bad'), value: data.bad },
    { name: t('dashboard.feedback.none'), value: data.none },
  ].filter((d) => d.value > 0);

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
            {chartData.map((entry, index) => {
              const originalIndex = entry.name === t('dashboard.feedback.good') ? 0
                : entry.name === t('dashboard.feedback.bad') ? 1 : 2;
              return <Cell key={index} fill={COLORS[originalIndex]} />;
            })}
          </Pie>
          <Tooltip />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
