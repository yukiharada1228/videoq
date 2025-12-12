'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient } from '@/lib/api';
import { OpenAIApiKeySettings } from '@/components/settings/OpenAIApiKeySettings';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { useTranslations } from 'next-intl';
import { PageLayout } from '@/components/layout/PageLayout';

export default function SettingsPage() {
  const t = useTranslations('settings');
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [hasApiKey, setHasApiKey] = useState(false);

  const fetchApiKeyStatus = async () => {
    try {
      const isAuth = await apiClient.isAuthenticated();
      if (!isAuth) {
        router.push('/login');
        return;
      }

      const status = await apiClient.getOpenAIApiKeyStatus();
      setHasApiKey(status.has_api_key);
    } catch (error) {
      console.error('Failed to fetch API key status:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchApiKeyStatus();
  }, []);

  const handleApiKeyChange = () => {
    fetchApiKeyStatus();
  };

  return (
    <PageLayout>
      {loading ? (
        <LoadingSpinner />
      ) : (
        <div className="mx-auto w-full max-w-4xl">
          <h1 className="text-3xl font-bold mb-8">{t('title')}</h1>
          <div className="space-y-6">
            <OpenAIApiKeySettings hasApiKey={hasApiKey} onApiKeyChange={handleApiKeyChange} />
          </div>
        </div>
      )}
    </PageLayout>
  );
}
