'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { PageLayout } from '@/components/layout/PageLayout';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MessageAlert } from '@/components/common/MessageAlert';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { apiClient } from '@/lib/api';
import { useAsyncState } from '@/hooks/useAsyncState';

function ResetPasswordContent() {
  const searchParams = useSearchParams();
  const uid = searchParams.get('uid') ?? '';
  const token = searchParams.get('token') ?? '';

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [clientError, setClientError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const { isLoading, error, execute, setError } = useAsyncState<void>({
    onSuccess: () => {
      setSuccess(true);
      setPassword('');
      setConfirmPassword('');
    },
  });

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setClientError(null);
    setError(null);

    if (!uid || !token) {
      setClientError('リセットリンクが無効です。もう一度パスワードリセットを実行してください。');
      return;
    }

    if (password !== confirmPassword) {
      setClientError('パスワードが一致しません');
      return;
    }

    try {
      await execute(() =>
        apiClient.confirmPasswordReset({
          uid,
          token,
          new_password: password,
        })
      );
    } catch {
      // useAsyncState がエラー表示を管理
    }
  };

  return (
    <PageLayout centered>
      <div className="w-full max-w-md">
        <Card>
          <CardHeader>
            <CardTitle>新しいパスワードの設定</CardTitle>
            <CardDescription>安全な新しいパスワードを入力してください。</CardDescription>
          </CardHeader>
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4">
              {clientError && <MessageAlert message={clientError} type="error" />}
              {error && <MessageAlert message={error} type="error" />}
              {success && (
                <MessageAlert
                  message="パスワードをリセットしました。新しいパスワードでログインしてください。"
                  type="success"
                />
              )}
              <div className="space-y-2">
                <Label htmlFor="password">新しいパスワード</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="8文字以上のパスワード"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">新しいパスワード（確認）</Label>
                <Input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  required
                  minLength={8}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="もう一度入力してください"
                />
              </div>
            </CardContent>
            <CardFooter className="flex flex-col space-y-4 pt-4">
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? '更新中...' : 'パスワードを更新'}
              </Button>
              <Link href="/login" className="text-center text-sm text-blue-600 hover:underline">
                ログイン画面に戻る
              </Link>
            </CardFooter>
          </form>
        </Card>
      </div>
    </PageLayout>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <PageLayout centered>
          <LoadingSpinner />
        </PageLayout>
      }
    >
      <ResetPasswordContent />
    </Suspense>
  );
}

