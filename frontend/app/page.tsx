'use client';

import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PageLayout } from '@/components/layout/PageLayout';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { Button } from '@/components/ui/button';
import { apiClient, type UsageStats, type VideoGroupList, type VideoList } from '@/lib/api';
import { useAsyncState } from '@/hooks/useAsyncState';
import { useVideoStats } from '@/hooks/useVideoStats';

export default function Home() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const { t } = useTranslation();

  const { data: rawData, isLoading: isLoadingStats, execute: loadStats } = useAsyncState<{
    videos: VideoList[];
    groups: VideoGroupList[];
  }>({
    initialData: {
      videos: [],
      groups: [],
    }
  });

  const { data: usageStats, isLoading: isLoadingUsage, execute: loadUsageStats } = useAsyncState<UsageStats | null>({
    initialData: null,
  });

  const videoStats = useVideoStats(rawData?.videos || []);
  const hasVideos = (rawData?.videos?.length ?? 0) > 0;

  useEffect(() => {
    if (user && !isLoadingStats && !hasVideos) {
      const loadData = async () => {
        try {
          // Execute API calls in parallel
          const [videos, groups] = await Promise.all([
            apiClient.getVideos().catch(() => []),
            apiClient.getVideoGroups().catch(() => []),
          ]);

          // Set data at once
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

  useEffect(() => {
    if (user && !isLoadingUsage && !usageStats) {
      loadUsageStats(async () => {
        try {
          return await apiClient.getUsageStats();
        } catch (error) {
          console.error('Failed to load usage stats:', error);
          return null;
        }
      });
    }
  }, [user, isLoadingUsage, usageStats, loadUsageStats]);

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
          <h1 className="text-5xl font-bold text-gray-900">
            {t('home.welcome.title')}
          </h1>
          <p className="text-xl text-gray-600">
            {t('home.welcome.subtitle', { username: user.username })}
          </p>
        </div>

        {/* メインアクション */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="hover:shadow-xl transition-all cursor-pointer border-2 hover:border-blue-300" onClick={handleUploadClick}>
            <CardHeader>
              <div className="text-4xl mb-2">📹</div>
              <CardTitle className="text-xl">{t('home.actions.upload.title')}</CardTitle>
              <CardDescription>{t('home.actions.upload.description')}</CardDescription>
            </CardHeader>
          </Card>

          <Card className="hover:shadow-xl transition-all cursor-pointer border-2 hover:border-green-300" onClick={() => router.push('/videos')}>
            <CardHeader>
              <div className="text-4xl mb-2">🎬</div>
              <CardTitle className="text-xl">{t('home.actions.library.title')}</CardTitle>
              <CardDescription className="text-2xl font-bold text-green-600">
                {t('home.actions.library.description', { count: videoStats.total })}
              </CardDescription>
            </CardHeader>
          </Card>

          <Card className="hover:shadow-xl transition-all cursor-pointer border-2 hover:border-purple-300" onClick={() => router.push('/videos/groups')}>
            <CardHeader>
              <div className="text-4xl mb-2">📁</div>
              <CardTitle className="text-xl">{t('home.actions.groups.title')}</CardTitle>
              <CardDescription className="text-2xl font-bold text-purple-600">
                {t('home.actions.groups.description', { count: rawData?.groups?.length || 0 })}
              </CardDescription>
            </CardHeader>
          </Card>
        </div>

        {/* 統計情報 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6 text-center">
              <div className="text-4xl font-bold text-green-600">{videoStats.completed}</div>
              <p className="text-sm text-gray-600 mt-2">{t('home.stats.completed')}</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="pt-6 text-center">
              <div className="text-4xl font-bold text-blue-600">{videoStats.pending}</div>
              <p className="text-sm text-gray-600 mt-2">{t('home.stats.pending')}</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6 text-center">
              <div className="text-4xl font-bold text-yellow-600">{videoStats.processing}</div>
              <p className="text-sm text-gray-600 mt-2">{t('home.stats.processing')}</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6 text-center">
              <div className="text-4xl font-bold text-red-600">{videoStats.error}</div>
              <p className="text-sm text-gray-600 mt-2">{t('home.stats.error')}</p>
            </CardContent>
          </Card>
        </div>

        {/* 使用状況 */}
        <Card className="bg-gray-50">
          <CardHeader>
            <CardTitle>{t('home.usage.title')}</CardTitle>
            <CardDescription>{t('home.usage.description')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {usageStats ? (
              <>
                {/* 動画保存数 */}
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-medium">{t('home.usage.videos.label')}</span>
                    <span className="text-sm text-gray-600">
                      {usageStats.videos.used} / {usageStats.videos.limit}
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2.5">
                    <div
                      className="bg-blue-600 h-2.5 rounded-full"
                      style={{ width: `${Math.min((usageStats.videos.used / usageStats.videos.limit) * 100, 100)}%` }}
                    />
                  </div>
                </div>

                {/* Whisper処理時間 */}
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-medium">{t('home.usage.whisper.label')}</span>
                    <span className="text-sm text-gray-600">
                      {Math.round(usageStats.whisper_minutes.used)} / {usageStats.whisper_minutes.limit} {t('home.usage.whisper.unit')}
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2.5">
                    <div
                      className="bg-green-600 h-2.5 rounded-full"
                      style={{ width: `${Math.min((usageStats.whisper_minutes.used / usageStats.whisper_minutes.limit) * 100, 100)}%` }}
                    />
                  </div>
                </div>

                {/* チャット回数 */}
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-medium">{t('home.usage.chats.label')}</span>
                    <span className="text-sm text-gray-600">
                      {usageStats.chats.used} / {usageStats.chats.limit}
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2.5">
                    <div
                      className="bg-purple-600 h-2.5 rounded-full"
                      style={{ width: `${Math.min((usageStats.chats.used / usageStats.chats.limit) * 100, 100)}%` }}
                    />
                  </div>
                </div>
              </>
            ) : (
              <div className="text-center text-gray-500">{t('home.usage.loading')}</div>
            )}
          </CardContent>
        </Card>
      </div>
    </PageLayout>
  );
}
