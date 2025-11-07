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
  const [apiSaving, setApiSaving] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [apiSuccess, setApiSuccess] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);

  // ユーザー情報が読み込まれたらAPIキーを設定
  useEffect(() => {
    if (user && user.encrypted_openai_api_key) {
      setApiKey(user.encrypted_openai_api_key);
    }
  }, [user]);

  const handleApiKeySave = async (e: React.FormEvent) => {
    e.preventDefault();
    setApiSaving(true);
    setApiError(null);
    setApiSuccess(false);

    try {
      await apiClient.updateMe({
        encrypted_openai_api_key: apiKey || null,
      });
      setApiSuccess(true);
    } catch (error) {
      console.error('Failed to save settings:', error);
      setApiError('設定の保存に失敗しました');
    } finally {
      setApiSaving(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordSaving(true);
    setPasswordError(null);
    setPasswordSuccess(null);

    if (newPassword !== confirmPassword) {
      setPasswordError('新しいパスワードが一致しません');
      setPasswordSaving(false);
      return;
    }

    try {
      const response = await apiClient.changePassword({
        current_password: currentPassword,
        new_password: newPassword,
        new_password_confirm: confirmPassword,
      });
      setPasswordSuccess(response.detail ?? 'パスワードを変更しました。');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error) {
      console.error('Failed to change password:', error);
      setPasswordError(
        error instanceof Error ? error.message : 'パスワードの変更に失敗しました'
      );
    } finally {
      setPasswordSaving(false);
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
            <form onSubmit={handleApiKeySave} className="space-y-4">
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

              {apiError && <MessageAlert message={apiError} type="error" />}
              {apiSuccess && <MessageAlert message="設定を保存しました" type="success" />}

              <Button type="submit" disabled={apiSaving}>
                {apiSaving ? '保存中...' : '保存'}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>パスワード変更</CardTitle>
            <CardDescription>現在のパスワードと新しいパスワードを入力してください</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handlePasswordChange} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="currentPassword">現在のパスワード</Label>
                <Input
                  id="currentPassword"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="newPassword">新しいパスワード</Label>
                <Input
                  id="newPassword"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">新しいパスワード（確認）</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
              </div>

              {passwordError && <MessageAlert message={passwordError} type="error" />}
              {passwordSuccess && <MessageAlert message={passwordSuccess} type="success" />}

              <Button type="submit" disabled={passwordSaving}>
                {passwordSaving ? '変更中...' : '変更'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </PageLayout>
  );
}

