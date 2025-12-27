import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiClient, type LLMSettings as LLMSettingsType } from '@/lib/api';
import { OpenAIApiKeySettings } from '@/components/settings/OpenAIApiKeySettings';
import { LLMSettings } from '@/components/settings/LLMSettings';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { PageLayout } from '@/components/layout/PageLayout';
import { useAuth } from '@/hooks/useAuth';
 
export default function SettingsPage() {
  const { t } = useTranslation();
  const { user, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [llmSettings, setLlmSettings] = useState<LLMSettingsType | null>(null);

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

  const fetchLLMSettings = useCallback(async () => {
    try {
      const settings = await apiClient.getLLMSettings();
      setLlmSettings(settings);
    } catch (error) {
      console.error('Failed to fetch LLM settings:', error);
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!user) return;
    void fetchApiKeyStatus();
    void fetchLLMSettings();
  }, [authLoading, user, fetchApiKeyStatus, fetchLLMSettings]);

  const handleApiKeyChange = () => {
    void fetchApiKeyStatus();
  };

  const handleLLMSettingsChange = () => {
    void fetchLLMSettings();
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
            {llmSettings && (
              <LLMSettings
                initialSettings={llmSettings}
                onSettingsChange={handleLLMSettingsChange}
              />
            )}
          </div>
        </div>
      )}
    </PageLayout>
  );
}

