import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PageLayout } from '@/components/layout/PageLayout';
import { useI18nNavigate } from '@/lib/i18n';
import { useAuth } from '@/hooks/useAuth';
import { useConfig } from '@/hooks/useConfig';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { apiClient, type VideoGroupList, type VideoList } from '@/lib/api';
import { useAsyncState } from '@/hooks/useAsyncState';
import { useVideoStats } from '@/hooks/useVideoStats';
import { formatFileSize } from '@/lib/utils';
import { UsageBar } from '@/components/common/UsageBar';
import LandingPage from '@/pages/LandingPage';

export default function HomePage() {
  const navigate = useI18nNavigate();
  const { user, loading } = useAuth({ redirectToLogin: false });
  const { config } = useConfig();
  const { t } = useTranslation();

  const { data: rawData, isLoading: isLoadingStats, execute: loadStats } = useAsyncState<{
    videos: VideoList[];
    groups: VideoGroupList[];
  }>({
    initialData: {
      videos: [],
      groups: [],
    },
  });

  const videoStats = useVideoStats(rawData?.videos || []);
  const hasVideos = (rawData?.videos?.length ?? 0) > 0;

  useEffect(() => {
    if (user && !isLoadingStats && !hasVideos) {
      const loadData = async () => {
        try {
          const [videos, groups] = await Promise.all([
            apiClient.getVideos().catch(() => []),
            apiClient.getVideoGroups().catch(() => []),
          ]);

          await loadStats(async () => ({
            videos,
            groups,
          }));
        } catch (error) {
          console.error('Failed to load stats:', error);
        }
      };

      void loadData();
    }
  }, [user, isLoadingStats, hasVideos, loadStats]);

  const handleUploadClick = () => {
    navigate('/videos?upload=true');
  };

  if (loading) {
    return (
      <PageLayout>
        <LoadingSpinner />
      </PageLayout>
    );
  }

  // Show landing page for unauthenticated users
  if (!user) {
    return <LandingPage />;
  }

  if (isLoadingStats) {
    return (
      <PageLayout>
        <LoadingSpinner />
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="text-center space-y-4">
          <h1 className="text-5xl font-bold text-gray-900">
            {t('home.welcome.title')}
          </h1>
          <p className="text-xl text-gray-600">
            {t('home.welcome.subtitle', { username: user.username })}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card
            className="hover:shadow-xl transition-all cursor-pointer border-2 hover:border-blue-300"
            onClick={handleUploadClick}
          >
            <CardHeader>
              <div className="text-4xl mb-2">📹</div>
              <CardTitle className="text-xl">{t('home.actions.upload.title')}</CardTitle>
              <CardDescription>{t('home.actions.upload.description')}</CardDescription>
            </CardHeader>
          </Card>

          <Card
            className="hover:shadow-xl transition-all cursor-pointer border-2 hover:border-green-300"
            onClick={() => navigate('/videos')}
          >
            <CardHeader>
              <div className="text-4xl mb-2">🎬</div>
              <CardTitle className="text-xl">{t('home.actions.library.title')}</CardTitle>
              <CardDescription className="text-2xl font-bold text-green-600">
                {t('home.actions.library.description', { count: videoStats.total })}
              </CardDescription>
            </CardHeader>
          </Card>

          <Card
            className="hover:shadow-xl transition-all cursor-pointer border-2 hover:border-purple-300"
            onClick={() => navigate('/videos/groups')}
          >
            <CardHeader>
              <div className="text-4xl mb-2">📁</div>
              <CardTitle className="text-xl">{t('home.actions.groups.title')}</CardTitle>
              <CardDescription className="text-2xl font-bold text-purple-600">
                {t('home.actions.groups.description', { count: rawData?.groups?.length || 0 })}
              </CardDescription>
            </CardHeader>
          </Card>
        </div>

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

        {config.billing_enabled && user.billing_enabled !== false && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{t('billing.management.usageTitle')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <UsageBar
                label={t('billing.management.usageStorage')}
                used={user.storage_used_bytes}
                limit={user.storage_limit_bytes}
                formatValue={(used, limit) =>
                  `${formatFileSize(used)} / ${formatFileSize(limit)}`
                }
              />
              <UsageBar
                label={t('billing.management.usageProcessing')}
                used={user.processing_minutes_used}
                limit={user.processing_minutes_limit}
                formatValue={(used, limit) =>
                  t('billing.management.usageMinutes', {
                    used: Math.round(used),
                    limit,
                  })
                }
              />
              <UsageBar
                label={t('billing.management.usageAi')}
                used={user.ai_answers_used}
                limit={user.ai_answers_limit}
                formatValue={(used, limit) =>
                  t('billing.management.usageCount', {
                    used: used.toLocaleString(),
                    limit: limit.toLocaleString(),
                  })
                }
              />
            </CardContent>
          </Card>
        )}
      </div>
    </PageLayout>
  );
}
