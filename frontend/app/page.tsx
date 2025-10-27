'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PageLayout } from '@/components/layout/PageLayout';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { ChatPanel } from '@/components/chat/ChatPanel';

export default function Home() {
  const router = useRouter();
  const { user, loading } = useAuth();

  if (loading || !user) {
    return <LoadingSpinner />;
  }

  return (
    <PageLayout>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
                  <div className="mt-1 flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-700">OpenAI API キー:</span>
                    {user.encrypted_openai_api_key ? (
                      <span className="text-sm text-green-600">✓ 設定済み</span>
                    ) : (
                      <span className="text-sm text-gray-500">未設定</span>
                    )}
                  </div>
                  {!user.encrypted_openai_api_key && (
                    <p className="text-xs text-gray-400 mt-1">設定ページでAPIキーを設定してください</p>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <ChatPanel hasApiKey={!!user.encrypted_openai_api_key} />
      </div>
    </PageLayout>
  );
}
