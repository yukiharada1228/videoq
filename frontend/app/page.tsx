'use client';

import { useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PageLayout } from '@/components/layout/PageLayout';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { Button } from '@/components/ui/button';
import { apiClient, type VideoGroupList, type VideoList } from '@/lib/api';
import { useAsyncState } from '@/hooks/useAsyncState';
import { useVideoStats } from '@/hooks/useVideoStats';

export default function Home() {
  const router = useRouter();
  const { user, loading } = useAuth();
  
  const { data: rawData, isLoading: isLoadingStats, execute: loadStats } = useAsyncState<{
    videos: VideoList[];
    groups: VideoGroupList[];
  }>({
    initialData: {
      videos: [],
      groups: [],
    }
  });

  const videoStats = useVideoStats(rawData?.videos || []);
  const hasVideos = (rawData?.videos?.length ?? 0) > 0;

  useEffect(() => {
    if (user && !isLoadingStats && !hasVideos) {
      const loadData = async () => {
        try {
          // 並列でAPI呼び出しを実行（N+1問題対策）
          const [videos, groups] = await Promise.all([
            apiClient.getVideos().catch(() => []),
            apiClient.getVideoGroups().catch(() => []),
          ]);

          // データを一度に設定（DRY原則）
          await loadStats(async () => ({
            videos,
            groups,
          }));
        } catch (error) {
          console.error('Failed to load stats:', error);
        }
      };
      
      loadData();
    }
  }, [user, isLoadingStats, hasVideos, loadStats]);

  const handleUploadClick = () => {
    router.push('/videos?upload=true');
  };

  if (loading || !user || isLoadingStats) {
    return (
      <PageLayout>
        <LoadingSpinner />
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      <div className="max-w-4xl mx-auto space-y-8">
        {/* ウェルカムセクション */}
        <div className="text-center space-y-4">
          <h1 className="text-5xl font-bold text-gray-900">Welcome back!</h1>
          <p className="text-xl text-gray-600">{user.username}さん、おかえりなさい</p>
        </div>

        {/* メインアクション */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="hover:shadow-xl transition-all cursor-pointer border-2 hover:border-blue-300" onClick={handleUploadClick}>
            <CardHeader>
              <div className="text-4xl mb-2">📹</div>
              <CardTitle className="text-xl">動画をアップロード</CardTitle>
              <CardDescription>新しい動画をアップロードして管理</CardDescription>
            </CardHeader>
          </Card>

          <Card className="hover:shadow-xl transition-all cursor-pointer border-2 hover:border-green-300" onClick={() => router.push('/videos')}>
            <CardHeader>
              <div className="text-4xl mb-2">🎬</div>
              <CardTitle className="text-xl">動画一覧</CardTitle>
              <CardDescription className="text-2xl font-bold text-green-600">{videoStats.total}本</CardDescription>
            </CardHeader>
          </Card>

          <Card className="hover:shadow-xl transition-all cursor-pointer border-2 hover:border-purple-300" onClick={() => router.push('/videos/groups')}>
            <CardHeader>
              <div className="text-4xl mb-2">📁</div>
              <CardTitle className="text-xl">チャットグループ</CardTitle>
              <CardDescription className="text-2xl font-bold text-purple-600">{rawData?.groups?.length || 0}個</CardDescription>
            </CardHeader>
          </Card>
        </div>

        {/* 統計情報 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6 text-center">
              <div className="text-4xl font-bold text-green-600">{videoStats.completed}</div>
              <p className="text-sm text-gray-600 mt-2">処理完了</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="pt-6 text-center">
              <div className="text-4xl font-bold text-blue-600">{videoStats.pending}</div>
              <p className="text-sm text-gray-600 mt-2">待機中</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6 text-center">
              <div className="text-4xl font-bold text-yellow-600">{videoStats.processing}</div>
              <p className="text-sm text-gray-600 mt-2">処理中</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6 text-center">
              <div className="text-4xl font-bold text-red-600">{videoStats.error}</div>
              <p className="text-sm text-gray-600 mt-2">エラー</p>
            </CardContent>
          </Card>
        </div>

        {/* アカウント情報（簡潔） */}
        <Card className="bg-gray-50">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">ユーザー名</p>
                <p className="text-lg font-semibold text-gray-900">{user.username}</p>
              </div>
              <div className="text-right">
                {user.encrypted_openai_api_key ? (
                  <span className="text-sm text-green-600">✓ API キー設定済み</span>
                ) : (
                  <Button 
                    size="sm" 
                    variant="outline" 
                    onClick={() => router.push('/settings')}
                  >
                    API キーを設定
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </PageLayout>
  );
}
