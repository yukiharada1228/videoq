'use client';

import { useState } from 'react';
import { apiClient } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { MessageAlert } from '@/components/common/MessageAlert';
import { useTranslations } from 'next-intl';
import { setOpenAIApiKeyStatusCache } from '@/hooks/useOpenAIApiKeyStatus';

interface OpenAIApiKeySettingsProps {
  hasApiKey: boolean;
  onApiKeyChange: () => void;
}

export function OpenAIApiKeySettings({ hasApiKey: initialHasApiKey, onApiKeyChange }: OpenAIApiKeySettingsProps) {
  const t = useTranslations('settings.openaiApiKey');
  const [apiKey, setApiKey] = useState('');
  const [hasApiKey, setHasApiKey] = useState(initialHasApiKey);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSave = async () => {
    if (!apiKey.trim()) {
      setError(t('errorEmpty'));
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      await apiClient.setOpenAIApiKey({ api_key: apiKey });
      setSuccess(t('successSaved'));
      setApiKey('');
      setHasApiKey(true);
      setOpenAIApiKeyStatusCache(true);
      onApiKeyChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errorSaving'));
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(t('confirmDelete'))) {
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      await apiClient.deleteOpenAIApiKey();
      setSuccess(t('successDeleted'));
      setHasApiKey(false);
      setOpenAIApiKeyStatusCache(false);
      onApiKeyChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errorDeleting'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <CardDescription>{t('description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && <MessageAlert type="error" message={error} />}
        {success && <MessageAlert type="success" message={success} />}

        <div className="space-y-2">
          <Label htmlFor="api-key">{t('apiKeyLabel')}</Label>
          <Input
            id="api-key"
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-..."
            disabled={loading}
          />
          <p className="text-sm text-muted-foreground">
            {hasApiKey ? t('hasApiKeyMessage') : t('noApiKeyMessage')}
          </p>
          <p className="text-sm text-muted-foreground">
            {t('getApiKeyMessage')}{' '}
            <a
              href="https://platform.openai.com/api-keys"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              {t('openaiPlatform')}
            </a>
          </p>
        </div>

        <div className="flex gap-2">
          <Button onClick={handleSave} disabled={loading || !apiKey.trim()}>
            {loading ? t('saving') : t('save')}
          </Button>
          {hasApiKey && (
            <Button onClick={handleDelete} variant="destructive" disabled={loading}>
              {loading ? t('deleting') : t('delete')}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
