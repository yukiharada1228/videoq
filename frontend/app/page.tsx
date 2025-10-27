'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PageLayout } from '@/components/layout/PageLayout';
import { apiClient } from '@/lib/api';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';

export default function Home() {
  const router = useRouter();
  const { user, loading } = useAuth();

  const handleLogout = () => {
    apiClient.logout();
    router.push('/login');
  };

  if (loading || !user) {
    return <LoadingSpinner />;
  }

  return (
    <PageLayout
      headerContent={
        <>
          <span className="text-gray-700">ようこそ、{user.username}さん</span>
          <Button onClick={() => router.push('/settings')} variant="outline">
            設定
          </Button>
          <Button onClick={handleLogout} variant="outline">
            ログアウト
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>ダッシュボード</CardTitle>
            <CardDescription>あなたのアカウント情報</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="space-y-2">
                <p><strong>ユーザー名:</strong> {user.username}</p>
                <p><strong>ユーザーID:</strong> {user.id}</p>
                <div className="border-t pt-2">
                  <p className="text-sm font-medium text-gray-700">OpenAI API キー:</p>
                  {user.encrypted_openai_api_key ? (
                    <div className="mt-1 flex items-center gap-2">
                      <code className="rounded bg-gray-100 px-2 py-1 text-sm font-mono">
                        {user.encrypted_openai_api_key.substring(0, 8)}...
                      </code>
                      <span className="text-sm text-green-600">✓ 設定済み</span>
                    </div>
                  ) : (
                    <div className="mt-1">
                      <span className="text-sm text-gray-500">未設定</span>
                      <p className="text-xs text-gray-400">設定ページでAPIキーを設定してください</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </PageLayout>
  );
}
