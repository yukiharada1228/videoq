import { useCallback, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { arrayMove } from '@dnd-kit/sortable';
import type { DragEndEvent } from '@dnd-kit/core';
import { useI18nNavigate } from '@/lib/i18n';
import { handleAsyncError } from '@/lib/utils/errorHandling';
import { convertVideoInCourseToSelectedVideo, type SelectedVideo } from '@/lib/utils/videoConversion';
import { useAuth } from '@/hooks/useAuth';
import { useShareLink } from '@/hooks/useShareLink';
import { useVideoPlayback } from '@/hooks/useVideoPlayback';
import { useMobileTab } from '@/hooks/useMobileTab';
import {
  useVideoCourseDetailMutations,
  useVideoCourseDetailQuery,
} from '@/hooks/useVideoCourseDetailData';
import { useConfirm } from '@/components/common/feedback';
import { VideoCourseDetailView } from '@/components/video/course-detail/VideoCourseDetailView';
import { apiClient } from '@/lib/api';

export default function VideoCourseDetailPage() {
  const params = useParams<{ id: string }>();
  const navigate = useI18nNavigate();
  const courseId = params?.id ? Number.parseInt(params.id, 10) : null;
  const { t } = useTranslation();
  const requestConfirmation = useConfirm();

  useAuth();

  const { course, isLoading: courseIsLoading, errorMessage: error } =
    useVideoCourseDetailQuery(courseId);

  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isMembersModalOpen, setIsMembersModalOpen] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const [selectedVideoId, setSelectedVideoId] = useState<number | null>(null);
  const [autoVideoId, setAutoVideoId] = useState<number | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editedName, setEditedName] = useState('');
  const [editedDescription, setEditedDescription] = useState('');

  const currentVideos = course?.videos;
  const firstVideoId = currentVideos?.[0]?.id ?? null;
  const autoVideoInList = autoVideoId !== null && (currentVideos?.some((video) => video.id === autoVideoId) ?? false);
  if (!autoVideoInList && firstVideoId !== null) {
    setAutoVideoId(firstVideoId);
  }

  const selectedVideo = useMemo<SelectedVideo | null>(() => {
    const videos = course?.videos;
    if (!videos || videos.length === 0) return null;

    if (selectedVideoId !== null) {
      const found = videos.find((video) => video.id === selectedVideoId);
      if (found) return convertVideoInCourseToSelectedVideo(found);
    }

    if (autoVideoId !== null) {
      const found = videos.find((video) => video.id === autoVideoId);
      if (found) return convertVideoInCourseToSelectedVideo(found);
    }

    return convertVideoInCourseToSelectedVideo(videos[0]);
  }, [course?.videos, selectedVideoId, autoVideoId]);

  const { mobileTab, setMobileTab, isMobile } = useMobileTab();
  const { shareLink, isGeneratingLink, isCopied, generateShareLink, deleteShareLink, copyShareLink } = useShareLink(course);

  const handleVideoSelect = useCallback((videoId: number) => {
    setSelectedVideoId(videoId);
  }, []);

  const { videoRef, handleVideoCanPlay, handleVideoPlayFromTime, youtubeStartSeconds } = useVideoPlayback({
    selectedVideo,
    onVideoSelect: handleVideoSelect,
    onMobileSwitch: () => setMobileTab('player'),
  });

  const { syncCourseDetail, setCourseDetailCache, removeVideoMutation, reorderVideosMutation, deleteCourseMutation, updateCourseMutation } =
    useVideoCourseDetailMutations({
      courseId,
      onDeleteSuccess: () => navigate('/videos/courses'),
      onUpdateSuccess: () => setIsEditing(false),
    });

  const handleRemoveVideo = async (videoId: number) => {
    if (!courseId) return;
    const confirmed = await requestConfirmation({
      title: t('videos.courseDetail.removeVideoConfirm'),
      confirmLabel: t('common.actions.confirm'),
      cancelLabel: t('common.actions.cancel'),
      variant: 'danger',
    });
    if (!confirmed) return;
    try {
      await removeVideoMutation.mutateAsync(videoId);
      if (selectedVideoId === videoId) setSelectedVideoId(null);
    } catch (err) {
      handleAsyncError(err, t('videos.courseDetail.removeVideoError'), () => {});
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !course?.videos || !courseId) return;
    const oldIndex = course.videos.findIndex((video) => video.id === active.id);
    const newIndex = course.videos.findIndex((video) => video.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const newVideos = arrayMove(course.videos, oldIndex, newIndex);
    setCourseDetailCache({ ...course, videos: newVideos });
    try {
      await reorderVideosMutation.mutateAsync(newVideos.map((video) => video.id));
    } catch (err) {
      handleAsyncError(err, t('videos.courseDetail.orderUpdateError'), () => {});
      await syncCourseDetail();
    }
  };

  const handleDelete = async () => {
    if (!courseId) return;
    const confirmed = await requestConfirmation({
      title: t('confirmations.deleteCourse'),
      confirmLabel: t('common.actions.delete'),
      cancelLabel: t('common.actions.cancel'),
      variant: 'danger',
    });
    if (!confirmed) return;
    setDeleteError(null);
    try {
      await deleteCourseMutation.mutateAsync();
    } catch (err) {
      handleAsyncError(err, t('videos.courseDetail.deleteError'), setDeleteError);
    }
  };

  const handleStartEdit = () => {
    if (!course) return;
    setEditedName(course.name);
    setEditedDescription(course.description || '');
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    updateCourseMutation.reset();
    if (course) {
      setEditedName(course.name);
      setEditedDescription(course.description || '');
    }
  };

  const isLoading = courseIsLoading;
  const isDeleting = deleteCourseMutation.isPending;
  const isUpdating = updateCourseMutation.isPending;
  const updateError = updateCourseMutation.error instanceof Error ? updateCourseMutation.error.message : null;

  const handleLeave = async () => {
    if (!courseId || !course || isLeaving) return;
    const confirmed = await requestConfirmation({
      title: t('confirmations.leaveCourse', { name: course.name }),
      description: t('confirmations.leaveCourseDescription'),
      confirmLabel: t('videos.courseDetail.leave'),
      cancelLabel: t('common.actions.cancel'),
      variant: 'danger',
    });
    if (!confirmed) return;
    setIsLeaving(true);
    setDeleteError(null);
    try {
      await apiClient.leaveVideoCourse(courseId);
      navigate('/videos/courses');
    } catch (err) {
      handleAsyncError(err, t('videos.courseDetail.leaveError'), setDeleteError);
    } finally {
      setIsLeaving(false);
    }
  };

  return (
    <VideoCourseDetailView
      course={course}
      courseId={courseId}
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
      isMembersModalOpen={isMembersModalOpen}
      isLeaving={isLeaving}
      mobileTab={mobileTab}
      isMobile={isMobile}
      videoRef={videoRef}
      youtubeStartSeconds={youtubeStartSeconds}
      shareSlug={course?.share_slug ?? ''}
      shareLink={shareLink}
      isGeneratingLink={isGeneratingLink}
      isCopied={isCopied}
      onMobileTabChange={setMobileTab}
      onOpenAddModalChange={setIsAddModalOpen}
      onOpenMembersModalChange={setIsMembersModalOpen}
      onStartEditing={handleStartEdit}
      onCancelEdit={handleCancelEdit}
      onEditedNameChange={setEditedName}
      onEditedDescriptionChange={setEditedDescription}
      onUpdateCourse={() => updateCourseMutation.mutate({ name: editedName, description: editedDescription })}
      onDeleteCourse={handleDelete}
      onLeaveGroup={handleLeave}
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
