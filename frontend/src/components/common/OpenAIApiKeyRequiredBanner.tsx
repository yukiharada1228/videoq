'use client';

import { Link } from '@/lib/i18n';
import { useTranslation } from 'react-i18next';

interface OpenAIApiKeyRequiredBannerProps {
  className?: string;
}

export function OpenAIApiKeyRequiredBanner({ className }: OpenAIApiKeyRequiredBannerProps) {
  const { t } = useTranslation();

  return (
    <div className={className ?? ''}>
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <div className="text-yellow-600 text-xl">⚠️</div>
          <div className="flex-1">
            <h3 className="font-semibold text-yellow-900 mb-1">
              {t('openaiApiKey.banner.title')}
            </h3>
            <p className="text-sm text-yellow-800 mb-2">
              {t('openaiApiKey.banner.message')}
            </p>
            <Link
              href="/settings"
              className="inline-flex items-center text-sm font-medium text-yellow-900 hover:text-yellow-700 underline"
            >
              {t('openaiApiKey.banner.settingsLink')}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

