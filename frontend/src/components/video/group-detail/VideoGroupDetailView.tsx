import { useCallback, useEffect, useState, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  ArrowLeft,
  Copy,
  GripVertical,
  List,
  Pencil,
  Play,
  Plus,
  Save,
  Share2,
  Trash2,
  X,
} from 'lucide-react';
import { apiClient, type VideoGroup, type VideoInGroup } from '@/lib/api';
import { buildYoutubeEmbedSrc } from '@/lib/video/embed';
import { handleAsyncError } from '@/lib/utils/errorHandling';
import type { SelectedVideo } from '@/lib/utils/videoConversion';
import { Link } from '@/lib/i18n';
import { AppNav } from '@/components/layout/AppNav';
import { ChatPanel } from '@/components/chat/ChatPanel';
import { DashboardButton } from '@/components/dashboard/DashboardButton';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { InlineSpinner } from '@/components/common/InlineSpinner';
import { StatusBadge } from '@/components/common/StatusBadge';
import { ErrorMessage } from '@/components/auth/ErrorMessage';
import { useToast } from '@/components/common/feedback';
import { TagFilterPanel } from '@/components/video/TagFilterPanel';
import { TagManagementModal } from '@/components/video/TagManagementModal';
import {
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  Breadcrumbs,
  BreadcrumbsLabel,
} from '@/components/ui/breadcrumbs';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { SupportText } from '@/components/ui/support-text';
import { ChipLabel } from '@/components/ui/chip-label';
import { Heading, HeadingShoulder, HeadingTitle } from '@/components/ui/heading';
import { UtilityLink } from '@/components/ui/utility-link';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogHeading,
  DialogScrollArea,
  useDialog,
} from '@/components/ui/dialog';
import { useTags } from '@/hooks/useTags';
import {
  useAddableVideosQuery,
  useAddVideosToGroupMutation,
} from '@/hooks/useVideoGroupDetailData';

const MOBILE_SENSORS: ReturnType<typeof useSensors> = [];

type MobileTab = 'videos' | 'player';

const ORDERING_OPTIONS = [
  'uploaded_at_desc',
  'uploaded_at_asc',
  'title_asc',
  'title_desc',
] as const;
type OrderingOption = (typeof ORDERING_OPTIONS)[number];

interface VideoGroupDetailViewProps {
  group: VideoGroup | null;
  groupId: number | null;
  isLoading: boolean;
  error: string | null;
  selectedVideo: SelectedVideo | null;
  deleteError: string | null;
  isDeleting: boolean;
  isEditing: boolean;
  editedName: string;
  editedDescription: string;
  updateError: string | null;
  isUpdating: boolean;
  isAddModalOpen: boolean;
  mobileTab: MobileTab;
  isMobile: boolean;
  videoRef: RefObject<HTMLVideoElement | null>;
  youtubeStartSeconds: number | null;
  shareSlug: string;
  shareLink: string | null;
  isGeneratingLink: boolean;
  isCopied: boolean;
  onMobileTabChange: (tab: MobileTab) => void;
  onOpenAddModalChange: (open: boolean) => void;
  onStartEditing: () => void;
  onCancelEdit: () => void;
  onEditedNameChange: (name: string) => void;
  onEditedDescriptionChange: (description: string) => void;
  onUpdateGroup: () => void;
  onDeleteGroup: () => void;
  onVideoSelect: (videoId: number) => void;
  onRemoveVideo: (videoId: number) => Promise<void> | void;
  onDragEnd: (event: DragEndEvent) => Promise<void> | void;
  onVideoCanPlay: () => void;
  onVideoPlayFromTime: (videoId: number, startTime: string) => void;
  onGenerateShareLink: (shareSlug: string) => Promise<void> | void;
  onDeleteShareLink: () => void;
  onCopyShareLink: () => void;
}

function VideoStatusBadge({ status }: { status: VideoInGroup['status'] }) {
  return <StatusBadge status={status} size="xs" className="mt-1 ml-0" />;
}

