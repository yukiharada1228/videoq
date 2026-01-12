import { useEffect, useMemo, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useVideos } from '@/hooks/useVideos';
import { useVideoStats } from '@/hooks/useVideoStats';
import { VideoUploadModal } from '@/components/video/VideoUploadModal';
import { VideoList } from '@/components/video/VideoList';
import { PageLayout } from '@/components/layout/PageLayout';
import { LoadingState } from '@/components/common/LoadingState';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { useI18nNavigate } from '@/lib/i18n';
import { useTags } from '@/hooks/useTags';

import { TagFilterPanel } from '@/components/video/TagFilterPanel';
import { TagManagementModal } from '@/components/video/TagManagementModal';


export default function VideosPage() {
  const { videos, isLoading, error, loadVideos } = useVideos();
  const stats = useVideoStats(videos);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);

  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);
  const [isTagManagementOpen, setIsTagManagementOpen] = useState(false);
  const [searchParams] = useSearchParams();
  const navigate = useI18nNavigate();
  const { t } = useTranslation();
  const { user, loading: userLoading, refetch: refetchUser } = useAuth();
  const { tags } = useTags();


  const shouldOpenModalFromQuery = useMemo(
    () => searchParams?.get('upload') === 'true',
    [searchParams],
  );

  useEffect(() => {
    void loadVideos(selectedTagIds.length > 0 ? selectedTagIds : undefined);
  }, [loadVideos, selectedTagIds]);

  const handleTagToggle = useCallback((tagId: number) => {
    setSelectedTagIds((prev: number[]) =>
      prev.includes(tagId) ? prev.filter((id: number) => id !== tagId) : [...prev, tagId]
    );
  }, []);

  const handleTagClear = useCallback(() => {
    setSelectedTagIds([]);
  }, []);

  const handleUploadSuccess = () => {
    void loadVideos();
    void refetchUser(); // Update video_count
  };

  const handleUploadClick = () => {
    setIsUploadModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsUploadModalOpen(false);
    if (shouldOpenModalFromQuery) {
      navigate('/videos', { replace: true });
    }
  };

  const isUploadDisabled = useMemo(() => {
    if (!user || userLoading) return true;
    if (user.video_limit === null) return false;
    return user.video_count >= user.video_limit;
  }, [user, userLoading]);

  const hasReachedLimit = useMemo(() => {
    if (!user || user.video_limit === null) return false;
    return user.video_count >= user.video_limit;
  }, [user]);

  return (
    <>
      <PageLayout fullWidth>
        <div className="space-y-6">
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
              disabled={isUploadDisabled}
              className="flex items-center gap-2 w-full lg:w-auto"
              size="sm"
            >
              <span>＋</span>
              <span>{t('videos.list.uploadButton')}</span>
            </Button>
          </div>

          {hasReachedLimit && user && user.video_limit !== null && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <p className="text-yellow-800 text-sm">
                {t('videos.list.uploadLimitWarning.message', { limit: user.video_limit })}
              </p>
            </div>
          )}

          <TagFilterPanel
            tags={tags}
            selectedTagIds={selectedTagIds}
            onToggle={handleTagToggle}
            onClear={handleTagClear}
            onManageTags={() => setIsTagManagementOpen(true)}
            disabled={isLoading}
          />



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

      <TagManagementModal
        isOpen={isTagManagementOpen}
        onClose={() => setIsTagManagementOpen(false)}
      />
    </>
  );
}

