import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type SensorDescriptor,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
 
import { apiClient, type VideoGroup, type VideoInGroup, type VideoList } from '@/lib/api';
import { ChatPanel } from '@/components/chat/ChatPanel';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { MessageAlert } from '@/components/common/MessageAlert';
import { InlineSpinner } from '@/components/common/InlineSpinner';
import { Link, addLocalePrefix, useI18nNavigate } from '@/lib/i18n';
import { type Locale } from '@/i18n/config';
import { handleAsyncError } from '@/lib/utils/errorHandling';
import { useAsyncState } from '@/hooks/useAsyncState';
import { getStatusBadgeClassName, getStatusLabel, timeStringToSeconds } from '@/lib/utils/video';
import { convertVideoInGroupToSelectedVideo, createVideoIdSet, type SelectedVideo } from '@/lib/utils/videoConversion';
 
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
 
interface SortableVideoItemProps {
  video: VideoInGroup;
  isSelected: boolean;
  onSelect: (videoId: number) => void;
  onRemove: (videoId: number) => void;
  isMobile?: boolean;
}
 
function SortableVideoItem({ video, isSelected, onSelect, onRemove, isMobile = false }: SortableVideoItemProps) {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: video.id,
    disabled: isMobile,
  });
 
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
      } ${isSelected ? 'bg-blue-50 border-blue-300' : ''} ${isDragging ? 'shadow-lg' : ''}`}
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
  const params = useParams<{ id: string }>();
  const navigate = useI18nNavigate();
  const groupId = params?.id ? Number.parseInt(params.id, 10) : null;
  const { t, i18n } = useTranslation();
 
  const { data: group, isLoading, error, execute: loadGroup, setData: setGroup } = useAsyncState<VideoGroup | null>({
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
 
  const [isEditing, setIsEditing] = useState(false);
  const [editedName, setEditedName] = useState('');
  const [editedDescription, setEditedDescription] = useState('');
 
  const [mobileTab, setMobileTab] = useState<'videos' | 'player' | 'chat'>('player');
  const [isMobile, setIsMobile] = useState(false);
 
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 1024);
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
 
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
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
      const currentVideoIds = group.videos?.map((v) => v.id) || [];
      const currentVideoIdSet = createVideoIdSet(currentVideoIds);
      return videos.filter((v) => !currentVideoIdSet.has(v.id));
    });
  }, [group?.videos, loadAvailableVideos, videoSearch, statusFilter, ordering, group]);
 
  useEffect(() => {
    if (groupId) {
      void loadGroupData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);
 
  useEffect(() => {
    const handler = setTimeout(() => setVideoSearch(videoSearchInput), 300);
    return () => clearTimeout(handler);
  }, [videoSearchInput]);
 
  useEffect(() => {
    if (isAddModalOpen && group) {
      void loadAvailableVideosData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAddModalOpen, videoSearch, statusFilter, ordering]);
 
  const handleAddVideos = async () => {
    if (!groupId || selectedVideos.length === 0) {
      return;
    }
 
    try {
      setIsAdding(true);
      const result = await apiClient.addVideosToGroup(groupId, selectedVideos);
      await loadGroupData();
      setIsAddModalOpen(false);
      setSelectedVideos([]);
 
      if (result.skipped_count > 0) {
        alert(
          t('videos.groupDetail.addResult', {
            added: result.added_count,
            skipped: result.skipped_count,
          }),
        );
      }
    } catch (err) {
      handleAsyncError(err, t('videos.groupDetail.addError'), () => {});
    } finally {
      setIsAdding(false);
    }
  };
 
  const handleRemoveVideo = async (videoId: number) => {
    if (!confirm(t('videos.groupDetail.removeVideoConfirm')) || !groupId) {
      return;
    }
 
    try {
      await apiClient.removeVideoFromGroup(groupId, videoId);
      await loadGroupData();
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
      const locale = i18n.language as Locale;
      const shareUrl = `${window.location.origin}${addLocalePrefix(`/share/${result.share_token}`, locale)}`;
      setShareLink(shareUrl);
      await loadGroupData();
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
      await loadGroupData();
    } catch (err) {
      handleAsyncError(err, t('videos.groupDetail.disableShareError'), () => {});
    }
  };
 
  const handleCopyShareLink = async () => {
    if (!shareLink) return;
 
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(shareLink);
      } else {
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
 
  useEffect(() => {
    if (group?.share_token) {
      const locale = i18n.language as Locale;
      const shareUrl = `${window.location.origin}${addLocalePrefix(`/share/${group.share_token}`, locale)}`;
      setShareLink(shareUrl);
    } else {
      setShareLink(null);
    }
    setIsCopied(false);
  }, [group?.share_token, i18n.language]);
 
  useEffect(() => {
    if (group) {
      setEditedName(group.name);
      setEditedDescription(group.description || '');
    }
  }, [group]);
 
  const handleVideoSelect = (videoId: number) => {
    const v = group?.videos?.find((vv) => vv.id === videoId);
    if (v) {
      setSelectedVideo(convertVideoInGroupToSelectedVideo(v));
    }
  };
 
  useEffect(() => {
    const videos = group?.videos;
    if (!videos || videos.length === 0) {
      if (selectedVideo) {
        setSelectedVideo(null);
      }
      return;
    }
 
    const exists = selectedVideo ? videos.some((v) => v.id === selectedVideo.id) : false;
    if (!exists) {
      setSelectedVideo(convertVideoInGroupToSelectedVideo(videos[0]));
    }
  }, [group?.videos, selectedVideo]);
 
  const handleVideoPlayFromTime = (videoId: number, startTime: string) => {
    const seconds = timeStringToSeconds(startTime);
    if (window.innerWidth < 1024) {
      setMobileTab('player');
    }
 
    if (selectedVideo?.id === videoId && videoRef.current) {
      videoRef.current.currentTime = seconds;
      void videoRef.current.play();
    } else {
      pendingStartTimeRef.current = seconds;
      handleVideoSelect(videoId);
    }
  };
 
  const handleVideoCanPlay = (event: React.SyntheticEvent<HTMLVideoElement>) => {
    if (pendingStartTimeRef.current !== null) {
      const videoElement = event.currentTarget;
      videoElement.currentTime = pendingStartTimeRef.current;
      void videoElement.play();
      pendingStartTimeRef.current = null;
    }
  };
 
  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    if (!group?.videos || !groupId) return;
 
    const oldIndex = group.videos.findIndex((v) => v.id === active.id);
    const newIndex = group.videos.findIndex((v) => v.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
 
    const newVideos = arrayMove(group.videos, oldIndex, newIndex);
    setGroup({ ...group, videos: newVideos });
 
    try {
      const videoIds = newVideos.map((v) => v.id);
      await apiClient.reorderVideosInGroup(groupId, videoIds);
    } catch (err) {
      handleAsyncError(err, t('videos.groupDetail.orderUpdateError'), () => {});
      await loadGroupData();
    }
  };
 
  const handleDelete = async () => {
    if (!groupId || !confirm(t('confirmations.deleteGroup'))) {
      return;
    }
 
    try {
      setIsDeleting(true);
      await apiClient.deleteVideoGroup(groupId);
      navigate('/videos/groups');
    } catch (err) {
      handleAsyncError(err, t('videos.groupDetail.deleteError'), () => {});
    } finally {
      setIsDeleting(false);
    }
  };
 
  const { isLoading: isUpdating, error: updateError, mutate: handleUpdate } = useAsyncState<void>({
    onSuccess: () => {
      setIsEditing(false);
      void loadGroupData();
    },
  });
 
  const handleCancelEdit = () => {
    setIsEditing(false);
    if (group) {
      setEditedName(group.name);
      setEditedDescription(group.description || '');
    }
  };
 
  if (isLoading) {
    return (
      <div className="flex flex-col min-h-screen bg-gray-50">
        <Header />
        <div className="flex-1 w-full px-6 py-6">
          <div className="flex justify-center items-center h-64">
            <LoadingSpinner fullScreen={false} />
          </div>
        </div>
        <Footer />
      </div>
    );
  }
 
  if (error && !group) {
    return (
      <div className="flex flex-col min-h-screen bg-gray-50">
        <Header />
        <div className="flex-1 w-full px-6 py-6">
          <div className="space-y-4">
            <MessageAlert type="error" message={error} />
            <Link href="/videos/groups">
              <Button variant="outline">{t('common.actions.backToList')}</Button>
            </Link>
          </div>
        </div>
        <Footer />
      </div>
    );
  }
 
  if (!group) {
    return (
      <div className="flex flex-col min-h-screen bg-gray-50">
        <Header />
        <div className="flex-1 w-full px-6 py-6">
          <div className="text-center text-gray-500">{t('common.messages.groupNotFound')}</div>
        </div>
        <Footer />
      </div>
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
                      onClick={() =>
                        void handleUpdate(async () => {
                          if (!groupId) return;
                          await apiClient.updateVideoGroup(groupId, {
                            name: editedName,
                            description: editedDescription,
                          });
                        })
                      }
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
                    <Button variant="outline" onClick={handleCancelEdit} disabled={isUpdating}>
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
                      <DialogDescription>{t('videos.groupDetail.addDescription')}</DialogDescription>
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
                          <option value="uploaded_at_desc">{t('videos.groupDetail.ordering.uploadedDesc')}</option>
                          <option value="uploaded_at_asc">{t('videos.groupDetail.ordering.uploadedAsc')}</option>
                          <option value="title_asc">{t('videos.groupDetail.ordering.titleAsc')}</option>
                          <option value="title_desc">{t('videos.groupDetail.ordering.titleDesc')}</option>
                        </select>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSelectedVideos(availableVideos?.map((v) => v.id) ?? [])}
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
                          {availableVideos?.map((v) => (
                            <div key={v.id} className="flex items-center space-x-2 p-3 border rounded hover:bg-gray-50">
                              <Checkbox
                                id={`video-${v.id}`}
                                checked={selectedVideos.includes(v.id)}
                                onCheckedChange={(checked: boolean | 'indeterminate') => {
                                  if (checked === true) {
                                    setSelectedVideos([...selectedVideos, v.id]);
                                  } else if (checked === false) {
                                    setSelectedVideos(selectedVideos.filter((id) => id !== v.id));
                                  }
                                }}
                              />
                              <label htmlFor={`video-${v.id}`} className="flex-1 cursor-pointer">
                                <div className="font-medium text-gray-900">{v.title}</div>
                                <div className="text-sm text-gray-600">
                                  {v.description || t('common.messages.noDescription')}
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
                <Button
                  variant="destructive"
                  onClick={handleDelete}
                  disabled={isDeleting}
                  size="sm"
                  className="lg:size-default"
                >
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
 
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-2">
              {t('videos.groupDetail.share.title')}
            </h3>
            {shareLink ? (
              <div className="space-y-2">
                <p className="text-xs text-gray-600">{t('videos.groupDetail.share.enabled')}</p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={shareLink}
                    readOnly
                    className="flex-1 px-2 py-1.5 border border-gray-300 rounded text-xs"
                  />
                  <Button
                    onClick={handleCopyShareLink}
                    variant={isCopied ? 'default' : 'outline'}
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
                <p className="text-xs text-gray-600">{t('videos.groupDetail.share.disabled')}</p>
                <Button onClick={handleGenerateShareLink} disabled={isGeneratingLink} size="sm">
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
 
          <div className="lg:hidden flex border-b border-gray-200 bg-white rounded-t-lg">
            <button
              onClick={() => setMobileTab('videos')}
              className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                mobileTab === 'videos' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {t('videos.groupDetail.mobileTabs.videos')}
            </button>
            <button
              onClick={() => setMobileTab('player')}
              className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                mobileTab === 'player' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {t('videos.groupDetail.mobileTabs.player')}
            </button>
            <button
              onClick={() => setMobileTab('chat')}
              className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                mobileTab === 'chat' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {t('videos.groupDetail.mobileTabs.chat')}
            </button>
          </div>
 
          <div className="flex flex-col lg:grid flex-1 min-h-0 gap-4 lg:gap-6 lg:grid-cols-[1fr_2fr_1fr]">
            <div className={`flex-col min-h-0 min-w-0 ${mobileTab === 'videos' ? 'flex' : 'hidden lg:flex'}`}>
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
                        <SortableContext items={group.videos.map((v) => v.id)} strategy={verticalListSortingStrategy}>
                          {group.videos.map((v) => (
                            <SortableVideoItem
                              key={v.id}
                              video={v}
                              isSelected={selectedVideo?.id === v.id}
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
 
            <div className={`flex-col min-h-0 min-w-0 ${mobileTab === 'player' ? 'flex' : 'hidden lg:flex'}`}>
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
                      <p className="text-gray-500 text-sm">{t('videos.groupDetail.videoNoFile')}</p>
                    )
                  ) : (
                    <p className="text-gray-500 text-center text-sm">{t('videos.groupDetail.playerPlaceholder')}</p>
                  )}
                </CardContent>
              </Card>
            </div>
 
            <div className={`flex-col min-h-0 min-w-0 ${mobileTab === 'chat' ? 'flex' : 'hidden lg:flex'}`}>
              <ChatPanel groupId={groupId ?? undefined} onVideoPlay={handleVideoPlayFromTime} className="h-[500px] lg:h-[600px]" />
            </div>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}

