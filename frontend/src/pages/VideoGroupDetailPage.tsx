import { useCallback, useEffect, useState } from 'react';
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
import { TagManagementModal } from '@/components/video/TagManagementModal';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import { apiClient, type VideoGroup, type VideoInGroup } from '@/lib/api';
import { ChatPanel } from '@/components/chat/ChatPanel';
import { ShortsButton } from '@/components/shorts/ShortsButton';
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
import { Link, useI18nNavigate } from '@/lib/i18n';
import { handleAsyncError } from '@/lib/utils/errorHandling';
import { getStatusBadgeClassName, getStatusLabel } from '@/lib/utils/video';
import { convertVideoInGroupToSelectedVideo, type SelectedVideo } from '@/lib/utils/videoConversion';
import { useTags } from '@/hooks/useTags';
import { useShareLink } from '@/hooks/useShareLink';
import { useVideoPlayback } from '@/hooks/useVideoPlayback';
import { useMobileTab } from '@/hooks/useMobileTab';
import {
  useAddableVideosQuery,
  useAddVideosToGroupMutation,
  useVideoGroupDetailMutations,
  useVideoGroupDetailQuery,
} from '@/hooks/useVideoGroupDetailData';
import { TagFilterPanel } from '@/components/video/TagFilterPanel';

// Empty sensors array for mobile to prevent unnecessary re-renders
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const MOBILE_SENSORS: SensorDescriptor<any>[] = [];

type MobileTab = 'videos' | 'player' | 'chat';

interface MobileTabNavigationProps {
  mobileTab: MobileTab;
  onTabChange: (tab: MobileTab) => void;
  labels: Record<MobileTab, string>;
}

function MobileTabNavigation({ mobileTab, onTabChange, labels }: MobileTabNavigationProps) {
  const tabs: MobileTab[] = ['videos', 'player', 'chat'];
  return (
    <div className="lg:hidden flex border-b border-gray-200 bg-white rounded-t-lg">
      {tabs.map((tab) => (
        <button
          key={tab}
          onClick={() => onTabChange(tab)}
          className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
            mobileTab === tab ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          {labels[tab]}
        </button>
      ))}
    </div>
  );
}

interface ShareLinkPanelProps {
  shareLink: string | null;
  isGeneratingLink: boolean;
  isCopied: boolean;
  onGenerate: () => void;
  onDelete: () => void;
  onCopy: () => void;
}

function ShareLinkPanel({ shareLink, isGeneratingLink, isCopied, onGenerate, onDelete, onCopy }: ShareLinkPanelProps) {
  const { t } = useTranslation();
  return (
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
              onClick={onCopy}
              variant={isCopied ? 'default' : 'outline'}
              size="sm"
              disabled={isCopied}
            >
              {isCopied ? t('videos.groupDetail.copied') : t('videos.groupDetail.copy')}
            </Button>
            <Button onClick={onDelete} variant="destructive" size="sm">
              {t('videos.groupDetail.disable')}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-gray-600">{t('videos.groupDetail.share.disabled')}</p>
          <Button onClick={onGenerate} disabled={isGeneratingLink} size="sm">
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
  );
}

interface EditableGroupHeaderProps {
  isEditing: boolean;
  groupName: string;
  groupDescription: string;
  editedName: string;
  editedDescription: string;
  isUpdating: boolean;
  onNameChange: (name: string) => void;
  onDescriptionChange: (desc: string) => void;
  onSave: () => void;
  onCancel: () => void;
}

