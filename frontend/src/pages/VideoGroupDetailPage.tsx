import { useCallback, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { arrayMove } from '@dnd-kit/sortable';
import type { DragEndEvent } from '@dnd-kit/core';
import { useI18nNavigate } from '@/lib/i18n';
import { handleAsyncError } from '@/lib/utils/errorHandling';
import { convertVideoInGroupToSelectedVideo, type SelectedVideo } from '@/lib/utils/videoConversion';
import { useAuth } from '@/hooks/useAuth';
import { useShareLink } from '@/hooks/useShareLink';
import { useVideoPlayback } from '@/hooks/useVideoPlayback';
import { useMobileTab } from '@/hooks/useMobileTab';
import {
  useVideoGroupDetailMutations,
  useVideoGroupDetailQuery,
} from '@/hooks/useVideoGroupDetailData';
import { useConfirm } from '@/components/common/feedback';
import { VideoGroupDetailView } from '@/components/video/group-detail/VideoGroupDetailView';

export default function VideoGroupDetailPage() {
  const params = useParams<{ id: string }>();
  const navigate = useI18nNavigate();
  const groupId = params?.id ? Number.parseInt(params.id, 10) : null;
  const { t } = useTranslation();
  const requestConfirmation = useConfirm();

  useAuth();

  const { group, isLoading: groupIsLoading, errorMessage: error } =
    useVideoGroupDetailQuery(groupId);

  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedVideoId, setSelectedVideoId] = useState<number | null>(null);
  const [autoVideoId, setAutoVideoId] = useState<number | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editedName, setEditedName] = useState('');
  const [editedDescription, setEditedDescription] = useState('');

  const currentVideos = group?.videos;
  const firstVideoId = currentVideos?.[0]?.id ?? null;
  const autoVideoInList = autoVideoId !== null && (currentVideos?.some((video) => video.id === autoVideoId) ?? false);
  if (!autoVideoInList && firstVideoId !== null) {
    setAutoVideoId(firstVideoId);
  }

  const selectedVideo = useMemo<SelectedVideo | null>(() => {
    const videos = group?.videos;
    if (!videos || videos.length === 0) return null;

    if (selectedVideoId !== null) {
      const found = videos.find((video) => video.id === selectedVideoId);
      if (found) return convertVideoInGroupToSelectedVideo(found);
    }

    if (autoVideoId !== null) {
      const found = videos.find((video) => video.id === autoVideoId);
      if (found) return convertVideoInGroupToSelectedVideo(found);
    }

    return convertVideoInGroupToSelectedVideo(videos[0]);
  }, [group?.videos, selectedVideoId, autoVideoId]);

  const { mobileTab, setMobileTab, isMobile } = useMobileTab();
  const { shareLink, isGeneratingLink, isCopied, generateShareLink, deleteShareLink, copyShareLink } = useShareLink(group);

  const handleVideoSelect = useCallback((videoId: number) => {
    setSelectedVideoId(videoId);
  }, []);

  const { videoRef, handleVideoCanPlay, handleVideoPlayFromTime, youtubeStartSeconds } = useVideoPlayback({
    selectedVideo,
    onVideoSelect: handleVideoSelect,
    onMobileSwitch: () => setMobileTab('player'),
  });

  const { syncGroupDetail, setGroupDetailCache, removeVideoMutation, reorderVideosMutation, deleteGroupMutation, updateGroupMutation } =
    useVideoGroupDetailMutations({
      groupId,
      onDeleteSuccess: () => navigate('/videos/groups'),
      onUpdateSuccess: () => setIsEditing(false),
    });

  const handleRemoveVideo = async (videoId: number) => {
    if (!groupId) return;
    const confirmed = await requestConfirmation({
      title: t('videos.groupDetail.removeVideoConfirm'),
      confirmLabel: t('common.actions.confirm'),
      cancelLabel: t('common.actions.cancel'),
      variant: 'danger',
    });
    if (!confirmed) return;
    try {
      await removeVideoMutation.mutateAsync(videoId);
      if (selectedVideoId === videoId) setSelectedVideoId(null);
    } catch (err) {
      handleAsyncError(err, t('videos.groupDetail.removeVideoError'), () => {});
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !group?.videos || !groupId) return;
    const oldIndex = group.videos.findIndex((video) => video.id === active.id);
    const newIndex = group.videos.findIndex((video) => video.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const newVideos = arrayMove(group.videos, oldIndex, newIndex);
    setGroupDetailCache({ ...group, videos: newVideos });
    try {
      await reorderVideosMutation.mutateAsync(newVideos.map((video) => video.id));
    } catch (err) {
      handleAsyncError(err, t('videos.groupDetail.orderUpdateError'), () => {});
      await syncGroupDetail();
    }
  };

  const handleDelete = async () => {
    if (!groupId) return;
    const confirmed = await requestConfirmation({
      title: t('confirmations.deleteGroup'),
      confirmLabel: t('common.actions.delete'),
      cancelLabel: t('common.actions.cancel'),
      variant: 'danger',
    });
    if (!confirmed) return;
    setDeleteError(null);
    try {
      await deleteGroupMutation.mutateAsync();
    } catch (err) {
      handleAsyncError(err, t('videos.groupDetail.deleteError'), setDeleteError);
    }
  };

  const handleStartEdit = () => {
    if (!group) return;
    setEditedName(group.name);
    setEditedDescription(group.description || '');
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    updateGroupMutation.reset();
    if (group) {
      setEditedName(group.name);
      setEditedDescription(group.description || '');
    }
  };

  const isLoading = groupIsLoading;
  const isDeleting = deleteGroupMutation.isPending;
  const isUpdating = updateGroupMutation.isPending;
  const updateError = updateGroupMutation.error instanceof Error ? updateGroupMutation.error.message : null;

  return (
    <VideoGroupDetailView
      group={group}
      groupId={groupId}
      isLoading={isLoading}
      error={error}
      selectedVideo={selectedVideo}
      deleteError={deleteError}
      isDeleting={isDeleting}
      isEditing={isEditing}
      editedName={editedName}
      editedDescription={editedDescription}
      updateError={updateError}
      isUpdating={isUpdating}
      isAddModalOpen={isAddModalOpen}
      mobileTab={mobileTab}
      isMobile={isMobile}
      videoRef={videoRef}
      youtubeStartSeconds={youtubeStartSeconds}
      shareSlug={group?.share_slug ?? ''}
      shareLink={shareLink}
      isGeneratingLink={isGeneratingLink}
      isCopied={isCopied}
      onMobileTabChange={setMobileTab}
      onOpenAddModalChange={setIsAddModalOpen}
      onStartEditing={handleStartEdit}
      onCancelEdit={handleCancelEdit}
      onEditedNameChange={setEditedName}
      onEditedDescriptionChange={setEditedDescription}
      onUpdateGroup={() => updateGroupMutation.mutate({ name: editedName, description: editedDescription })}
      onDeleteGroup={handleDelete}
      onVideoSelect={handleVideoSelect}
      onRemoveVideo={handleRemoveVideo}
      onDragEnd={handleDragEnd}
      onVideoCanPlay={handleVideoCanPlay}
      onVideoPlayFromTime={handleVideoPlayFromTime}
      onGenerateShareLink={generateShareLink}
      onDeleteShareLink={deleteShareLink}
      onCopyShareLink={copyShareLink}
    />
  );
}
