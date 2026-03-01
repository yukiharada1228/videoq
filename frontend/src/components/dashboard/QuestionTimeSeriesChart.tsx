import { useTranslation } from 'react-i18next';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

interface QuestionTimeSeriesChartProps {
  data: { date: string; count: number }[];
}

export function QuestionTimeSeriesChart({ data }: QuestionTimeSeriesChartProps) {
  const { t } = useTranslation();

  const chartData = data.map((item) => ({
    date: item.date.slice(5), // MM-DD
    count: item.count,
  }));

  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-900 mb-3">
        {t('dashboard.timeSeries.title')}
      </h3>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={chartData} margin={{ left: 0, right: 20, top: 5, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" tick={{ fontSize: 11 }} />
          <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
          <Tooltip
            formatter={(value) => [value, t('dashboard.timeSeries.count')]}
          />
          <Line
            type="monotone"
            dataKey="count"
            stroke="#3b82f6"
            strokeWidth={2}
            dot={{ r: 3 }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
