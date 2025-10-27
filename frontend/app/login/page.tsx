'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { PageLayout } from '@/components/layout/PageLayout';
import { apiClient } from '@/lib/api';
import { ErrorMessage } from '@/components/auth/ErrorMessage';
import { FormField } from '@/components/auth/FormField';
import { AuthFormFooter } from '@/components/auth/AuthFormFooter';

export default function LoginPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    username: '',
    password: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await apiClient.login(formData);
      router.push('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ログインに失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  };

  return (
    <PageLayout centered>
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>ログイン</CardTitle>
          <CardDescription>
            アカウントにログインしてサービスをご利用ください
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            <ErrorMessage message={error} />
            <FormField
              id="username"
              name="username"
              label="ユーザー名"
              type="text"
              placeholder="ユーザー名を入力"
              value={formData.username}
              onChange={handleChange}
              required
            />
            <FormField
              id="password"
              name="password"
              label="パスワード"
              type="password"
              placeholder="パスワードを入力"
              value={formData.password}
              onChange={handleChange}
              required
            />
          </CardContent>
          <CardFooter className="flex flex-col space-y-4 pt-6">
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'ログイン中...' : 'ログイン'}
            </Button>
            <AuthFormFooter
              questionText="アカウントをお持ちでない方は"
              linkText="こちらから登録"
              href="/signup"
            />
          </CardFooter>
        </form>
      </Card>
    </PageLayout>
  );
}
