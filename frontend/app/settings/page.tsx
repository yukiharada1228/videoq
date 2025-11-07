'use client';

import { useState, useEffect } from 'react';
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

  // ユーザー情報が読み込まれたらAPIキーを設定
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
      setError('設定の保存に失敗しました');
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
            <CardTitle>設定</CardTitle>
            <CardDescription>OpenAI APIキーを設定します</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSave} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="apiKey">OpenAI API キー</Label>
                <Input
                  id="apiKey"
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-..."
                  className="font-mono"
                />
                <p className="text-sm text-gray-500">
                  OpenAI APIキーを入力してください。この情報は暗号化して保存されます。
                </p>
              </div>

              {error && <MessageAlert message={error} type="error" />}
              {success && <MessageAlert message="設定を保存しました" type="success" />}

              <Button type="submit" disabled={saving}>
                {saving ? '保存中...' : '保存'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </PageLayout>
  );
}

