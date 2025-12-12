'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PageLayout } from '@/components/layout/PageLayout';
import { useRouter } from '@/i18n/routing';
import { useAuth } from '@/hooks/useAuth';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { apiClient, type VideoGroupList, type VideoList } from '@/lib/api';
import { useAsyncState } from '@/hooks/useAsyncState';
import { useVideoStats } from '@/hooks/useVideoStats';
import { useOpenAIApiKeyStatus } from '@/hooks/useOpenAIApiKeyStatus';
import { OpenAIApiKeyRequiredBanner } from '@/components/common/OpenAIApiKeyRequiredBanner';

export default function Home() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const t = useTranslations();
  const { hasApiKey, isChecking: checkingApiKey } = useOpenAIApiKeyStatus({ enabled: !!user });

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

  const handleUploadClick = () => {
    if (!checkingApiKey && hasApiKey === false) {
      router.push('/settings');
      return;
    }
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
        {!checkingApiKey && hasApiKey === false && <OpenAIApiKeyRequiredBanner />}

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
          <Card
            className={[
              "transition-all border-2",
              (!checkingApiKey && hasApiKey === false)
                ? "cursor-not-allowed opacity-60 border-gray-200"
                : "hover:shadow-xl cursor-pointer hover:border-blue-300",
            ].join(' ')}
            onClick={handleUploadClick}
          >
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
      </div>
    </PageLayout>
  );
}
