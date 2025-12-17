'use client';

import React from 'react';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import { useRouter } from '@/i18n/routing';
import { apiClient, VideoGroup, VideoList, VideoInGroup } from '@/lib/api';
import { PageLayout } from '@/components/layout/PageLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { MessageAlert } from '@/components/common/MessageAlert';
import { InlineSpinner } from '@/components/common/InlineSpinner';
import { Link } from '@/i18n/routing';
import { getStatusBadgeClassName, getStatusLabel, timeStringToSeconds } from '@/lib/utils/video';
import { convertVideoInGroupToSelectedVideo, createVideoIdSet, SelectedVideo } from '@/lib/utils/videoConversion';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { ChatPanel } from '@/components/chat/ChatPanel';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { handleAsyncError } from '@/lib/utils/errorHandling';
import { useAsyncState } from '@/hooks/useAsyncState';
import { useTranslations } from 'next-intl';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  SensorDescriptor,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import {
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// Empty sensors array for mobile to prevent unnecessary re-renders
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const MOBILE_SENSORS: SensorDescriptor<any>[] = [];

const ORDERING_OPTIONS = [
  'uploaded_at_desc',
  'uploaded_at_asc',
  'title_asc',
  'title_desc',
] as const;

type OrderingOption = (typeof ORDERING_OPTIONS)[number];

// Sortable video item component
interface SortableVideoItemProps {
  video: VideoInGroup;
  isSelected: boolean;
  onSelect: (videoId: number) => void;
  onRemove: (videoId: number) => void;
}

interface SortableVideoItemPropsWithMobile extends SortableVideoItemProps {
  isMobile?: boolean;
}

function SortableVideoItem({ video, isSelected, onSelect, onRemove, isMobile = false }: SortableVideoItemPropsWithMobile) {
  const t = useTranslations();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: video.id, disabled: isMobile });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    touchAction: isMobile ? 'auto' : 'none',
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...(isMobile ? {} : attributes)}
      {...(isMobile ? {} : listeners)}
      onClick={() => onSelect(video.id)}
      className={`p-3 border rounded cursor-pointer hover:bg-gray-50 ${
        isMobile ? '' : 'cursor-grab active:cursor-grabbing'
      } ${
        isSelected ? 'bg-blue-50 border-blue-300' : ''
      } ${isDragging ? 'shadow-lg' : ''}`}
    >
      <div className="flex items-center justify-between">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-sm text-gray-900 truncate">{video.title}</h3>
          <p className="text-xs text-gray-600 line-clamp-1">
            {video.description || t('common.messages.noDescription')}
          </p>
          <div className="flex items-center gap-2 mt-2">
            <span className={getStatusBadgeClassName(video.status, 'sm')}>
              {t(getStatusLabel(video.status))}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1 ml-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-xs"
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onRemove(video.id);
            }}
          >
            {t('videos.groupDetail.remove')}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function VideoGroupDetailPage() {
  const params = useParams();
  const router = useRouter();
  const groupId = params?.id ? parseInt(params.id as string) : null;
  const t = useTranslations();

  const { data: group, isLoading, error, execute: loadGroup, setData: setGroup } = useAsyncState<VideoGroup>({
    initialData: null,
  });

  const { data: availableVideos, isLoading: isLoadingVideos, execute: loadAvailableVideos } = useAsyncState<VideoList[]>({
    initialData: [],
  });

  const [isDeleting, setIsDeleting] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [videoSearch, setVideoSearch] = useState('');
  const [videoSearchInput, setVideoSearchInput] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [ordering, setOrdering] = useState<OrderingOption>('uploaded_at_desc');
  const [selectedVideos, setSelectedVideos] = useState<number[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [selectedVideo, setSelectedVideo] = useState<SelectedVideo | null>(null);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [isGeneratingLink, setIsGeneratingLink] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const pendingStartTimeRef = useRef<number | null>(null);

  // Edit mode state management
  const [isEditing, setIsEditing] = useState(false);
  const [editedName, setEditedName] = useState('');
  const [editedDescription, setEditedDescription] = useState('');

  // Mobile tab state
  const [mobileTab, setMobileTab] = useState<'videos' | 'player' | 'chat'>('player');
  
  // Mobile detection state
  const [isMobile, setIsMobile] = useState(false);
  
  // Detect mobile on mount and window resize
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 1024);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const handleOrderingChange = useCallback((event: React.ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value as OrderingOption;
    if (ORDERING_OPTIONS.includes(value)) {
      setOrdering(value);
    }
  }, []);
  // Drag and drop sensor configuration
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // Start drag after 8px movement (prevent accidental clicks)
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const loadGroupData = useCallback(async () => {
    if (!groupId) return;
    await loadGroup(() => apiClient.getVideoGroup(groupId));
  }, [groupId, loadGroup]);

  const loadAvailableVideosData = useCallback(async () => {
    if (!group?.videos) return;
    
    await loadAvailableVideos(async () => {
      const videos = await apiClient.getVideos({
        q: videoSearch.trim() || undefined,
        status: statusFilter || undefined,
        ordering,
      });
      // Exclude videos already added to chat group
      const currentVideoIds = group.videos?.map(v => v.id) || [];
      // Use common Set creation function
      const currentVideoIdSet = createVideoIdSet(currentVideoIds);
      return videos.filter(v => !currentVideoIdSet.has(v.id));
    });
  }, [group?.videos, loadAvailableVideos, videoSearch, statusFilter, ordering]);

  useEffect(() => {
    if (groupId) {
      loadGroupData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);

  // Debounce search input
  useEffect(() => {
    const handler = setTimeout(() => setVideoSearch(videoSearchInput), 300);
    return () => clearTimeout(handler);
  }, [videoSearchInput]);

  useEffect(() => {
    if (isAddModalOpen && group) {
      loadAvailableVideosData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAddModalOpen, videoSearch, statusFilter, ordering]);

  const handleAddVideos = async () => {
    if (selectedVideos.length === 0) {
      return;
    }

    try {
      setIsAdding(true);

      const result = await apiClient.addVideosToGroup(groupId!, selectedVideos);

      await loadGroupData();
      setIsAddModalOpen(false);
      setSelectedVideos([]);

      if (result.skipped_count > 0) {
        alert(
          t('videos.groupDetail.addResult', {
            added: result.added_count,
            skipped: result.skipped_count,
          })
        );
      }
    } catch (err) {
      handleAsyncError(err, t('videos.groupDetail.addError'), () => {});
    } finally {
      setIsAdding(false);
    }
  };

  const handleRemoveVideo = async (videoId: number) => {
    if (!confirm(t('videos.groupDetail.removeVideoConfirm'))) {
      return;
    }

    try {
      await apiClient.removeVideoFromGroup(groupId!, videoId);
      await loadGroupData();
      // Clear selection if deleted video was selected
      if (selectedVideo?.id === videoId) {
        setSelectedVideo(null);
      }
    } catch (err) {
      handleAsyncError(err, t('videos.groupDetail.removeVideoError'), () => {});
    }
  };

  const handleGenerateShareLink = async () => {
    if (!group) return;

    try {
      setIsGeneratingLink(true);
      const result = await apiClient.createShareLink(group.id);
      const shareUrl = `${window.location.origin}/share/${result.share_token}`;
      setShareLink(shareUrl);
      await loadGroupData(); // Reload chat group to update share_token
    } catch (err) {
      handleAsyncError(err, t('videos.groupDetail.generateShareError'), () => {});
    } finally {
      setIsGeneratingLink(false);
    }
  };

  const handleDeleteShareLink = async () => {
    if (!group || !confirm(t('confirmations.disableShareLink'))) return;

    try {
      await apiClient.deleteShareLink(group.id);
      setShareLink(null);
      await loadGroupData(); // Reload chat group
    } catch (err) {
      handleAsyncError(err, t('videos.groupDetail.disableShareError'), () => {});
    }
  };

  const handleCopyShareLink = async () => {
    if (!shareLink) return;

    try {
      // Try modern Clipboard API
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(shareLink);
      } else {
        // Fallback: For older browsers or non-HTTPS
        const textArea = document.createElement('textarea');
        textArea.value = shareLink;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        const successful = document.execCommand('copy');
        textArea.remove();

        if (!successful) {
          throw new Error('Copy command failed');
        }
      }

      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
      alert(t('common.messages.copyFailed'));
    }
  };

  // Set share link when chat group is loaded
  useEffect(() => {
    if (group?.share_token) {
      const shareUrl = `${window.location.origin}/share/${group.share_token}`;
      setShareLink(shareUrl);
    } else {
      setShareLink(null);
    }
    setIsCopied(false); // Reset copy state when share link changes
  }, [group?.share_token]);

  // Initialize edit state when chat group data is loaded
  useEffect(() => {
    if (group) {
      setEditedName(group.name);
      setEditedDescription(group.description || '');
    }
  }, [group]);

  const handleVideoSelect = (videoId: number) => {
    // Use data already fetched with prefetch_related
    const video = group?.videos?.find(v => v.id === videoId);
    if (video) {
      // Use common conversion function
      setSelectedVideo(convertVideoInGroupToSelectedVideo(video));
    }
  };

  // Automatically select first video when group videos are loaded
  useEffect(() => {
    const videos = group?.videos;

    if (!videos || videos.length === 0) {
      if (selectedVideo) {
        setSelectedVideo(null);
      }
      return;
    }

    const exists = selectedVideo
      ? videos.some((video) => video.id === selectedVideo.id)
      : false;

    if (!exists) {
      const firstVideo = convertVideoInGroupToSelectedVideo(videos[0]);
      setSelectedVideo(firstVideo);
    }
  }, [group?.videos, selectedVideo]);

  // Function to select video from chat and play from specified time
  const handleVideoPlayFromTime = (videoId: number, startTime: string) => {
    // Convert time string to seconds using common utility
    const seconds = timeStringToSeconds(startTime);

    // Automatically switch to player tab on mobile
    if (window.innerWidth < 1024) {
      setMobileTab('player');
    }

    // Set time immediately if same video is already selected
    if (selectedVideo?.id === videoId && videoRef.current) {
      videoRef.current.currentTime = seconds;
      videoRef.current.play();
    } else {
      // Save start time when selecting different video
      pendingStartTimeRef.current = seconds;
      handleVideoSelect(videoId);
    }
  };

  // Play from specified time when video is loaded and ready
  const handleVideoCanPlay = (event: React.SyntheticEvent<HTMLVideoElement>) => {
    if (pendingStartTimeRef.current !== null) {
      const videoElement = event.currentTarget;
      videoElement.currentTime = pendingStartTimeRef.current;
      videoElement.play();
      pendingStartTimeRef.current = null;
    }
  };

  // Drag end handler
  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over || active.id === over.id) {
      return;
    }

    if (!group?.videos) {
      return;
    }

    const oldIndex = group.videos.findIndex((video) => video.id === active.id);
    const newIndex = group.videos.findIndex((video) => video.id === over.id);

    if (oldIndex === -1 || newIndex === -1) {
      return;
    }

    // Update local state immediately (optimistic update)
    const newVideos = arrayMove(group.videos, oldIndex, newIndex);
    setGroup({ ...group, videos: newVideos });

    try {
      // Send order to server
      const videoIds = newVideos.map(video => video.id);
      await apiClient.reorderVideosInGroup(groupId!, videoIds);
    } catch (err) {
      handleAsyncError(err, t('videos.groupDetail.orderUpdateError'), () => {});
      await loadGroupData();
    }
  };

  const handleDelete = async () => {
    if (!confirm(t('confirmations.deleteGroup'))) {
      return;
    }

    try {
      setIsDeleting(true);
      await apiClient.deleteVideoGroup(groupId!);
      router.push('/videos/groups');
    } catch (err) {
      handleAsyncError(err, t('videos.groupDetail.deleteError'), () => {});
    } finally {
      setIsDeleting(false);
    }
  };

  const { isLoading: isUpdating, error: updateError, mutate: handleUpdate } = useAsyncState({
    onSuccess: () => {
      setIsEditing(false);
      loadGroupData(); // Reload chat group info
    },
  });

  // Cancel edit
  const handleCancelEdit = () => {
    setIsEditing(false);
    if (group) {
      setEditedName(group.name);
      setEditedDescription(group.description || '');
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

  if (error && !group) {
    return (
      <PageLayout fullWidth>
        <div className="space-y-4">
          <MessageAlert type="error" message={error} />
          <Link href="/videos/groups">
            <Button variant="outline">{t('common.actions.backToList')}</Button>
          </Link>
        </div>
      </PageLayout>
    );
  }

  if (!group) {
    return (
      <PageLayout fullWidth>
        <div className="text-center text-gray-500">
          {t('common.messages.groupNotFound')}
        </div>
      </PageLayout>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      <Header />
      <div className="flex-1 w-full px-6 py-6">
        <div className="space-y-4 h-full flex flex-col">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div className="flex-1">
              {isEditing ? (
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium text-gray-600 block mb-1">
                      {t('videos.groups.nameLabel')}
                    </label>
                    <Input
                      type="text"
                      value={editedName}
                      onChange={(e) => setEditedName(e.target.value)}
                      className="w-full"
                      disabled={isUpdating}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-600 block mb-1">
                      {t('videos.groups.descriptionLabel')}
                    </label>
                    <Textarea
                      value={editedDescription}
                      onChange={(e) => setEditedDescription(e.target.value)}
                      className="w-full min-h-[100px]"
                      disabled={isUpdating}
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      onClick={() => handleUpdate(async () => {
                        if (!groupId) return;
                        await apiClient.updateVideoGroup(groupId, {
                          name: editedName,
                          description: editedDescription,
                        });
                      })}
                      disabled={isUpdating || !editedName.trim()}
                    >
                      {isUpdating ? (
                        <span className="flex items-center">
                          <InlineSpinner className="mr-2" />
                          {t('common.actions.saving')}
                        </span>
                      ) : (
                        t('common.actions.save')
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={handleCancelEdit}
                      disabled={isUpdating}
                    >
                      {t('common.actions.cancel')}
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <h1 className="text-2xl lg:text-3xl font-bold text-gray-900">{group.name}</h1>
                  <p className="text-sm lg:text-base text-gray-500 mt-1">
                    {group.description || t('common.messages.noDescription')}
                  </p>
                </>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {!isEditing && (
                <Button
                  variant="outline"
                  onClick={() => setIsEditing(true)}
                  size="sm"
                  className="lg:size-default"
                >
                  {t('videos.groupDetail.edit')}
                </Button>
              )}
              {!isEditing && (
                <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" className="lg:size-default">
                      {t('videos.groupDetail.addVideos')}
                    </Button>
                  </DialogTrigger>
                <DialogContent className="max-w-[95vw] lg:max-w-2xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>{t('videos.groupDetail.addVideos')}</DialogTitle>
                    <DialogDescription>
                      {t('videos.groupDetail.addDescription')}
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Input
                        placeholder={t('videos.groupDetail.searchPlaceholder')}
                        value={videoSearchInput}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setVideoSearchInput(e.target.value)}
                        className="w-full md:w-1/2"
                      />
                      <select
                        value={statusFilter}
                        onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setStatusFilter(e.target.value)}
                        className="border border-gray-300 rounded px-2 py-2 text-sm bg-white"
                      >
                        <option value="">{t('videos.groupDetail.statusFilter.all')}</option>
                        <option value="completed">{t('videos.groupDetail.statusFilter.completed')}</option>
                        <option value="processing">{t('videos.groupDetail.statusFilter.processing')}</option>
                        <option value="pending">{t('videos.groupDetail.statusFilter.pending')}</option>
                        <option value="error">{t('videos.groupDetail.statusFilter.error')}</option>
                      </select>
                      <select
                        value={ordering}
                        onChange={handleOrderingChange}
                        className="border border-gray-300 rounded px-2 py-2 text-sm bg-white"
                      >
                        <option value="uploaded_at_desc">
                          {t('videos.groupDetail.ordering.uploadedDesc')}
                        </option>
                        <option value="uploaded_at_asc">
                          {t('videos.groupDetail.ordering.uploadedAsc')}
                        </option>
                        <option value="title_asc">
                          {t('videos.groupDetail.ordering.titleAsc')}
                        </option>
                        <option value="title_desc">
                          {t('videos.groupDetail.ordering.titleDesc')}
                        </option>
                      </select>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedVideos(availableVideos?.map(v => v.id) ?? [])}
                        disabled={!availableVideos?.length}
                      >
                        {t('videos.groupDetail.selectAll')}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedVideos([])}
                        disabled={selectedVideos.length === 0}
                      >
                        {t('videos.groupDetail.clearSelection')}
                      </Button>
                    </div>

                    {isLoadingVideos ? (
                      <LoadingSpinner />
                    ) : availableVideos && availableVideos.length === 0 ? (
                      <p className="text-center text-gray-500 py-4">
                        {t('videos.groupDetail.noAvailableVideos')}
                      </p>
                    ) : (
                      <div className="space-y-2 max-h-[400px] overflow-y-auto">
                        {availableVideos?.map((video) => (
                          <div key={video.id} className="flex items-center space-x-2 p-3 border rounded hover:bg-gray-50">
                            <Checkbox
                              id={`video-${video.id}`}
                              checked={selectedVideos.includes(video.id)}
                              onCheckedChange={(checked: boolean | 'indeterminate') => {
                                if (checked === true) {
                                  setSelectedVideos([...selectedVideos, video.id]);
                                } else if (checked === false) {
                                  setSelectedVideos(selectedVideos.filter(id => id !== video.id));
                                }
                              }}
                            />
                            <label htmlFor={`video-${video.id}`} className="flex-1 cursor-pointer">
                              <div className="font-medium text-gray-900">{video.title}</div>
                              <div className="text-sm text-gray-600">
                                {video.description || t('common.messages.noDescription')}
                              </div>
                            </label>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsAddModalOpen(false)}>
                      {t('common.actions.cancel')}
                    </Button>
                    <Button onClick={handleAddVideos} disabled={isAdding || selectedVideos.length === 0}>
                      {isAdding ? (
                        <span className="flex items-center">
                          <InlineSpinner className="mr-2" />
                          {t('videos.groupDetail.adding')}
                        </span>
                      ) : (
                        t('videos.groupDetail.add')
                      )}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
              )}
              <Link href="/videos/groups">
                <Button variant="outline" size="sm" className="lg:size-default">
                  {t('common.actions.backToList')}
                </Button>
              </Link>
              {!isEditing && (
                <Button variant="destructive" onClick={handleDelete} disabled={isDeleting} size="sm" className="lg:size-default">
                  {isDeleting ? (
                    <span className="flex items-center">
                      <InlineSpinner className="mr-2" color="red" />
                      {t('videos.groupDetail.deleting')}
                    </span>
                  ) : (
                    t('videos.groupDetail.delete')
                  )}
                </Button>
              )}
            </div>
          </div>

          {(error || updateError) && <MessageAlert type="error" message={error || updateError || ''} />}

          {/* Share link section */}
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-2">
              {t('videos.groupDetail.share.title')}
            </h3>
            {shareLink ? (
              <div className="space-y-2">
                <p className="text-xs text-gray-600">
                  {t('videos.groupDetail.share.enabled')}
                </p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={shareLink}
                    readOnly
                    className="flex-1 px-2 py-1.5 border border-gray-300 rounded text-xs"
                  />
                  <Button
                    onClick={handleCopyShareLink}
                    variant={isCopied ? "default" : "outline"}
                    size="sm"
                    disabled={isCopied}
                  >
                    {isCopied ? t('videos.groupDetail.copied') : t('videos.groupDetail.copy')}
                  </Button>
                  <Button onClick={handleDeleteShareLink} variant="destructive" size="sm">
                    {t('videos.groupDetail.disable')}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-gray-600">
                  {t('videos.groupDetail.share.disabled')}
                </p>
                <Button
                  onClick={handleGenerateShareLink}
                  disabled={isGeneratingLink}
                  size="sm"
                >
                  {isGeneratingLink ? (
                    <span className="flex items-center">
                      <InlineSpinner className="mr-2" />
                      {t('videos.groupDetail.generating')}
                    </span>
                  ) : (
                    t('videos.groupDetail.generate')
                  )}
                </Button>
              </div>
            )}
          </div>

          {/* Mobile tab navigation */}
          <div className="lg:hidden flex border-b border-gray-200 bg-white rounded-t-lg">
            <button
              onClick={() => setMobileTab('videos')}
              className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                mobileTab === 'videos'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {t('videos.groupDetail.mobileTabs.videos')}
            </button>
            <button
              onClick={() => setMobileTab('player')}
              className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                mobileTab === 'player'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {t('videos.groupDetail.mobileTabs.player')}
            </button>
            <button
              onClick={() => setMobileTab('chat')}
              className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                mobileTab === 'chat'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {t('videos.groupDetail.mobileTabs.chat')}
            </button>
          </div>

          {/* Responsive layout: Tab switching on mobile, 3-column on PC */}
          <div className="flex flex-col lg:grid flex-1 min-h-0 gap-4 lg:gap-6 lg:grid-cols-[320px_minmax(0,1fr)_360px]">
          {/* Left: Video list */}
          <div className={`flex-col min-h-0 ${mobileTab === 'videos' ? 'flex' : 'hidden lg:flex'}`}>
            <Card className="h-[500px] lg:h-[600px] flex flex-col">
              <CardHeader>
                <CardTitle>{t('videos.groupDetail.videoListTitle')}</CardTitle>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col overflow-hidden">
                <div className="flex-1 overflow-y-auto space-y-2">
                  {group.videos && group.videos.length > 0 ? (
                    <DndContext
                      sensors={isMobile ? MOBILE_SENSORS : sensors}
                      collisionDetection={closestCenter}
                      onDragEnd={handleDragEnd}
                    >
                      <SortableContext
                        items={group.videos.map(video => video.id)}
                        strategy={verticalListSortingStrategy}
                      >
                        {group.videos.map((video) => (
                          <SortableVideoItem
                            key={video.id}
                            video={video}
                            isSelected={selectedVideo?.id === video.id}
                            isMobile={isMobile}
                            onSelect={(videoId) => {
                              handleVideoSelect(videoId);
                              if (isMobile) {
                                setMobileTab('player');
                              }
                            }}
                            onRemove={handleRemoveVideo}
                          />
                        ))}
                      </SortableContext>
                    </DndContext>
                  ) : (
                    <p className="text-center text-gray-500 py-4 text-sm">
                      {t('videos.groupDetail.videoListEmpty')}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Center: Video player */}
          <div className={`flex-col min-h-0 ${mobileTab === 'player' ? 'flex' : 'hidden lg:flex'}`}>
            <Card className="h-[500px] lg:h-[600px] flex flex-col">
              <CardHeader>
                <CardTitle className="text-base lg:text-lg">
                  {selectedVideo ? selectedVideo.title : t('videos.groupDetail.playerPlaceholder')}
                </CardTitle>
                {selectedVideo && (
                  <p className="text-xs lg:text-sm text-gray-600 mt-1">
                    {selectedVideo.description || t('common.messages.noDescription')}
                  </p>
                )}
              </CardHeader>
              <CardContent className="flex-1 flex items-center justify-center overflow-hidden">
                {selectedVideo ? (
                  selectedVideo.file ? (
                    <video
                      ref={videoRef}
                      key={selectedVideo.id}
                      controls
                      className="w-full h-full max-h-[400px] lg:max-h-[500px] rounded object-contain"
                      src={selectedVideo.file}
                      onCanPlay={handleVideoCanPlay}
                    >
                      {t('common.messages.browserNoVideoSupport')}
                    </video>
                  ) : (
                    <p className="text-gray-500 text-sm">
                      {t('videos.groupDetail.videoNoFile')}
                    </p>
                  )
                ) : (
                  <p className="text-gray-500 text-center text-sm">
                    {t('videos.groupDetail.playerPlaceholder')}
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right: Chat */}
          <div className={`flex-col min-h-0 ${mobileTab === 'chat' ? 'flex' : 'hidden lg:flex'}`}>
            <ChatPanel
              groupId={groupId ?? undefined}
              onVideoPlay={handleVideoPlayFromTime}
              className="h-[500px] lg:h-[600px]"
            />
          </div>
        </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}

