'use client';

import { useState, useEffect, Suspense, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { useRouter } from '@/i18n/routing';
import { useTranslations } from 'next-intl';
import { useVideos } from '@/hooks/useVideos';
import { useVideoStats } from '@/hooks/useVideoStats';
import { VideoUploadModal } from '@/components/video/VideoUploadModal';
import { VideoList } from '@/components/video/VideoList';
import { PageLayout } from '@/components/layout/PageLayout';
import { LoadingState } from '@/components/common/LoadingState';
import { Button } from '@/components/ui/button';
import { useOpenAIApiKeyStatus } from '@/hooks/useOpenAIApiKeyStatus';
import { OpenAIApiKeyRequiredBanner } from '@/components/common/OpenAIApiKeyRequiredBanner';

function VideosContent() {
  const { videos, isLoading, error, loadVideos } = useVideos();
  const stats = useVideoStats(videos);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const searchParams = useSearchParams();
  const router = useRouter();
  const t = useTranslations();
  const { hasApiKey, isChecking: checkingApiKey } = useOpenAIApiKeyStatus();

  const shouldOpenModalFromQuery = useMemo(
    () => searchParams?.get('upload') === 'true',
    [searchParams]
  );

  useEffect(() => {
    // Load video list on page load
    loadVideos();
  }, [loadVideos]);

  // If opened via query (?upload=true) but API key is missing, do not open modal.
  useEffect(() => {
    if (shouldOpenModalFromQuery && !checkingApiKey && hasApiKey === false) {
      router.replace('/videos', { scroll: false });
    }
  }, [shouldOpenModalFromQuery, checkingApiKey, hasApiKey, router]);

  const handleUploadSuccess = () => {
    loadVideos();
  };

  const handleUploadClick = () => {
    setIsUploadModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsUploadModalOpen(false);
    if (shouldOpenModalFromQuery) {
      router.replace('/videos', { scroll: false });
    }
  };

  return (
    <>
      <PageLayout fullWidth>
        <div className="space-y-6">
          {/* ヘッダー */}
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div>
              <h1 className="text-2xl lg:text-3xl font-bold text-gray-900">
                {t('videos.list.title')}
              </h1>
              <p className="text-sm lg:text-base text-gray-500 mt-1">
                {stats.total > 0
                  ? t('videos.list.subtitle', { count: stats.total })
                  : t('videos.list.emptySubtitle')}
              </p>
            </div>
            <Button
              onClick={handleUploadClick}
              disabled={hasApiKey !== true || checkingApiKey}
              className="flex items-center gap-2 w-full lg:w-auto"
              size="sm"
            >
              <span>＋</span>
              <span>{t('videos.list.uploadButton')}</span>
            </Button>
          </div>

          {/* API key warning */}
          {!checkingApiKey && hasApiKey === false && <OpenAIApiKeyRequiredBanner />}

          {/* 統計情報 */}
          {stats.total > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-blue-50 rounded-lg p-4 border border-blue-100">
                <div className="text-2xl font-bold text-blue-600">{stats.total}</div>
                <div className="text-sm text-blue-600">{t('videos.list.stats.total')}</div>
              </div>
              <div className="bg-green-50 rounded-lg p-4 border border-green-100">
                <div className="text-2xl font-bold text-green-600">{stats.completed}</div>
                <div className="text-sm text-green-600">{t('videos.list.stats.completed')}</div>
              </div>
              <div className="bg-yellow-50 rounded-lg p-4 border border-yellow-100">
                <div className="text-2xl font-bold text-yellow-600">{stats.pending}</div>
                <div className="text-sm text-yellow-600">{t('videos.list.stats.pending')}</div>
              </div>
              <div className="bg-purple-50 rounded-lg p-4 border border-purple-100">
                <div className="text-2xl font-bold text-purple-600">{stats.processing}</div>
                <div className="text-sm text-purple-600">{t('videos.list.stats.processing')}</div>
              </div>
            </div>
          )}

          {/* コンテンツ */}
          <LoadingState
            isLoading={isLoading}
            error={error}
            loadingMessage={t('videos.list.loading')}
          >
            <div className="max-h-[600px] overflow-y-auto">
              <VideoList videos={videos} />
            </div>
          </LoadingState>
        </div>
      </PageLayout>

      <VideoUploadModal
        isOpen={shouldOpenModalFromQuery || isUploadModalOpen}
        onClose={handleCloseModal}
        onUploadSuccess={handleUploadSuccess}
      />
    </>
  );
}

export default function VideosPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <VideosContent />
    </Suspense>
  );
}