function EditableGroupHeader({
  isEditing, groupName, groupDescription, editedName, editedDescription,
  isUpdating, onNameChange, onDescriptionChange, onSave, onCancel,
}: EditableGroupHeaderProps) {
  const { t } = useTranslation();

  if (!isEditing) {
    return (
      <>
        <h1 className="text-2xl lg:text-3xl font-bold text-gray-900">{groupName}</h1>
        <p className="text-sm lg:text-base text-gray-500 mt-1">
          {groupDescription || t('common.messages.noDescription')}
        </p>
      </>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="text-sm font-medium text-gray-600 block mb-1">
          {t('videos.groups.nameLabel')}
        </label>
        <Input
          type="text"
          value={editedName}
          onChange={(e) => onNameChange(e.target.value)}
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
          onChange={(e) => onDescriptionChange(e.target.value)}
          className="w-full min-h-[100px]"
          disabled={isUpdating}
        />
      </div>
      <div className="flex flex-col sm:flex-row flex-wrap gap-2">
        <Button
          onClick={onSave}
          disabled={isUpdating || !editedName.trim()}
          className="w-full sm:w-auto"
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
          onClick={onCancel}
          disabled={isUpdating}
          className="w-full sm:w-auto"
        >
          {t('common.actions.cancel')}
        </Button>
        <Link href="/videos/groups" className="w-full sm:w-auto sm:ml-auto">
          <Button variant="outline" className="w-full">
            {t('common.actions.backToList')}
          </Button>
        </Link>
      </div>
    </div>
  );
}

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
      className={`p-3 border rounded cursor-pointer hover:bg-gray-50 ${isMobile ? '' : 'cursor-grab active:cursor-grabbing'
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

interface AddVideosDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  groupId: number | null;
  group: VideoGroup | null;
  onVideosAdded?: () => void;
}

function AddVideosDialog({ isOpen, onOpenChange, groupId, group, onVideosAdded }: AddVideosDialogProps) {
  const { t } = useTranslation();
  const { tags } = useTags();

  const [videoSearchInput, setVideoSearchInput] = useState('');
  const [videoSearch, setVideoSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [ordering, setOrdering] = useState<OrderingOption>('uploaded_at_desc');
  const [selectedVideos, setSelectedVideos] = useState<number[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);
  const [isTagManagementOpen, setIsTagManagementOpen] = useState(false);

  const handleOrderingChange = useCallback((event: React.ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value as OrderingOption;
    if (ORDERING_OPTIONS.includes(value)) {
      setOrdering(value);
    }
  }, []);

  const handleTagToggle = useCallback((tagId: number) => {
    setSelectedTagIds((prev) =>
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId]
    );
  }, []);

  const handleTagClear = useCallback(() => {
    setSelectedTagIds([]);
  }, []);

  useEffect(() => {
    const handler = setTimeout(() => setVideoSearch(videoSearchInput), 300);
    return () => clearTimeout(handler);
  }, [videoSearchInput]);

  const availableVideosQuery = useAddableVideosQuery({
    isOpen,
    groupId,
    group,
    q: videoSearch.trim(),
    status: statusFilter,
    ordering,
    tagIds: selectedTagIds,
  });

  const availableVideos = availableVideosQuery.data ?? [];
  const isLoadingVideos = availableVideosQuery.isLoading || availableVideosQuery.isFetching;

  const addVideosMutation = useAddVideosToGroupMutation(groupId, onVideosAdded);

  const handleAddVideos = async () => {
    if (!groupId || selectedVideos.length === 0) return;

    try {
      const result = await addVideosMutation.mutateAsync(selectedVideos);
      onOpenChange(false);
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
      handleAsyncError(err, t('videos.groupDetail.addError'), () => { });
    }
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onOpenChange}>
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

            <TagFilterPanel
              tags={tags}
              selectedTagIds={selectedTagIds}
              onToggle={handleTagToggle}
              onClear={handleTagClear}
              onManageTags={() => setIsTagManagementOpen(true)}
              disabled={isLoadingVideos}
            />

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
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {t('common.actions.cancel')}
            </Button>
            <Button onClick={handleAddVideos} disabled={addVideosMutation.isPending || selectedVideos.length === 0}>
              {addVideosMutation.isPending ? (
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

      <TagManagementModal
        isOpen={isTagManagementOpen}
        onClose={() => setIsTagManagementOpen(false)}
      />
    </>
  );
}

export default function VideoGroupDetailPage() {
  const params = useParams<{ id: string }>();
  const navigate = useI18nNavigate();
  const groupId = params?.id ? Number.parseInt(params.id, 10) : null;
  const { t } = useTranslation();
  const { group, isLoading: groupIsLoading, isFetching: groupIsFetching, errorMessage: error } =
    useVideoGroupDetailQuery(groupId);

  const [isDeleting, setIsDeleting] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedVideo, setSelectedVideo] = useState<SelectedVideo | null>(null);

  const [isEditing, setIsEditing] = useState(false);
  const [editedName, setEditedName] = useState('');
  const [editedDescription, setEditedDescription] = useState('');

  const { mobileTab, setMobileTab, isMobile } = useMobileTab();
  const { shareLink, isGeneratingLink, isCopied, generateShareLink, deleteShareLink, copyShareLink } = useShareLink(group);

  const handleVideoSelect = useCallback((videoId: number) => {
    const v = group?.videos?.find((vv) => vv.id === videoId);
    if (v) {
      setSelectedVideo(convertVideoInGroupToSelectedVideo(v));
    }
  }, [group?.videos]);

  const { videoRef, handleVideoCanPlay, handleVideoPlayFromTime } = useVideoPlayback({
    selectedVideo,
    onVideoSelect: handleVideoSelect,
    onMobileSwitch: () => setMobileTab('player'),
  });

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const {
    syncGroupDetail,
    setGroupDetailCache,
    removeVideoMutation,
    reorderVideosMutation,
    deleteGroupMutation,
    updateGroupMutation,
  } = useVideoGroupDetailMutations({
    groupId,
    onDeleteSuccess: () => navigate('/videos/groups'),
    onUpdateSuccess: () => setIsEditing(false),
  });

  useEffect(() => {
    if (group) {
      setEditedName(group.name);
      setEditedDescription(group.description || '');
    }
  }, [group]);

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

  const handleRemoveVideo = async (videoId: number) => {
    if (!confirm(t('videos.groupDetail.removeVideoConfirm')) || !groupId) {
      return;
    }

    try {
      await removeVideoMutation.mutateAsync(videoId);
      if (selectedVideo?.id === videoId) {
        setSelectedVideo(null);
      }
    } catch (err) {
      handleAsyncError(err, t('videos.groupDetail.removeVideoError'), () => { });
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
    setGroupDetailCache({ ...group, videos: newVideos });

    try {
      const videoIds = newVideos.map((v) => v.id);
      await reorderVideosMutation.mutateAsync(videoIds);
    } catch (err) {
      handleAsyncError(err, t('videos.groupDetail.orderUpdateError'), () => { });
      await syncGroupDetail();
    }
  };

  const handleDelete = async () => {
    if (!groupId || !confirm(t('confirmations.deleteGroup'))) {
      return;
    }

    try {
      setIsDeleting(true);
      await deleteGroupMutation.mutateAsync();
    } catch (err) {
      handleAsyncError(err, t('videos.groupDetail.deleteError'), () => { });
    } finally {
      setIsDeleting(false);
    }
  };
  const isLoading = groupIsLoading || groupIsFetching;
  const isUpdating = updateGroupMutation.isPending;
  const updateError = updateGroupMutation.error instanceof Error ? updateGroupMutation.error.message : null;

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
              <EditableGroupHeader
                isEditing={isEditing}
                groupName={group.name}
                groupDescription={group.description || ''}
                editedName={editedName}
                editedDescription={editedDescription}
                isUpdating={isUpdating}
                onNameChange={setEditedName}
                onDescriptionChange={setEditedDescription}
                onSave={() =>
                  void updateGroupMutation.mutateAsync({
                    name: editedName,
                    description: editedDescription,
                  })
                }
                onCancel={handleCancelEdit}
              />
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
                <AddVideosDialog
                  isOpen={isAddModalOpen}
                  onOpenChange={setIsAddModalOpen}
                  groupId={groupId}
                  group={group}
                />
              )}

              {!isEditing && group.videos && group.videos.length > 0 && groupId && (
                <ShortsButton
                  groupId={groupId}
                  videos={group.videos}
                  size="sm"
                />
              )}

              {!isEditing && (
                <Link href="/videos/groups">
                  <Button variant="outline" size="sm" className="lg:size-default">
                    {t('common.actions.backToList')}
                  </Button>
                </Link>
              )}

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

          <ShareLinkPanel
            shareLink={shareLink}
            isGeneratingLink={isGeneratingLink}
            isCopied={isCopied}
            onGenerate={generateShareLink}
            onDelete={deleteShareLink}
            onCopy={copyShareLink}
          />
          <MobileTabNavigation
            mobileTab={mobileTab}
            onTabChange={setMobileTab}
            labels={{
              videos: t('videos.groupDetail.mobileTabs.videos'),
              player: t('videos.groupDetail.mobileTabs.player'),
              chat: t('videos.groupDetail.mobileTabs.chat'),
            }}
          />

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
                        src={apiClient.getVideoUrl(selectedVideo.file)}
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
