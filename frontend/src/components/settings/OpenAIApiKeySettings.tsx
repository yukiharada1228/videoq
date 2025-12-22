'use client';

import { useState } from 'react';
import { apiClient } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { MessageAlert } from '@/components/common/MessageAlert';
import { useTranslation } from 'react-i18next';
import { setOpenAIApiKeyStatusCache } from '@/hooks/useOpenAIApiKeyStatus';

interface OpenAIApiKeySettingsProps {
  hasApiKey: boolean;
  onApiKeyChange: () => void;
}

export function OpenAIApiKeySettings({ hasApiKey: initialHasApiKey, onApiKeyChange }: OpenAIApiKeySettingsProps) {
  const { t } = useTranslation();
  const [apiKey, setApiKey] = useState('');
  const [hasApiKey, setHasApiKey] = useState(initialHasApiKey);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSave = async () => {
    if (!apiKey.trim()) {
      setError(t('settings.openaiApiKey.errorEmpty'));
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      await apiClient.setOpenAIApiKey({ api_key: apiKey });
      setSuccess(t('settings.openaiApiKey.successSaved'));
      setApiKey('');
      setHasApiKey(true);
      setOpenAIApiKeyStatusCache(true);
      onApiKeyChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('settings.openaiApiKey.errorSaving'));
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(t('settings.openaiApiKey.confirmDelete'))) {
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      await apiClient.deleteOpenAIApiKey();
      setSuccess(t('settings.openaiApiKey.successDeleted'));
      setHasApiKey(false);
      setOpenAIApiKeyStatusCache(false);
      onApiKeyChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('settings.openaiApiKey.errorDeleting'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('settings.openaiApiKey.title')}</CardTitle>
        <CardDescription>{t('settings.openaiApiKey.description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && <MessageAlert type="error" message={error} />}
        {success && <MessageAlert type="success" message={success} />}

        <div className="space-y-2">
          <Label htmlFor="api-key">{t('settings.openaiApiKey.apiKeyLabel')}</Label>
          <Input
            id="api-key"
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-..."
            disabled={loading}
          />
          <p className="text-sm text-muted-foreground">
            {hasApiKey ? t('settings.openaiApiKey.hasApiKeyMessage') : t('settings.openaiApiKey.noApiKeyMessage')}
          </p>
          <p className="text-sm text-muted-foreground">
            {t('settings.openaiApiKey.getApiKeyMessage')}{' '}
            <a
              href="https://platform.openai.com/api-keys"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              {t('settings.openaiApiKey.openaiPlatform')}
            </a>
          </p>
        </div>

        <div className="flex gap-2">
          <Button onClick={handleSave} disabled={loading || !apiKey.trim()}>
            {loading ? t('settings.openaiApiKey.saving') : t('settings.openaiApiKey.save')}
          </Button>
          {hasApiKey && (
            <Button onClick={handleDelete} variant="destructive" disabled={loading}>
              {loading ? t('settings.openaiApiKey.deleting') : t('settings.openaiApiKey.delete')}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
