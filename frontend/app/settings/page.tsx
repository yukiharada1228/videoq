'use client';

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageLayout } from '@/components/layout/PageLayout';
import { apiClient } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { MessageAlert } from '@/components/common/MessageAlert';

export default function Settings() {
  const { user, loading } = useAuth();
  const [apiKey, setApiKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const { t } = useTranslation();

  // Set API key when user info is loaded
  useEffect(() => {
    if (user && user.encrypted_openai_api_key) {
      setApiKey(user.encrypted_openai_api_key);
    }
  }, [user]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      await apiClient.updateMe({
        encrypted_openai_api_key: apiKey || null,
      });
      setSuccess(true);
    } catch (error) {
      console.error('Failed to save settings:', error);
      setError(t('settings.error'));
    } finally {
      setSaving(false);
    }
  };

  if (loading || !user) {
    return <LoadingSpinner />;
  }

  return (
      <PageLayout>
      <div className="mx-auto max-w-2xl space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>{t('settings.title')}</CardTitle>
            <CardDescription>{t('settings.description')}</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSave} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="apiKey">{t('settings.label')}</Label>
                <Input
                  id="apiKey"
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-..."
                  className="font-mono"
                />
                <p className="text-sm text-gray-500">
                  {t('settings.helper')}
                </p>
              </div>

              {error && <MessageAlert message={error} type="error" />}
              {success && <MessageAlert message={t('settings.success')} type="success" />}

              <Button type="submit" disabled={saving}>
                {saving ? t('settings.submitting') : t('settings.submit')}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </PageLayout>
  );
}

