import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiClient } from '@/lib/api';
import { OpenAIApiKeySettings } from '@/components/settings/OpenAIApiKeySettings';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { PageLayout } from '@/components/layout/PageLayout';
import { useAuth } from '@/hooks/useAuth';
 
export default function SettingsPage() {
  const { t } = useTranslation();
  const { user, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [hasApiKey, setHasApiKey] = useState(false);
 
  const fetchApiKeyStatus = useCallback(async () => {
    try {
      const status = await apiClient.getOpenAIApiKeyStatus();
      setHasApiKey(status.has_api_key);
    } catch (error) {
      console.error('Failed to fetch API key status:', error);
    } finally {
      setLoading(false);
    }
  }, []);
 
  useEffect(() => {
    if (authLoading) return;
    if (!user) return;
    void fetchApiKeyStatus();
  }, [authLoading, user, fetchApiKeyStatus]);
 
  const handleApiKeyChange = () => {
    void fetchApiKeyStatus();
  };
 
  return (
    <PageLayout>
      {authLoading || loading ? (
        <LoadingSpinner />
      ) : (
        <div className="mx-auto w-full max-w-4xl">
          <h1 className="text-3xl font-bold mb-8">{t('settings.title')}</h1>
          <div className="space-y-6">
            <OpenAIApiKeySettings hasApiKey={hasApiKey} onApiKeyChange={handleApiKeyChange} />
          </div>
        </div>
      )}
    </PageLayout>
  );
}