interface SortableVideoItemProps {
  video: VideoInGroup;
  isSelected: boolean;
  onSelect: (videoId: number) => void;
  onRemove: (videoId: number) => void;
  isMobile?: boolean;
}

function SortableVideoItem({
  video,
  isSelected,
  onSelect,
  onRemove,
  isMobile = false,
}: SortableVideoItemProps) {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: video.id,
    disabled: isMobile,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={() => onSelect(video.id)}
      className={`group flex cursor-pointer items-center gap-3 rounded-8 px-4 py-3.5 transition-colors ${
        isSelected
          ? 'border-l-4 border-key-900 bg-blue-50'
          : 'hover:bg-solid-gray-50'
      } ${isDragging ? 'z-50 border border-solid-gray-420 bg-white' : ''}`}
    >
      {!isMobile && (
        <span
          {...attributes}
          {...listeners}
          onClick={(event) => event.stopPropagation()}
          className="text-solid-gray-420 cursor-grab active:cursor-grabbing shrink-0"
        >
          <GripVertical className="w-4 h-4" />
        </span>
      )}
      <div className="flex-1 min-w-0">
        <p className={`truncate text-std-16N-170 ${isSelected ? 'font-bold text-key-900' : 'text-solid-gray-800'}`}>
          {video.title}
        </p>
        <VideoStatusBadge status={video.status} />
      </div>
      <Button
        type="button"
        variant="text"
        size="xs"
        onClick={(event) => {
          event.stopPropagation();
          onRemove(video.id);
        }}
        onPointerDown={(event) => event.stopPropagation()}
        onMouseDown={(event) => event.stopPropagation()}
        aria-label={t('videos.groupDetail.removeFromGroup')}
        className="min-w-0 shrink-0 p-1.5 text-error-1 hover:bg-red-50"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </Button>
    </div>
  );
}

function ShareLinkDialog({
  isOpen,
  shareSlug,
  shareLink,
  isGeneratingLink,
  isCopied,
  onOpenChange,
  onGenerate,
  onDelete,
  onCopy,
}: {
  isOpen: boolean;
  shareSlug: string;
  shareLink: string | null;
  isGeneratingLink: boolean;
  isCopied: boolean;
  onOpenChange: (open: boolean) => void;
  onGenerate: (shareSlug: string) => Promise<void> | void;
  onDelete: () => void;
  onCopy: () => void;
}) {
  const { t } = useTranslation();
  const [inputValue, setInputValue] = useState(shareSlug);

  const dialog = useDialog({
    open: isOpen,
    onOpenChange,
    onRequestClose: (event) => {
      if (isGeneratingLink) event.preventDefault();
    },
  });

  return (
    <Dialog {...dialog.dialogProps} width="min(42rem, 92vw)">
      <DialogContent>
        <DialogHeader>
          <DialogHeading {...dialog.headingProps}>
            {t('videos.groupDetail.share.title')}
          </DialogHeading>
        </DialogHeader>
        <DialogBody>
          <p className="mb-6 text-std-16N-170 text-solid-gray-700">
            {shareLink
              ? t('videos.groupDetail.share.enabled')
              : t('videos.groupDetail.share.disabled')}
          </p>

          <div className="space-y-8">
            <div className="flex flex-col gap-3">
              <Label htmlFor="group-share-slug">
                {t('videos.groupDetail.shareSlugPlaceholder')}
              </Label>
              <Input
                id="group-share-slug"
                type="text"
                blockSize="lg"
                value={inputValue}
                onChange={(event) => setInputValue(event.target.value)}
                placeholder={t('videos.groupDetail.shareSlugPlaceholder')}
                disabled={isGeneratingLink}
              />
              <SupportText>{t('videos.groupDetail.shareSlugHelp')}</SupportText>
              <div className="flex flex-wrap items-center gap-3 pt-1">
                <Button
                  type="button"
                  variant="solid"
                  size="md"
                  onClick={() => {
                    void onGenerate(inputValue);
                  }}
                  disabled={isGeneratingLink || !inputValue.trim()}
                >
                  {isGeneratingLink ? (
                    <InlineSpinner className="mr-1.5 h-4 w-4" />
                  ) : (
                    <Plus className="mr-1.5 h-4 w-4" />
                  )}
                  {isGeneratingLink
                    ? t('videos.groupDetail.generating')
                    : t('common.actions.save')}
                </Button>
                {shareLink ? (
                  <Button
                    type="button"
                    variant="text"
                    size="md"
                    onClick={onDelete}
                    disabled={isGeneratingLink}
                    className="text-error-1 hover:bg-red-50"
                  >
                    {t('videos.groupDetail.disable')}
                  </Button>
                ) : null}
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <Label id="group-share-link-label">
                {t('videos.groupDetail.shareLinkLabel')}
              </Label>
              {shareLink ? (
                <div className="flex flex-col gap-4">
                  <div
                    aria-labelledby="group-share-link-label"
                    className="min-h-16 break-all rounded-8 border border-solid-gray-420 bg-solid-gray-50 px-5 py-4 font-mono text-std-16N-170 text-solid-gray-800"
                  >
                    {shareLink}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="md"
                    onClick={onCopy}
                    className="self-start"
                  >
                    <Copy className="mr-1.5 h-4 w-4" />
                    {isCopied
                      ? t('videos.groupDetail.copied')
                      : t('videos.groupDetail.copyButton')}
                  </Button>
                </div>
              ) : (
                <SupportText>{t('videos.groupDetail.share.disabled')}</SupportText>
              )}
            </div>
          </div>
        </DialogBody>
        <DialogActions>
          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isGeneratingLink}
            >
              {t('common.actions.close')}
            </Button>
          </div>
        </DialogActions>
      </DialogContent>
    </Dialog>
  );
}

