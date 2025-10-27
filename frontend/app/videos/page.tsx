'use client';

import { useState } from 'react';
import { useVideos } from '@/hooks/useVideos';
import { VideoUploadModal } from '@/components/video/VideoUploadModal';
import { VideoList } from '@/components/video/VideoList';
import { PageLayout } from '@/components/layout/PageLayout';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { MessageAlert } from '@/components/common/MessageAlert';

export default function VideosPage() {
  const { videos, isLoading, error, loadVideos } = useVideos();
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);

  const handleUploadSuccess = () => {
    loadVideos();
  };

  const handleUploadClick = () => {
    setIsUploadModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsUploadModalOpen(false);
  };

  return (
    <>
      <PageLayout
        headerContent={
          <button
            onClick={handleUploadClick}
            className="text-gray-600 hover:text-gray-900 transition-colors"
          >
            ＋ 動画をアップロード
          </button>
        }
      >
        <div className="space-y-4">
          <div className="mb-6">
            <h1 className="text-2xl font-semibold text-gray-900">動画一覧</h1>
          </div>

          {isLoading ? (
            <div className="flex justify-center items-center h-64">
              <LoadingSpinner fullScreen={false} />
            </div>
          ) : error ? (
            <MessageAlert type="error" message={error} />
          ) : (
            <VideoList videos={videos} />
          )}
        </div>
      </PageLayout>

      <VideoUploadModal
        isOpen={isUploadModalOpen}
        onClose={handleCloseModal}
        onUploadSuccess={handleUploadSuccess}
      />
    </>
  );
}

