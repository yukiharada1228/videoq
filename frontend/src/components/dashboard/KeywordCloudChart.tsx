import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { WordCloud, type Word } from '@isoterik/react-word-cloud';

interface KeywordCloudChartProps {
  data: { word: string; count: number }[];
}

export function KeywordCloudChart({ data }: KeywordCloudChartProps) {
  const { t } = useTranslation();

  const words: Word[] = useMemo(
    () => data.slice(0, 30).map((item) => ({ text: item.word, value: item.count })),
    [data],
  );

  const maxValue = useMemo(() => Math.max(...words.map((w) => w.value), 1), [words]);
  const minValue = useMemo(() => Math.min(...words.map((w) => w.value), 1), [words]);

  const fontSize = useMemo(
    () => (word: Word) => {
      if (maxValue === minValue) return 24;
      const ratio = (word.value - minValue) / (maxValue - minValue);
      return 14 + ratio * 34;
    },
    [maxValue, minValue],
  );

  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-900 mb-3">
        {t('dashboard.keywords.title')}
      </h3>
      <div style={{ width: '100%', height: 250 }}>
        <WordCloud
          words={words}
          width={400}
          height={250}
          fontSize={fontSize}
          padding={2}
          rotate={() => 0}
        />
      </div>
    </div>
  );
}
