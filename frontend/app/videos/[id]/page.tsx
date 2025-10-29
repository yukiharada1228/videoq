'use client';

import { useRouter, useParams } from 'next/navigation';
import { useEffect } from 'react';
import { useVideo } from '@/hooks/useVideos';
import { useAsyncState } from '@/hooks/useAsyncState';
import { apiClient } from '@/lib/api';
import { PageLayout } from '@/components/layout/PageLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { MessageAlert } from '@/components/common/MessageAlert';
import { InlineSpinner } from '@/components/common/InlineSpinner';
import { getStatusBadgeClassName, getStatusLabel, formatDate } from '@/lib/utils/video';
import Link from 'next/link';

export default function VideoDetailPage() {
  const params = useParams();
  const router = useRouter();
  const videoId = params?.id ? parseInt(params.id as string) : null;

  const { video, isLoading, error, loadVideo } = useVideo(videoId);

  useEffect(() => {
    if (videoId) {
      loadVideo();
    }
  }, [videoId, loadVideo]);
  
  const { isLoading: isDeleting, error: deleteError, mutate: handleDelete } = useAsyncState({
    onSuccess: () => router.push('/videos'),
    confirmMessage: 'この動画を削除しますか？',
  });

  if (isLoading) {
    return (
      <PageLayout>
        <div className="flex justify-center items-center h-64">
          <LoadingSpinner fullScreen={false} />
        </div>
      </PageLayout>
    );
  }

  if (error && !video) {
    return (
      <PageLayout>
        <div className="space-y-4">
          <MessageAlert type="error" message={error} />
          <Link href="/videos">
            <Button variant="outline">一覧に戻る</Button>
          </Link>
        </div>
      </PageLayout>
    );
  }

  if (!video) {
    return (
      <PageLayout>
        <div className="text-center text-gray-500">動画が見つかりません</div>
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold text-gray-900">{video.title}</h1>
          <div className="flex gap-2">
            <Link href="/videos">
              <Button variant="outline">一覧に戻る</Button>
            </Link>
            <Button variant="destructive" onClick={() => handleDelete(async () => {
              if (!videoId) return;
              await apiClient.deleteVideo(videoId);
            })} disabled={isDeleting}>
              {isDeleting ? (
                <span className="flex items-center">
                  <InlineSpinner className="mr-2" color="red" />
                  削除中...
                </span>
              ) : (
                '削除'
              )}
            </Button>
          </div>
        </div>

        {(error || deleteError) && <MessageAlert type="error" message={error || deleteError || ''} />}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>情報</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm font-medium text-gray-600">タイトル</p>
                <p className="text-gray-900">{video.title}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-600">説明</p>
                <p className="text-gray-900">{video.description || '説明なし'}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-600">ステータス</p>
                <span className={getStatusBadgeClassName(video.status, 'md')}>
                  {getStatusLabel(video.status)}
                </span>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-600">アップロード日時</p>
                <p className="text-gray-900">
                  {formatDate(video.uploaded_at)}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>動画</CardTitle>
            </CardHeader>
            <CardContent>
              {video.file ? (
                <video controls className="w-full rounded">
                  <source src={video.file} type="video/mp4" />
                  お使いのブラウザは動画タグをサポートしていません。
                </video>
              ) : (
                <p className="text-gray-500">動画ファイルがありません</p>
              )}
            </CardContent>
          </Card>

          {video.transcript && video.transcript.trim() ? (
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>文字起こし</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-900 whitespace-pre-wrap">{video.transcript}</p>
              </CardContent>
            </Card>
          ) : (
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>文字起こし</CardTitle>
              </CardHeader>
              <CardContent>
                {video.status === 'pending' && (
                  <p className="text-gray-500 italic">文字起こし処理はまだ開始されていません。</p>
                )}
                {video.status === 'processing' && (
                  <p className="text-gray-500 italic">文字起こしを処理しています...</p>
                )}
                {video.status === 'completed' && (
                  <p className="text-gray-500 italic">文字起こしはまだ利用できません。</p>
                )}
                {video.status === 'error' && (
                  <p className="text-red-600 italic">文字起こしの処理中にエラーが発生しました。</p>
                )}
              </CardContent>
            </Card>
          )}

          {video.error_message && (
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-red-600">エラー</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-red-800">{video.error_message}</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </PageLayout>
  );
}

