'use client';

import { Link } from '@/i18n/routing';
import { useParams, useSearchParams } from 'next/navigation';
import { useRouter } from '@/i18n/routing';
import { useEffect, useRef, useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { useVideo } from '@/hooks/useVideos';
import { useAsyncState } from '@/hooks/useAsyncState';
import { apiClient } from '@/lib/api';
import { PageLayout } from '@/components/layout/PageLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { MessageAlert } from '@/components/common/MessageAlert';
import { InlineSpinner } from '@/components/common/InlineSpinner';
import { getStatusBadgeClassName, getStatusLabel, formatDate } from '@/lib/utils/video';

export default function VideoDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const videoId = params?.id ? parseInt(params.id as string) : null;
  const videoRef = useRef<HTMLVideoElement>(null);
  const startTime = searchParams.get('t');
  const t = useTranslations();
  const locale = useLocale();

  const { video, isLoading, error, loadVideo } = useVideo(videoId);

  // Edit mode state management
  const [isEditing, setIsEditing] = useState(false);
  const [editedTitle, setEditedTitle] = useState('');
  const [editedDescription, setEditedDescription] = useState('');

  useEffect(() => {
    if (videoId) {
      loadVideo();
    }
  }, [videoId, loadVideo]);

  // Play from specified time when video is loaded
  const handleVideoLoaded = () => {
    if (videoRef.current && startTime) {
      const seconds = parseInt(startTime, 10);
      if (!isNaN(seconds)) {
        videoRef.current.currentTime = seconds;
        videoRef.current.play();
      }
    }
  };
  
  const { isLoading: isDeleting, error: deleteError, mutate: handleDelete } = useAsyncState({
    onSuccess: () => router.push('/videos'),
    confirmMessage: t('confirmations.deleteVideo'),
  });

  const { isLoading: isUpdating, error: updateError, mutate: handleUpdate } = useAsyncState({
    onSuccess: () => {
      setIsEditing(false);
      loadVideo(); // Reload video info
    },
  });

  // Cancel edit
  const handleCancelEdit = () => {
    setIsEditing(false);
    if (video) {
      setEditedTitle(video.title);
      setEditedDescription(video.description || '');
    }
  };

  if (isLoading) {
    return (
      <PageLayout fullWidth>
        <div className="flex justify-center items-center h-64">
          <LoadingSpinner fullScreen={false} />
        </div>
      </PageLayout>
    );
  }

  if (error && !video) {
    return (
      <PageLayout fullWidth>
        <div className="space-y-4">
          <MessageAlert type="error" message={error} />
          <Link href="/videos">
            <Button variant="outline">{t('common.actions.backToList')}</Button>
          </Link>
        </div>
      </PageLayout>
    );
  }

  if (!video) {
    return (
      <PageLayout fullWidth>
        <div className="text-center text-gray-500">{t('common.messages.videoNotFound')}</div>
      </PageLayout>
    );
  }

  return (
    <PageLayout fullWidth>
      <div className="space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <h1 className="text-2xl lg:text-3xl font-bold text-gray-900">{video.title}</h1>
          <div className="flex flex-wrap gap-2">
            {!isEditing && (
              <Button
                variant="outline"
                onClick={() => {
                  if (!video) return;
                  setEditedTitle(video.title);
                  setEditedDescription(video.description || '');
                  setIsEditing(true);
                }}
                size="sm"
                className="lg:size-default"
              >
                {t('videos.detail.edit')}
              </Button>
            )}
            <Link href="/videos">
              <Button variant="outline" size="sm" className="lg:size-default">
                {t('common.actions.backToList')}
              </Button>
            </Link>
            {!isEditing && (
              <Button variant="destructive" onClick={() => handleDelete(async () => {
                if (!videoId) return;
                await apiClient.deleteVideo(videoId);
              })} disabled={isDeleting} size="sm" className="lg:size-default">
                {isDeleting ? (
                  <span className="flex items-center">
                    <InlineSpinner className="mr-2" color="red" />
                    {t('common.actions.deleting')}
                  </span>
                ) : (
                  t('common.actions.delete')
                )}
              </Button>
            )}
          </div>
        </div>

        {(error || deleteError || updateError) && <MessageAlert type="error" message={error || deleteError || updateError || ''} />}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>{t('videos.detail.info')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {isEditing ? (
                <>
                  <div>
                    <label className="text-sm font-medium text-gray-600 block mb-1">
                      {t('videos.detail.editTitleLabel')}
                    </label>
                    <Input
                      type="text"
                      value={editedTitle}
                      onChange={(e) => setEditedTitle(e.target.value)}
                      className="w-full"
                      disabled={isUpdating}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-600 block mb-1">
                      {t('videos.detail.editDescriptionLabel')}
                    </label>
                    <Textarea
                      value={editedDescription}
                      onChange={(e) => setEditedDescription(e.target.value)}
                      className="w-full min-h-[100px]"
                      disabled={isUpdating}
                    />
                  </div>
                  <div className="flex gap-2 pt-2">
                    <Button
                      onClick={() => handleUpdate(async () => {
                        if (!videoId) return;
                        await apiClient.updateVideo(videoId, {
                          title: editedTitle,
                          description: editedDescription,
                        });
                      })}
                      disabled={isUpdating || !editedTitle.trim()}
                    >
                      {isUpdating ? (
                        <span className="flex items-center">
                          <InlineSpinner className="mr-2" />
                          {t('videos.detail.saving')}
                        </span>
                      ) : (
                        t('videos.detail.save')
                      )}
                    </Button>
                    <Button 
                      variant="outline" 
                      onClick={handleCancelEdit}
                      disabled={isUpdating}
                    >
                      {t('videos.detail.cancel')}
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <p className="text-sm font-medium text-gray-600">{t('videos.detail.labels.title')}</p>
                    <p className="text-gray-900">{video.title}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-600">{t('videos.detail.labels.description')}</p>
                    <p className="text-gray-900">{video.description || t('common.messages.noDescription')}</p>
                  </div>
                </>
              )}
              <div>
                <p className="text-sm font-medium text-gray-600">{t('videos.detail.labels.status')}</p>
                <span className={getStatusBadgeClassName(video.status, 'md')}>
                  {t(getStatusLabel(video.status))}
                </span>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-600">{t('videos.detail.labels.uploadedAt')}</p>
                <p className="text-gray-900">
                  {formatDate(video.uploaded_at, 'full', locale)}
                </p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-600">{t('videos.detail.labels.externalId')}</p>
                <p className="text-gray-900 break-all">
                  {video.external_id ? video.external_id : t('common.notProvided')}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('videos.detail.video')}</CardTitle>
            </CardHeader>
            <CardContent>
              {video.file ? (
                <video
                  ref={videoRef}
                  controls
                  className="w-full rounded"
                  src={video.file}
                  onLoadedMetadata={handleVideoLoaded}
                >
                  {t('common.messages.browserNoVideoSupport')}
                </video>
              ) : (
                <p className="text-gray-500">{t('common.messages.videoFileMissing')}</p>
              )}
            </CardContent>
          </Card>

          {video.transcript && video.transcript.trim() ? (
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>{t('videos.detail.transcript')}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-900 whitespace-pre-wrap">{video.transcript}</p>
              </CardContent>
            </Card>
          ) : (
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>{t('videos.detail.transcript')}</CardTitle>
              </CardHeader>
              <CardContent>
                {video.status === 'pending' && (
                  <p className="text-gray-500 italic">{t('common.messages.transcriptionPending')}</p>
                )}
                {video.status === 'processing' && (
                  <p className="text-gray-500 italic">{t('common.messages.transcriptionProcessing')}</p>
                )}
                {video.status === 'completed' && (
                  <p className="text-gray-500 italic">{t('common.messages.transcriptionUnavailable')}</p>
                )}
                {video.status === 'error' && (
                  <p className="text-red-600 italic">{t('common.messages.transcriptionError')}</p>
                )}
              </CardContent>
            </Card>
          )}

          {video.error_message && (
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-red-600">{t('videos.detail.errorCard')}</CardTitle>
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

