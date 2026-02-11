export function UsageBar({
  label,
  used,
  limit,
  formatValue,
}: {
  label: string;
  used: number;
  limit: number;
  formatValue: (used: number, limit: number) => string;
}) {
  const percent = limit > 0 ? Math.min((used / limit) * 100, 100) : 0;
  const overLimit = limit > 0 && used >= limit;

  const barColor =
    overLimit || percent >= 100
      ? 'bg-red-500'
      : percent >= 80
        ? 'bg-yellow-500'
        : 'bg-blue-500';

  return (
    <div>
      <div className="flex justify-between items-baseline mb-1">
        <span className="text-sm text-gray-600">{label}</span>
        <span className="text-sm font-medium text-gray-900">
          {formatValue(used, limit)}
        </span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2">
        <div
          className={`h-2 rounded-full transition-all ${barColor}`}
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="text-xs text-gray-400 mt-0.5 text-right">
        {Math.round(percent)}%
      </p>
    </div>
  );
}
