'use client';

import { useState } from 'react';
import Link from 'next/link';
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
import { apiClient } from '@/lib/api';
import { useAsyncState } from '@/hooks/useAsyncState';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [success, setSuccess] = useState(false);
  const { isLoading, error, execute, setError } = useAsyncState<void>({
    onSuccess: () => setSuccess(true),
  });

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSuccess(false);
    setError(null);

    try {
      await execute(() => apiClient.requestPasswordReset({ email }));
    } catch {
      // useAsyncState がエラー表示を管理
    }
  };

  return (
    <PageLayout centered>
      <div className="w-full max-w-md">
        <Card>
          <CardHeader>
            <CardTitle>パスワードをお忘れですか？</CardTitle>
            <CardDescription>
              登録済みのメールアドレスを入力すると、パスワード再設定用のリンクをメールでお送りします。
            </CardDescription>
          </CardHeader>
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4">
              {error && <MessageAlert message={error} type="error" />}
              {success && (
                <MessageAlert
                  message="パスワードリセット用のメールを送信しました。数分待っても届かない場合は迷惑メールフォルダをご確認ください。"
                  type="success"
                />
              )}
              <div className="space-y-2">
                <Label htmlFor="email">メールアドレス</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                />
              </div>
            </CardContent>
            <CardFooter className="flex flex-col space-y-4 pt-4">
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? '送信中...' : 'リセットリンクを送信'}
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

