'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageLayout } from '@/components/layout/PageLayout';
import { apiClient } from '@/lib/api';

export default function Settings() {
  const router = useRouter();
  const [apiKey, setApiKey] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    if (!apiClient.isAuthenticated()) {
      router.push('/login');
      return;
    }

    try {
      const user = await apiClient.getMe();
      if (user.encrypted_openai_api_key) {
        setApiKey(user.encrypted_openai_api_key);
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
      apiClient.logout();
      router.push('/login');
    } finally {
      setLoading(false);
    }
  };

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

  const handleLogout = () => {
    apiClient.logout();
    router.push('/login');
  };

  const goHome = () => {
    router.push('/');
  };

  const MessageAlert = ({ 
    message, 
    type 
  }: { 
    message: string; 
    type: 'error' | 'success' 
  }) => {
    const styles = type === 'error' 
      ? 'bg-red-50 text-red-800' 
      : 'bg-green-50 text-green-800';
    
    return (
      <div className={`rounded-md p-4 text-sm ${styles}`}>
        {message}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-gray-200 border-t-blue-600"></div>
          <p className="text-gray-600">読み込み中...</p>
        </div>
      </div>
    );
  }

  return (
      <PageLayout
      headerContent={
        <>
          <Button onClick={goHome} variant="outline">
            ホームに戻る
          </Button>
          <Button onClick={handleLogout} variant="outline">
            ログアウト
          </Button>
        </>
      }
    >
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

