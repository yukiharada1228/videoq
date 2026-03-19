import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link } from '@/lib/i18n';
import { apiClient } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import { useAuth } from '@/hooks/useAuth';

export function OpenAiKeyBanner() {
  const { user } = useAuth();
  const { t } = useTranslation();

  const { data } = useQuery({
    queryKey: queryKeys.auth.openAiApiKey,
    queryFn: () => apiClient.getOpenAiApiKeyStatus(),
    enabled: !!user,
  });

  if (!data || !data.is_required || data.has_key) {
    return null;
  }

  return (
    <div className="border-b border-amber-200 bg-amber-50 px-4 py-3">
      <div className="container mx-auto flex flex-wrap items-center justify-between gap-2 text-sm text-amber-800">
        <div>
          <span className="font-semibold">{t('openaiApiKey.banner.title')}</span>
          {' '}
          {t('openaiApiKey.banner.message')}
        </div>
        <Link
          to="/settings"
          className="shrink-0 font-medium underline hover:text-amber-900"
        >
          {t('openaiApiKey.banner.settingsLink')}
        </Link>
      </div>
    </div>
  );
}
