import { useTranslation } from 'react-i18next';
import { BarChart3 } from 'lucide-react';

export function DashboardEmptyState() {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <BarChart3 className="h-12 w-12 text-gray-300 mb-4" />
      <h3 className="text-lg font-medium text-gray-900 mb-1">
        {t('dashboard.empty.title')}
      </h3>
      <p className="text-sm text-gray-500 max-w-sm">
        {t('dashboard.empty.description')}
      </p>
    </div>
  );
}
