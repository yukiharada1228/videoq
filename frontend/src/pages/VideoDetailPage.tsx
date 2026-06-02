import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useI18nNavigate } from '@/lib/i18n';
import { apiClient } from '@/lib/api';
import { filterTranscriptSegments, isSrtFormat, parseSrtTranscript } from '@/lib/transcript/srt';
import { invalidateAfterTranscriptEdit } from '@/lib/cacheInvalidation';
import { useConfirm } from '@/components/common/feedback';
import { VideoDetailView } from '@/components/video/detail/VideoDetailView';
import { useTags } from '@/hooks/useTags';
import { useVideo } from '@/hooks/useVideos';
import { useVideoEditing } from '@/hooks/useVideoEditing';
import { useVideoDetailPageMutations } from '@/hooks/useVideoDetailPageData';

type MobileTab = 'transcript' | 'video';

export default function VideoDetailPage() {
  const params = useParams<{ id: string }>();
  const navigate = useI18nNavigate();
  const [searchParams] = useSearchParams();
  const videoId = params?.id ? Number.parseInt(params.id, 10) : null;
  const videoRef = useRef<HTMLVideoElement>(null);
  const startTime = searchParams.get('t');
  const [manualYoutubeStartSeconds, setManualYoutubeStartSeconds] = useState<number | null>(null);
  const { t } = useTranslation();
  const requestConfirmation = useConfirm();
  const queryClient = useQueryClient();

  const [transcriptSearch, setTranscriptSearch] = useState('');
  const [isTranscriptEditing, setIsTranscriptEditing] = useState(false);
  const [editedTranscript, setEditedTranscript] = useState('');
  const [transcriptSaveError, setTranscriptSaveError] = useState<string | null>(null);
  const [activeSegmentIdx, setActiveSegmentIdx] = useState<number | null>(null);
  const [mobileTab, setMobileTab] = useState<MobileTab>('video');
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 1024);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const { video, isLoading, error } = useVideo(videoId);
  const { tags, createTag } = useTags();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);

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
  } = useVideoEditing({ video, videoId });

  const handleCreateTag = useCallback(async (name: string, color: string) => {
    const newTag = await createTag(name, color);
    setEditedTagIds((prev) => (prev.includes(newTag.id) ? prev : [...prev, newTag.id]));
  }, [createTag, setEditedTagIds]);

  const handleVideoLoaded = () => {
    if (videoRef.current && startTime) {
      const seconds = Number.parseInt(startTime, 10);
      if (!Number.isNaN(seconds)) {
        videoRef.current.currentTime = seconds;
        void videoRef.current.play();
      }
    }
  };

  const queryYoutubeStartSeconds = (() => {
    if (!startTime) {
      return null;
    }
    const seconds = Number.parseInt(startTime, 10);
    return Number.isNaN(seconds) ? null : seconds;
  })();

  const youtubeStartSeconds = manualYoutubeStartSeconds ?? queryYoutubeStartSeconds;

  const [deleteError, setDeleteError] = useState<string | null>(null);

  const { deleteMutation, updateMutation } = useVideoDetailPageMutations({
    videoId,
    onDeleteSuccess: () => navigate('/videos'),
    onUpdate: handleUpdateVideo,
    onUpdateSuccess: cancelEditing,
    onDeleteError: (err) => setDeleteError(err instanceof Error ? err.message : String(err)),
  });

  const isDeleting = deleteMutation.isPending;
  const isUpdating = updateMutation.isPending;
  const updateError = updateMutation.error instanceof Error ? updateMutation.error.message : null;

  const handleDeleteVideo = useCallback(async () => {
    const confirmed = await requestConfirmation({
      title: t('confirmations.deleteVideo'),
      confirmLabel: t('common.actions.delete'),
      cancelLabel: t('common.actions.cancel'),
      variant: 'danger',
    });
    if (!confirmed) return;
    setDeleteError(null);
    deleteMutation.mutate();
  }, [requestConfirmation, deleteMutation, t]);

  const handleCancelEdit = useCallback(() => {
    cancelEditing();
    updateMutation.reset();
  }, [cancelEditing, updateMutation]);

  const transcriptUpdateMutation = useMutation({
    mutationFn: async () => {
      if (!videoId) return;
      await apiClient.updateVideo(videoId, { transcript: editedTranscript });
    },
    onSuccess: async () => {
      if (videoId) {
        await invalidateAfterTranscriptEdit(queryClient, videoId);
      }
      setIsTranscriptEditing(false);
      setTranscriptSearch('');
      setTranscriptSaveError(null);
    },
    onError: (err: unknown) => {
      setTranscriptSaveError(err instanceof Error ? err.message : String(err));
    },
  });

  const startTranscriptEditing = () => {
    setEditedTranscript(video?.transcript ?? '');
    setTranscriptSaveError(null);
    setIsTranscriptEditing(true);
  };

  const cancelTranscriptEditing = () => {
    setEditedTranscript(video?.transcript ?? '');
    setTranscriptSaveError(null);
    setIsTranscriptEditing(false);
  };

  const transcript = video?.transcript ?? null;
  const transcriptSegments = useMemo(() => {
    if (!transcript || !isSrtFormat(transcript)) return [];
    return parseSrtTranscript(transcript);
  }, [transcript]);

  const filteredSegments = useMemo(
    () => filterTranscriptSegments(transcriptSegments, transcriptSearch),
    [transcriptSegments, transcriptSearch],
  );

  const handleSeek = (seconds: number, idx: number) => {
    if (video?.source_type === 'youtube') {
      setManualYoutubeStartSeconds(seconds);
    } else if (videoRef.current) {
      videoRef.current.currentTime = seconds;
      void videoRef.current.play();
    }
    setActiveSegmentIdx(idx);
  };

  const isPlainTextTranscript = Boolean(video?.transcript?.trim()) && !isSrtFormat(video?.transcript ?? '');

  return (
    <VideoDetailView
      video={video}
      isLoading={isLoading}
      error={error}
      videoRef={videoRef}
      youtubeStartSeconds={youtubeStartSeconds}
      onVideoLoaded={handleVideoLoaded}
      isMobile={isMobile}
      mobileTab={mobileTab}
      onMobileTabChange={setMobileTab}
      tags={tags}
      isCreateDialogOpen={isCreateDialogOpen}
      onCreateDialogOpenChange={setIsCreateDialogOpen}
      onCreateTag={handleCreateTag}
      isEditing={isEditing}
      editedTitle={editedTitle}
      editedDescription={editedDescription}
      editedTagIds={editedTagIds}
      onEditedTitleChange={setEditedTitle}
      onEditedDescriptionChange={setEditedDescription}
      onEditedTagIdsChange={setEditedTagIds}
      onStartEditing={startEditing}
      onCancelEdit={handleCancelEdit}
      onUpdateVideo={() => updateMutation.mutate()}
      isUpdating={isUpdating}
      updateError={updateError}
      deleteError={deleteError}
      isDeleting={isDeleting}
      onDeleteVideo={handleDeleteVideo}
      transcriptSearch={transcriptSearch}
      onTranscriptSearchChange={setTranscriptSearch}
      isTranscriptEditing={isTranscriptEditing}
      onStartTranscriptEditing={startTranscriptEditing}
      onCancelTranscriptEditing={cancelTranscriptEditing}
      editedTranscript={editedTranscript}
      onEditedTranscriptChange={setEditedTranscript}
      onSaveTranscript={() => transcriptUpdateMutation.mutate()}
      isTranscriptSaving={transcriptUpdateMutation.isPending}
      transcriptSaveError={transcriptSaveError}
      filteredSegments={filteredSegments}
      activeSegmentIdx={activeSegmentIdx}
      onSeek={handleSeek}
      isPlainTextTranscript={isPlainTextTranscript}
    />
  );
}
