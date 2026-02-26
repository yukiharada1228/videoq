import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PageLayout } from '@/components/layout/PageLayout';
import { useI18nNavigate } from '@/lib/i18n';
import { useAuth } from '@/hooks/useAuth';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { useVideoStats } from '@/hooks/useVideoStats';
import { useHomePageData } from '@/hooks/useHomePageData';

export default function HomePage() {
  const navigate = useI18nNavigate();
  const { user, loading } = useAuth();
  const { t } = useTranslation();

  const { videos, groups, isLoading: isLoadingStats } = useHomePageData({ userId: user?.id });
  const videoStats = useVideoStats(videos);

  const handleUploadClick = () => {
    navigate('/videos?upload=true');
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
                {t('home.actions.groups.description', { count: groups.length })}
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
      </div>
    </PageLayout>
  );
}
