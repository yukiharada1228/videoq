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
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            動画をアップロード
          </button>
        }
      >
        <div className="space-y-6">
          {/* ヘッダー */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">動画一覧</h1>
              <p className="text-gray-500 mt-1">
                {videos.length > 0 ? `${videos.length}本の動画` : '動画をアップロードして管理しましょう'}
              </p>
            </div>
          </div>

          {/* 統計情報 */}
          {videos.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-blue-50 rounded-lg p-4 border border-blue-100">
                <div className="text-2xl font-bold text-blue-600">{videos.length}</div>
                <div className="text-sm text-blue-600">総動画数</div>
              </div>
              <div className="bg-green-50 rounded-lg p-4 border border-green-100">
                <div className="text-2xl font-bold text-green-600">
                  {videos.filter(v => v.status === 'completed').length}
                </div>
                <div className="text-sm text-green-600">完了</div>
              </div>
              <div className="bg-yellow-50 rounded-lg p-4 border border-yellow-100">
                <div className="text-2xl font-bold text-yellow-600">
                  {videos.filter(v => v.status === 'pending').length}
                </div>
                <div className="text-sm text-yellow-600">待機中</div>
              </div>
              <div className="bg-purple-50 rounded-lg p-4 border border-purple-100">
                <div className="text-2xl font-bold text-purple-600">
                  {videos.filter(v => v.status === 'processing').length}
                </div>
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

