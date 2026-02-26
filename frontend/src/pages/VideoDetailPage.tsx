import { useEffect, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useI18nNavigate, useLocale } from '@/lib/i18n';
import { useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useVideo } from '@/hooks/useVideos';
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
import { TagBadge } from '@/components/video/TagBadge';
import { TagSelector } from '@/components/video/TagSelector';
import { useTags } from '@/hooks/useTags';
import { useVideoEditing } from '@/hooks/useVideoEditing';
import type { Tag } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';

interface VideoInfoEditFormProps {
  editedTitle: string;
  editedDescription: string;
  editedTagIds: number[];
  tags: Tag[];
  isUpdating: boolean;
  onTitleChange: (title: string) => void;
  onDescriptionChange: (desc: string) => void;
  onTagToggle: (tagId: number) => void;
  onCreateTag: () => void;
  onSave: () => void;
  onCancel: () => void;
}

function VideoInfoEditForm({
  editedTitle, editedDescription, editedTagIds, tags, isUpdating,
  onTitleChange, onDescriptionChange, onTagToggle, onCreateTag, onSave, onCancel,
}: VideoInfoEditFormProps) {
  const { t } = useTranslation();
  return (
    <>
      <div>
        <label className="text-sm font-medium text-gray-600 block mb-1">
          {t('videos.detail.editTitleLabel')}
        </label>
        <Input
          type="text"
          value={editedTitle}
          onChange={(e) => onTitleChange(e.target.value)}
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
          onChange={(e) => onDescriptionChange(e.target.value)}
          className="w-full min-h-[100px]"
          disabled={isUpdating}
        />
      </div>
      <div>
        <TagSelector
          tags={tags}
          selectedTagIds={editedTagIds}
          onToggle={onTagToggle}
          onCreateNew={onCreateTag}
          disabled={isUpdating}
        />
      </div>
      <div className="flex gap-2 pt-2">
        <Button
          onClick={onSave}
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
        <Button variant="outline" onClick={onCancel} disabled={isUpdating}>
          {t('videos.detail.cancel')}
        </Button>
      </div>
    </>
  );
}

interface TranscriptSectionProps {
  transcript: string | undefined;
  status: string;
}

function TranscriptSection({ transcript, status }: TranscriptSectionProps) {
  const { t } = useTranslation();

  const statusMessages: Record<string, { key: string; className: string }> = {
    pending: { key: 'common.messages.transcriptionPending', className: 'text-gray-500 italic' },
    processing: { key: 'common.messages.transcriptionProcessing', className: 'text-gray-500 italic' },
    completed: { key: 'common.messages.transcriptionUnavailable', className: 'text-gray-500 italic' },
    error: { key: 'common.messages.transcriptionError', className: 'text-red-600 italic' },
  };

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle>{t('videos.detail.transcript')}</CardTitle>
      </CardHeader>
      <CardContent>
        {transcript && transcript.trim() ? (
          <p className="text-gray-900 whitespace-pre-wrap">{transcript}</p>
        ) : (
          <p className={statusMessages[status]?.className || 'text-gray-500 italic'}>
            {t(statusMessages[status]?.key || 'common.messages.transcriptionUnavailable')}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export default function VideoDetailPage() {
  const params = useParams<{ id: string }>();
  const navigate = useI18nNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const videoId = params?.id ? Number.parseInt(params.id, 10) : null;
  const videoRef = useRef<HTMLVideoElement>(null);
  const startTime = searchParams.get('t');
  const { t } = useTranslation();
  const locale = useLocale();

  const { video, isLoading, error, loadVideo } = useVideo(videoId);
  const { tags, createTag } = useTags();

  const {
    isEditing,
    editedTitle,
    editedDescription,
    editedTagIds,
    setEditedTitle,
    setEditedDescription,
    setEditedTagIds,
    startEditing,
    cancelEditing,
    handleUpdateVideo,
    handleCreateTag,
  } = useVideoEditing({ video, videoId, createTag });

  useEffect(() => {
    if (videoId) {
      void loadVideo();
    }
  }, [videoId, loadVideo]);

  const handleVideoLoaded = () => {
    if (videoRef.current && startTime) {
      const seconds = Number.parseInt(startTime, 10);
      if (!Number.isNaN(seconds)) {
        videoRef.current.currentTime = seconds;
        void videoRef.current.play();
      }
    }
  };

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!videoId) return;
      await apiClient.deleteVideo(videoId);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.videos.all });
      navigate('/videos');
    },
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      await handleUpdateVideo();
    },
    onSuccess: async () => {
      cancelEditing();
      if (videoId) {
        await queryClient.invalidateQueries({ queryKey: queryKeys.videos.detail(videoId) });
      }
      await loadVideo();
    },
  });

  const isDeleting = deleteMutation.isPending;
  const deleteError = deleteMutation.error instanceof Error ? deleteMutation.error.message : null;
  const isUpdating = updateMutation.isPending;
  const updateError = updateMutation.error instanceof Error ? updateMutation.error.message : null;

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
                onClick={startEditing}
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
              <Button
                variant="destructive"
                onClick={() => {
                  if (!window.confirm(t('confirmations.deleteVideo'))) return;
                  void deleteMutation.mutateAsync();
                }}
                disabled={isDeleting}
                size="sm"
                className="lg:size-default"
              >
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

        {(error || deleteError || updateError) && (
          <MessageAlert type="error" message={error || deleteError || updateError || ''} />
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>{t('videos.detail.info')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {isEditing ? (
                <VideoInfoEditForm
                  editedTitle={editedTitle}
                  editedDescription={editedDescription}
                  editedTagIds={editedTagIds}
                  tags={tags}
                  isUpdating={isUpdating}
                  onTitleChange={setEditedTitle}
                  onDescriptionChange={setEditedDescription}
                  onTagToggle={(tagId) => {
                    setEditedTagIds(prev =>
                      prev.includes(tagId)
                        ? prev.filter(id => id !== tagId)
                        : [...prev, tagId]
                    );
                  }}
                  onCreateTag={handleCreateTag}
                  onSave={() => void updateMutation.mutateAsync()}
                  onCancel={cancelEditing}
                />
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
                <p className="text-gray-900">{formatDate(video.uploaded_at, 'full', locale)}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-600">{t('videos.detail.labels.externalId')}</p>
                <p className="text-gray-900 break-all">
                  {video.external_id ? video.external_id : t('common.notProvided')}
                </p>
              </div>
              {!isEditing && video.tags && video.tags.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-gray-600 mb-2">{t('videos.detail.labels.tags', 'Tags')}</p>
                  <div className="flex flex-wrap gap-2">
                    {video.tags.map((tag) => (
                      <TagBadge key={tag.id} tag={tag} size="md" />
                    ))}
                  </div>
                </div>
              )}
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
                  src={apiClient.getVideoUrl(video.file)}
                  onLoadedMetadata={handleVideoLoaded}
                >
                  {t('common.messages.browserNoVideoSupport')}
                </video>
              ) : (
                <p className="text-gray-500">{t('common.messages.videoFileMissing')}</p>
              )}
            </CardContent>
          </Card>

          <TranscriptSection
            transcript={video.transcript}
            status={video.status}
          />

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
