'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useVideos } from '@/hooks/useVideos';
import { useVideoStats } from '@/hooks/useVideoStats';
import { VideoUploadModal } from '@/components/video/VideoUploadModal';
import { VideoList } from '@/components/video/VideoList';
import { PageLayout } from '@/components/layout/PageLayout';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { MessageAlert } from '@/components/common/MessageAlert';
import { Button } from '@/components/ui/button';

export default function VideosPage() {
  const { videos, isLoading, error, loadVideos } = useVideos();
  const stats = useVideoStats(videos);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const searchParams = useSearchParams();

  useEffect(() => {
    // URLパラメータにupload=trueが含まれている場合、モーダルを開く
    if (searchParams?.get('upload') === 'true') {
      setIsUploadModalOpen(true);
    }
  }, [searchParams]);

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
      <PageLayout>
        <div className="space-y-6">
          {/* ヘッダー */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">動画一覧</h1>
              <p className="text-gray-500 mt-1">
                {stats.total > 0 ? `${stats.total}本の動画` : '動画をアップロードして管理しましょう'}
              </p>
            </div>
            <Button onClick={handleUploadClick} className="flex items-center gap-2">
              <span>＋</span>
              <span>動画をアップロード</span>
            </Button>
          </div>

          {/* 統計情報 */}
          {stats.total > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-blue-50 rounded-lg p-4 border border-blue-100">
                <div className="text-2xl font-bold text-blue-600">{stats.total}</div>
                <div className="text-sm text-blue-600">総動画数</div>
              </div>
              <div className="bg-green-50 rounded-lg p-4 border border-green-100">
                <div className="text-2xl font-bold text-green-600">{stats.completed}</div>
                <div className="text-sm text-green-600">完了</div>
              </div>
              <div className="bg-yellow-50 rounded-lg p-4 border border-yellow-100">
                <div className="text-2xl font-bold text-yellow-600">{stats.pending}</div>
                <div className="text-sm text-yellow-600">待機中</div>
              </div>
              <div className="bg-purple-50 rounded-lg p-4 border border-purple-100">
                <div className="text-2xl font-bold text-purple-600">{stats.processing}</div>
                <div className="text-sm text-purple-600">処理中</div>
              </div>
            </div>
          )}

          {/* コンテンツ */}
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

