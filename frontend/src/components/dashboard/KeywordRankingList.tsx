import { useTranslation } from 'react-i18next';

interface KeywordRankingListProps {
  data: { word: string; count: number }[];
}

export function KeywordRankingList({ data }: KeywordRankingListProps) {
  const { t } = useTranslation();

  const items = data.slice(0, 20);
  const maxCount = items.length > 0 ? items[0].count : 1;

  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-900 mb-3">
        {t('dashboard.keywords.title')}
      </h3>
      <div className="space-y-1.5">
        {items.map((item) => (
          <div key={item.word} className="flex items-center gap-2 text-sm">
            <span className="w-24 truncate text-gray-700 shrink-0">{item.word}</span>
            <div className="flex-1 bg-gray-100 rounded-full h-4 overflow-hidden">
              <div
                className="bg-blue-400 h-full rounded-full transition-all"
                style={{ width: `${(item.count / maxCount) * 100}%` }}
              />
            </div>
            <span className="text-gray-500 text-xs w-8 text-right shrink-0">{item.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