interface AddVideosDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  groupId: number | null;
  group: VideoGroup | null;
  onVideosAdded?: () => void;
}

function AddVideosDialog({
  isOpen,
  onOpenChange,
  groupId,
  group,
  onVideosAdded,
}: AddVideosDialogProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const { tags } = useTags();

  const [videoSearchInput, setVideoSearchInput] = useState('');
  const [videoSearch, setVideoSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [ordering, setOrdering] = useState<OrderingOption>('uploaded_at_desc');
  const [selectedVideos, setSelectedVideos] = useState<number[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);
  const [isTagManagementOpen, setIsTagManagementOpen] = useState(false);

  const handleOrderingChange = useCallback((value: string) => {
    if (ORDERING_OPTIONS.includes(value as OrderingOption)) {
      setOrdering(value as OrderingOption);
    }
  }, []);

  const handleTagToggle = useCallback((tagId: number) => {
    setSelectedTagIds((prev) =>
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId],
    );
  }, []);

  const handleTagClear = useCallback(() => setSelectedTagIds([]), []);

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
        toast({
          message: t('videos.groupDetail.addResult', { added: result.added_count, skipped: result.skipped_count }),
          variant: 'info',
        });
      }
    } catch (err) {
      handleAsyncError(err, t('videos.groupDetail.addError'), () => {});
    }
  };

  const dialog = useDialog({
    open: isOpen,
    onOpenChange,
    onRequestClose: (event) => {
      if (addVideosMutation.isPending) event.preventDefault();
    },
  });

  if (!isOpen) {
    return (
      <TagManagementModal isOpen={isTagManagementOpen} onClose={() => setIsTagManagementOpen(false)} />
    );
  }

  return (
    <>
      <Dialog {...dialog.dialogProps} scroll="inner" width="min(42rem, 95vw)">
        <DialogContent>
          <DialogHeader>
            <DialogHeading {...dialog.headingProps}>{t('videos.groupDetail.addVideos')}</DialogHeading>
          </DialogHeader>
          <DialogScrollArea>
            <DialogBody>
              <p className="mb-4 text-std-16N-170 text-solid-gray-700">
                {t('videos.groupDetail.addVideosDescription', 'Select videos to add to this group.')}
              </p>
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    placeholder={t('videos.groupDetail.searchPlaceholder')}
                    value={videoSearchInput}
                    onChange={(event) => setVideoSearchInput(event.target.value)}
                    blockSize="md"
                    className="w-full md:w-1/2"
                  />
                  <Select value={statusFilter || 'all'} onValueChange={(value) => setStatusFilter(value === 'all' ? '' : value)}>
                    <SelectTrigger blockSize="md" className="w-auto min-w-[10rem]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t('videos.groupDetail.statusFilter.all')}</SelectItem>
                      <SelectItem value="completed">{t('videos.groupDetail.statusFilter.completed')}</SelectItem>
                      <SelectItem value="processing">{t('videos.groupDetail.statusFilter.processing')}</SelectItem>
                      <SelectItem value="indexing">{t('videos.groupDetail.statusFilter.indexing')}</SelectItem>
                      <SelectItem value="pending">{t('videos.groupDetail.statusFilter.pending')}</SelectItem>
                      <SelectItem value="error">{t('videos.groupDetail.statusFilter.error')}</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={ordering} onValueChange={handleOrderingChange}>
                    <SelectTrigger blockSize="md" className="w-auto min-w-[12rem]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="uploaded_at_desc">{t('videos.groupDetail.ordering.uploadedDesc')}</SelectItem>
                      <SelectItem value="uploaded_at_asc">{t('videos.groupDetail.ordering.uploadedAsc')}</SelectItem>
                      <SelectItem value="title_asc">{t('videos.groupDetail.ordering.titleAsc')}</SelectItem>
                      <SelectItem value="title_desc">{t('videos.groupDetail.ordering.titleDesc')}</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedVideos(availableVideos.map((video) => video.id))}
                    disabled={!availableVideos.length}
                  >
                    {t('videos.groupDetail.selectAll')}
                  </Button>
                  <Button
                    type="button"
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
                  <div className="flex justify-center py-8"><LoadingSpinner /></div>
                ) : availableVideos.length === 0 ? (
                  <p className="text-center text-solid-gray-600 py-8">{t('videos.groupDetail.noAvailableVideos')}</p>
                ) : (
                  <div className="space-y-2 max-h-[400px] overflow-y-auto">
                    {availableVideos.map((video) => (
                      <div key={video.id} className="flex items-center gap-3 p-3 border border-solid-gray-200 rounded-8 hover:bg-solid-gray-50 transition-colors">
                        <Checkbox
                          id={`video-${video.id}`}
                          checked={selectedVideos.includes(video.id)}
                          onCheckedChange={(checked: boolean | 'indeterminate') => {
                            if (checked === true) setSelectedVideos([...selectedVideos, video.id]);
                            else if (checked === false) setSelectedVideos(selectedVideos.filter((id) => id !== video.id));
                          }}
                        />
                        <Label htmlFor={`video-${video.id}`} className="flex-1 cursor-pointer">
                          <div className="text-std-16B-170 text-solid-gray-800">{video.title}</div>
                          <div className="text-dns-14N-130 text-solid-gray-600">{video.description || t('common.messages.noDescription')}</div>
                        </Label>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </DialogBody>
          </DialogScrollArea>
          <DialogActions>
            <div className="flex justify-end gap-3">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                {t('common.actions.cancel')}
              </Button>
              <Button
                type="button"
                onClick={handleAddVideos}
                disabled={addVideosMutation.isPending || selectedVideos.length === 0}
              >
                {addVideosMutation.isPending && <InlineSpinner className="w-3.5 h-3.5" />}
                {addVideosMutation.isPending ? t('videos.groupDetail.adding') : t('videos.groupDetail.add')}
              </Button>
            </div>
          </DialogActions>
        </DialogContent>
      </Dialog>
      <TagManagementModal isOpen={isTagManagementOpen} onClose={() => setIsTagManagementOpen(false)} />
    </>
  );
}

function GroupEditDialog({
  isOpen,
  editedName,
  editedDescription,
  updateError,
  isUpdating,
  onOpenChange,
  onNameChange,
  onDescriptionChange,
  onSave,
}: {
  isOpen: boolean;
  editedName: string;
  editedDescription: string;
  updateError: string | null;
  isUpdating: boolean;
  onOpenChange: (open: boolean) => void;
  onNameChange: (name: string) => void;
  onDescriptionChange: (description: string) => void;
  onSave: () => void;
}) {
  const { t } = useTranslation();

  const dialog = useDialog({
    open: isOpen,
    onOpenChange,
    onRequestClose: (event) => {
      if (isUpdating) event.preventDefault();
    },
  });

  if (!isOpen) return null;

  return (
    <Dialog {...dialog.dialogProps} width="min(32rem, 92vw)">
      <DialogContent>
        <DialogHeader>
          <DialogHeading {...dialog.headingProps}>{t('videos.groupDetail.editTitle')}</DialogHeading>
        </DialogHeader>
        <DialogBody>
          <p className="mb-4 text-std-16N-170 text-solid-gray-700">
            {t('videos.groupDetail.editDescription', 'Update the group name and description.')}
          </p>
          <div className="space-y-4">
            {updateError && <ErrorMessage message={updateError} />}
            <div className="flex flex-col gap-2">
              <Label htmlFor="group-edit-name">{t('videos.groups.nameLabel')}</Label>
              <Input
                id="group-edit-name"
                type="text"
                value={editedName}
                onChange={(event) => onNameChange(event.target.value)}
                disabled={isUpdating}
                blockSize="md"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="group-edit-description">{t('videos.groups.descriptionLabel')}</Label>
              <Textarea
                id="group-edit-description"
                value={editedDescription}
                onChange={(event) => onDescriptionChange(event.target.value)}
                disabled={isUpdating}
                rows={3}
                className="resize-none"
              />
            </div>
          </div>
        </DialogBody>
        <DialogActions>
          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isUpdating}
            >
              <X className="w-3.5 h-3.5" />
              {t('common.actions.cancel')}
            </Button>
            <Button
              type="button"
              onClick={onSave}
              disabled={isUpdating || !editedName.trim()}
            >
              {isUpdating ? <InlineSpinner className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
              {isUpdating ? t('common.actions.saving') : t('common.actions.save')}
            </Button>
          </div>
        </DialogActions>
      </DialogContent>
    </Dialog>
  );
}

function GroupVideoList({
  group,
  selectedVideo,
  deleteError,
  isMobile,
  mobileTab,
  sensors,
  onOpenAdd,
  onVideoSelect,
  onMobileTabChange,
  onRemoveVideo,
  onDragEnd,
}: {
  group: VideoGroup;
  selectedVideo: SelectedVideo | null;
  deleteError: string | null;
  isMobile: boolean;
  mobileTab: MobileTab;
  sensors: ReturnType<typeof useSensors>;
  onOpenAdd: () => void;
  onVideoSelect: (videoId: number) => void;
  onMobileTabChange: (tab: MobileTab) => void;
  onRemoveVideo: (videoId: number) => Promise<void> | void;
  onDragEnd: (event: DragEndEvent) => Promise<void> | void;
}) {
  const { t } = useTranslation();

  return (
    <aside className={`lg:col-span-1 flex min-h-0 flex-col ${mobileTab === 'videos' ? 'flex' : 'hidden lg:flex'}`}>
      <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden border border-solid-gray-420 bg-white">
        {deleteError ? (
          <div className="shrink-0 px-5 pt-4">
            <ErrorMessage message={deleteError} />
          </div>
        ) : null}
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-solid-gray-200 px-5 py-4">
          <Heading size="18" className="min-w-0 flex-1 truncate">
            <HeadingTitle level="h2">{t('videos.groupDetail.videoListTitle')}</HeadingTitle>
          </Heading>
          <div className="flex shrink-0 items-center gap-3">
            <ChipLabel variant="filled-1" color="gray" className="min-h-0 text-oln-14N-100">
              {t('videos.groupDetail.videoCount', { count: group.videos?.length ?? 0 })}
            </ChipLabel>
            <Button type="button" variant="outline" size="sm" onClick={onOpenAdd}>
              <Plus className="h-3.5 w-3.5" />
              <span className="ml-1.5 hidden sm:inline">{t('videos.groupDetail.add')}</span>
            </Button>
          </div>
        </div>
        <div className="flex-1 space-y-2 overflow-y-auto p-3">
          {group.videos && group.videos.length > 0 ? (
            <DndContext
              sensors={isMobile ? MOBILE_SENSORS : sensors}
              collisionDetection={closestCenter}
              onDragEnd={onDragEnd}
            >
              <SortableContext items={group.videos.map((video) => video.id)} strategy={verticalListSortingStrategy}>
                {group.videos.map((video) => (
                  <SortableVideoItem
                    key={video.id}
                    video={video}
                    isSelected={selectedVideo?.id === video.id}
                    isMobile={isMobile}
                    onSelect={(videoId) => {
                      onVideoSelect(videoId);
                      if (isMobile) onMobileTabChange('player');
                    }}
                    onRemove={onRemoveVideo}
                  />
                ))}
              </SortableContext>
            </DndContext>
          ) : (
            <p className="py-10 text-center text-std-16N-170 text-solid-gray-600">
              {t('videos.groupDetail.videoListEmpty')}
            </p>
          )}
        </div>
      </div>
    </aside>
  );
}

function GroupPlayerPanel({
  groupId,
  selectedVideo,
  mobileTab,
  videoRef,
  youtubeStartSeconds,
  onVideoCanPlay,
  onVideoPlayFromTime,
}: {
  groupId: number | null;
  selectedVideo: SelectedVideo | null;
  mobileTab: MobileTab;
  videoRef: RefObject<HTMLVideoElement | null>;
  youtubeStartSeconds: number | null;
  onVideoCanPlay: () => void;
  onVideoPlayFromTime: (videoId: number, startTime: string) => void;
}) {
  const { t } = useTranslation();

  return (
    <section className={`lg:col-span-2 flex min-h-0 flex-col gap-4 ${mobileTab === 'player' ? 'flex' : 'hidden lg:flex'}`}>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden border border-solid-gray-420 bg-white">
        <div className="flex min-w-0 shrink-0 items-center justify-between gap-4 border-b border-solid-gray-200 px-5 py-4">
          <Heading size="18" className="min-w-0 flex-1 truncate">
            <HeadingTitle level="h2">
              {selectedVideo ? selectedVideo.title : t('videos.groupDetail.playerPlaceholder')}
            </HeadingTitle>
          </Heading>
          <div className="flex shrink-0 items-center gap-3">
            {groupId ? <DashboardButton groupId={groupId} size="sm" /> : null}
          </div>
        </div>
        <div className="aspect-video lg:aspect-auto lg:flex-1 bg-solid-gray-800 flex items-center justify-center lg:min-h-0">
          {selectedVideo ? (
            selectedVideo.source_type === 'youtube' && selectedVideo.youtube_embed_url ? (
              <iframe
                key={`${selectedVideo.id}-${youtubeStartSeconds ?? 0}`}
                className="w-full h-full"
                src={buildYoutubeEmbedSrc(selectedVideo.youtube_embed_url, youtubeStartSeconds)}
                title={selectedVideo.title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            ) : selectedVideo.file ? (
              <video
                ref={videoRef}
                key={selectedVideo.id}
                controls
                className="w-full h-full object-contain"
                src={apiClient.getVideoUrl(selectedVideo.file)}
                onCanPlay={onVideoCanPlay}
              >
                {t('common.messages.browserNoVideoSupport')}
              </video>
            ) : (
              <p className="text-solid-gray-420 text-std-16N-170">{t('videos.groupDetail.videoNoFile')}</p>
            )
          ) : (
            <p className="text-solid-gray-420 text-std-16N-170 text-center px-4">{t('videos.groupDetail.playerPlaceholder')}</p>
          )}
        </div>
      </div>
      <div className="lg:hidden">
        <ChatPanel
          groupId={groupId ?? undefined}
          onVideoPlay={onVideoPlayFromTime}
          className="h-[480px]"
        />
      </div>
    </section>
  );
}

function GroupMobileNav({
  mobileTab,
  onChange,
}: {
  mobileTab: MobileTab;
  onChange: (tab: MobileTab) => void;
}) {
  const { t } = useTranslation();
  const mobileTabIcon: Record<MobileTab, typeof List> = { videos: List, player: Play };
  const mobileTabLabel: Record<MobileTab, string> = {
    videos: t('videos.groupDetail.mobileTabs.videos'),
    player: t('videos.groupDetail.mobileTabs.player'),
  };

  return (
    <nav className="fixed bottom-0 left-0 z-50 flex h-16 w-full items-center justify-around border-t border-solid-gray-420 bg-white px-4 lg:hidden">
      {(['videos', 'player'] as MobileTab[]).map((tab) => {
        const Icon = mobileTabIcon[tab];
        const isActive = mobileTab === tab;
        return (
          <button
            key={tab}
            type="button"
            onClick={() => onChange(tab)}
            className={`flex flex-col items-center justify-center gap-1 px-4 py-1 transition-colors ${
              isActive
                ? 'border-b-2 border-key-900 text-key-900'
                : 'text-solid-gray-420 hover:text-key-900'
            }`}
          >
            <Icon className="w-5 h-5" />
            <span className="text-dns-14N-120 font-medium">{mobileTabLabel[tab]}</span>
          </button>
        );
      })}
    </nav>
  );
}

export function VideoGroupDetailView({
  group,
  groupId,
  isLoading,
  error,
  selectedVideo,
  deleteError,
  isDeleting,
  isEditing,
  editedName,
  editedDescription,
  updateError,
  isUpdating,
  isAddModalOpen,
  mobileTab,
  isMobile,
  videoRef,
  youtubeStartSeconds,
  shareSlug,
  shareLink,
  isGeneratingLink,
  isCopied,
  onMobileTabChange,
  onOpenAddModalChange,
  onStartEditing,
  onCancelEdit,
  onEditedNameChange,
  onEditedDescriptionChange,
  onUpdateGroup,
  onDeleteGroup,
  onVideoSelect,
  onRemoveVideo,
  onDragEnd,
  onVideoCanPlay,
  onVideoPlayFromTime,
  onGenerateShareLink,
  onDeleteShareLink,
  onCopyShareLink,
}: VideoGroupDetailViewProps) {
  const { t } = useTranslation();
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  return (
    <div className="bg-solid-gray-50 flex flex-col text-solid-gray-800">
      <AppNav activePage="groups" />

      {isLoading ? (
        <div className="flex min-h-[calc(100dvh-var(--app-header-offset,5rem))] items-center justify-center">
          <LoadingSpinner />
        </div>
      ) : error && !group ? (
        <div className="flex min-h-[calc(100dvh-var(--app-header-offset,5rem))] flex-col items-center justify-center gap-4">
          <ErrorMessage message={error} />
          <UtilityLink asChild>
            <Link href="/videos/groups" className="inline-flex items-center gap-1">
              <ArrowLeft className="w-4 h-4" />
              {t('common.actions.backToList')}
            </Link>
          </UtilityLink>
        </div>
      ) : !group ? (
        <div className="flex min-h-[calc(100dvh-var(--app-header-offset,5rem))] items-center justify-center">
          <p className="text-solid-gray-700">{t('common.messages.groupNotFound')}</p>
        </div>
      ) : (
        <>
          <GroupEditDialog
            isOpen={isEditing}
            editedName={editedName}
            editedDescription={editedDescription}
            updateError={updateError}
            isUpdating={isUpdating}
            onOpenChange={(open) => !open && onCancelEdit()}
            onNameChange={onEditedNameChange}
            onDescriptionChange={onEditedDescriptionChange}
            onSave={onUpdateGroup}
          />

          {isShareDialogOpen && (
            <ShareLinkDialog
              key={shareSlug}
              isOpen={isShareDialogOpen}
              shareSlug={shareSlug}
              shareLink={shareLink}
              isGeneratingLink={isGeneratingLink}
              isCopied={isCopied}
              onOpenChange={setIsShareDialogOpen}
              onGenerate={onGenerateShareLink}
              onDelete={onDeleteShareLink}
              onCopy={onCopyShareLink}
            />
          )}

          <main className="mx-auto flex w-full max-w-[1600px] flex-col gap-4 overflow-y-auto px-6 py-4 pb-20 lg:h-[calc(100dvh-var(--app-header-offset,5rem))] lg:gap-5 lg:overflow-hidden lg:px-8 lg:pb-4">
            <div className="shrink-0 space-y-4">
              <Breadcrumbs aria-label={t('common.actions.backToList')}>
                <BreadcrumbsLabel className="sr-only">
                  {t('common.actions.backToList')}
                </BreadcrumbsLabel>
                <BreadcrumbList>
                  <BreadcrumbItem>
                    <BreadcrumbLink asChild>
                      <Link href="/videos/groups">{t('navigation.groupsNav')}</Link>
                    </BreadcrumbLink>
                  </BreadcrumbItem>
                  <BreadcrumbItem isCurrent>{group.name}</BreadcrumbItem>
                </BreadcrumbList>
              </Breadcrumbs>

              <header className="flex flex-col justify-between gap-3 lg:flex-row lg:items-end">
                <div className="min-w-0 space-y-1">
                  <Heading size="24" rule="4" hasChip={!!shareLink}>
                    {shareLink ? (
                      <HeadingShoulder>
                        <ChipLabel variant="filled-1" color="blue" className="min-h-0 text-oln-14N-100">
                          {t('videos.groupDetail.sharingBadge')}
                        </ChipLabel>
                      </HeadingShoulder>
                    ) : null}
                    <HeadingTitle level="h1">{group.name}</HeadingTitle>
                  </Heading>
                  {group.description ? (
                    <p className="line-clamp-2 max-w-3xl text-std-16N-170 text-solid-gray-700">
                      {group.description}
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setIsShareDialogOpen(true)}
                  >
                    <Share2 className="mr-1.5 h-3.5 w-3.5" />
                    {t('videos.groupDetail.shareOpen')}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={onStartEditing}
                    title={t('videos.groupDetail.editTitle')}
                  >
                    <Pencil className="mr-1.5 h-3.5 w-3.5" />
                    {t('videos.groupDetail.editTitle')}
                  </Button>
                  <Button
                    type="button"
                    variant="text"
                    size="sm"
                    onClick={onDeleteGroup}
                    disabled={isDeleting}
                    title={t('videos.groupDetail.delete')}
                    className="text-error-1 hover:bg-red-50"
                  >
                    {isDeleting ? (
                      <InlineSpinner className="mr-1.5 h-3.5 w-3.5" />
                    ) : (
                      <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    {t('videos.groupDetail.delete')}
                  </Button>
                </div>
              </header>
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-6 lg:grid lg:grid-cols-4 lg:items-stretch">
              <GroupVideoList
                group={group}
                selectedVideo={selectedVideo}
                deleteError={deleteError}
                isMobile={isMobile}
                mobileTab={mobileTab}
                sensors={sensors}
                onOpenAdd={() => onOpenAddModalChange(true)}
                onVideoSelect={onVideoSelect}
                onMobileTabChange={onMobileTabChange}
                onRemoveVideo={onRemoveVideo}
                onDragEnd={onDragEnd}
              />

              <GroupPlayerPanel
                groupId={groupId}
                selectedVideo={selectedVideo}
                mobileTab={mobileTab}
                videoRef={videoRef}
                youtubeStartSeconds={youtubeStartSeconds}
                onVideoCanPlay={onVideoCanPlay}
                onVideoPlayFromTime={onVideoPlayFromTime}
              />

              <aside className="hidden min-h-0 flex-col lg:col-span-1 lg:flex">
                <ChatPanel
                  groupId={groupId ?? undefined}
                  onVideoPlay={onVideoPlayFromTime}
                  className="h-full min-h-0 flex-1"
                />
              </aside>
            </div>
          </main>

          <GroupMobileNav mobileTab={mobileTab} onChange={onMobileTabChange} />

          <AddVideosDialog
            isOpen={isAddModalOpen}
            onOpenChange={onOpenAddModalChange}
            groupId={groupId}
            group={group}
          />
        </>
      )}
    </div>
  );
}
