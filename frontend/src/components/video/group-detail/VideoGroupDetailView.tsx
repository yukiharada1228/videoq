import { useCallback, useEffect, useState, type ChangeEvent, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type SensorDescriptor,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle,
  Clock,
  Copy,
  GripVertical,
  List,
  Pencil,
  Play,
  Plus,
  Save,
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
import { useToast } from '@/components/common/feedback';
import { TagFilterPanel } from '@/components/video/TagFilterPanel';
import { TagManagementModal } from '@/components/video/TagManagementModal';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useTags } from '@/hooks/useTags';
import {
  useAddableVideosQuery,
  useAddVideosToGroupMutation,
} from '@/hooks/useVideoGroupDetailData';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const MOBILE_SENSORS: SensorDescriptor<any>[] = [];

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
  onVideoPlayFromTime: (videoId: number, seconds: number) => void;
  onGenerateShareLink: (shareSlug: string) => Promise<void> | void;
  onDeleteShareLink: () => void;
  onCopyShareLink: () => void;
}

function VideoStatusBadge({ status }: { status: VideoInGroup['status'] }) {
  const { t } = useTranslation();

  if (status === 'completed') {
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-[#00652c] mt-1">
        <CheckCircle className="w-3 h-3 fill-current" />
        {t('videos.groupDetail.status.completed')}
      </span>
    );
  }

  if (status === 'error') {
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-red-500 mt-1">
        <AlertCircle className="w-3 h-3" />
        {t('videos.groupDetail.status.error')}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-[#904d00] bg-[#ffdcc3]/40 px-1.5 py-0.5 rounded-full mt-1">
      <Clock className="w-3 h-3" />
      {t('videos.groupDetail.status.processing')}
    </span>
  );
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
      className={`flex items-center gap-2 p-3 rounded-xl cursor-pointer group transition-colors ${
        isSelected
          ? 'bg-[#f0fdf4] border-l-4 border-[#00652c]'
          : 'hover:bg-stone-50'
      } ${isDragging ? 'shadow-lg z-50' : ''}`}
    >
      {!isMobile && (
        <span
          {...attributes}
          {...listeners}
          onClick={(event) => event.stopPropagation()}
          className="text-stone-300 cursor-grab active:cursor-grabbing shrink-0"
        >
          <GripVertical className="w-4 h-4" />
        </span>
      )}
      <div className="flex-1 min-w-0">
        <p className={`text-sm truncate leading-tight ${isSelected ? 'font-bold text-[#00652c]' : 'font-medium text-[#191c19]'}`}>
          {video.title}
        </p>
        <VideoStatusBadge status={video.status} />
      </div>
      <button
        onClick={(event) => {
          event.stopPropagation();
          onRemove(video.id);
        }}
        onPointerDown={(event) => event.stopPropagation()}
        onMouseDown={(event) => event.stopPropagation()}
        aria-label={t('videos.groupDetail.removeFromGroup')}
        className="inline-flex items-center rounded-lg p-1.5 text-red-600 hover:bg-red-50 transition-colors shrink-0"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

function ShareLinkPanel({
  shareSlug,
  shareLink,
  isGeneratingLink,
  isCopied,
  onGenerate,
  onDelete,
  onCopy,
}: {
  shareSlug: string;
  shareLink: string | null;
  isGeneratingLink: boolean;
  isCopied: boolean;
  onGenerate: (shareSlug: string) => Promise<void> | void;
  onDelete: () => void;
  onCopy: () => void;
}) {
  const { t } = useTranslation();
  const [inputValue, setInputValue] = useState(shareSlug);

  useEffect(() => {
    setInputValue(shareSlug);
  }, [shareSlug]);

  return (
    <div className="bg-white rounded-xl p-4 flex flex-col lg:flex-row lg:items-center gap-3 lg:gap-4 shadow-[0_4px_20px_rgba(28,25,23,0.04)]">
      <div className="flex-1 min-w-0 space-y-2">
        <div className="flex flex-col lg:flex-row lg:items-center gap-2 lg:gap-3">
          <div className="flex-1 bg-[#f2f4ef] rounded-xl px-4 py-2 border border-[#e1e3de]/40 min-w-0">
            <input
              type="text"
              value={inputValue}
              onChange={(event) => setInputValue(event.target.value)}
              placeholder={t('videos.groupDetail.shareSlugPlaceholder')}
              className="w-full bg-transparent text-[#3f493f] text-sm outline-none"
            />
          </div>
          <p className="text-xs text-[#6f7a6e] whitespace-nowrap">
            {t('videos.groupDetail.shareSlugHelp')}
          </p>
        </div>
        <div className="flex flex-col lg:flex-row lg:items-center gap-2 lg:gap-3">
          <span className="text-sm font-bold text-[#3f493f] whitespace-nowrap shrink-0">
            {t('videos.groupDetail.shareLinkLabel')}
          </span>
          {shareLink ? (
            <div className="flex-1 min-w-0 bg-white rounded-xl px-4 py-2 border border-[#e1e3de]/40">
              <input
                type="text"
                value={shareLink}
                readOnly
                className="w-full bg-transparent text-[#6f7a6e] text-sm outline-none cursor-default"
              />
            </div>
          ) : (
            <p className="text-sm text-[#6f7a6e]">{t('videos.groupDetail.share.disabled')}</p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0 self-start lg:self-center">
        {shareLink && (
          <button
            onClick={onCopy}
            className="flex items-center gap-2 px-4 py-2 bg-[#00652c] text-white rounded-xl text-sm font-bold hover:opacity-90 transition-opacity"
          >
            <Copy className="w-3.5 h-3.5" />
            {isCopied ? t('videos.groupDetail.copied') : t('videos.groupDetail.copyButton')}
          </button>
        )}
        <button
          onClick={() => {
            void onGenerate(inputValue);
          }}
          disabled={isGeneratingLink || !inputValue.trim()}
          className="flex items-center gap-2 px-4 py-2 bg-[#00652c] text-white rounded-xl text-sm font-bold hover:opacity-90 transition-opacity disabled:opacity-50 shrink-0"
        >
          {isGeneratingLink ? <InlineSpinner className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
          {isGeneratingLink ? t('videos.groupDetail.generating') : t('common.actions.save')}
        </button>
        {shareLink && (
          <button
            onClick={onDelete}
            className="px-4 py-2 text-red-600 text-sm font-bold hover:bg-red-50 rounded-xl transition-colors"
          >
            {t('videos.groupDetail.disable')}
          </button>
        )}
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

  const handleOrderingChange = useCallback((event: ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value as OrderingOption;
    if (ORDERING_OPTIONS.includes(value)) setOrdering(value);
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

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-[95vw] lg:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('videos.groupDetail.addVideos')}</DialogTitle>
            <DialogDescription>
              {t('videos.groupDetail.addVideosDescription', 'Select videos to add to this group.')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex flex-wrap items-center gap-2">
              <input
                placeholder={t('videos.groupDetail.searchPlaceholder')}
                value={videoSearchInput}
                onChange={(event) => setVideoSearchInput(event.target.value)}
                className="w-full md:w-1/2 px-3 py-2 bg-[#f2f4ef] border border-[#e1e3de] rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#00652c]/20 focus:border-[#00652c]"
              />
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                className="px-3 py-2 bg-[#f2f4ef] border border-[#e1e3de] rounded-xl text-sm outline-none"
              >
                <option value="">{t('videos.groupDetail.statusFilter.all')}</option>
                <option value="completed">{t('videos.groupDetail.statusFilter.completed')}</option>
                <option value="processing">{t('videos.groupDetail.statusFilter.processing')}</option>
                <option value="indexing">{t('videos.groupDetail.statusFilter.indexing')}</option>
                <option value="pending">{t('videos.groupDetail.statusFilter.pending')}</option>
                <option value="error">{t('videos.groupDetail.statusFilter.error')}</option>
              </select>
              <select
                value={ordering}
                onChange={handleOrderingChange}
                className="px-3 py-2 bg-[#f2f4ef] border border-[#e1e3de] rounded-xl text-sm outline-none"
              >
                <option value="uploaded_at_desc">{t('videos.groupDetail.ordering.uploadedDesc')}</option>
                <option value="uploaded_at_asc">{t('videos.groupDetail.ordering.uploadedAsc')}</option>
                <option value="title_asc">{t('videos.groupDetail.ordering.titleAsc')}</option>
                <option value="title_desc">{t('videos.groupDetail.ordering.titleDesc')}</option>
              </select>
              <button
                onClick={() => setSelectedVideos(availableVideos.map((video) => video.id))}
                disabled={!availableVideos.length}
                className="px-3 py-2 border border-[#e1e3de] rounded-xl text-sm font-medium hover:bg-[#f2f4ef] disabled:opacity-40"
              >
                {t('videos.groupDetail.selectAll')}
              </button>
              <button
                onClick={() => setSelectedVideos([])}
                disabled={selectedVideos.length === 0}
                className="px-3 py-2 border border-[#e1e3de] rounded-xl text-sm font-medium hover:bg-[#f2f4ef] disabled:opacity-40"
              >
                {t('videos.groupDetail.clearSelection')}
              </button>
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
              <p className="text-center text-[#6f7a6e] py-8">{t('videos.groupDetail.noAvailableVideos')}</p>
            ) : (
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {availableVideos.map((video) => (
                  <div key={video.id} className="flex items-center gap-3 p-3 border border-[#e1e3de] rounded-xl hover:bg-[#f2f4ef] transition-colors">
                    <Checkbox
                      id={`video-${video.id}`}
                      checked={selectedVideos.includes(video.id)}
                      onCheckedChange={(checked: boolean | 'indeterminate') => {
                        if (checked === true) setSelectedVideos([...selectedVideos, video.id]);
                        else if (checked === false) setSelectedVideos(selectedVideos.filter((id) => id !== video.id));
                      }}
                    />
                    <label htmlFor={`video-${video.id}`} className="flex-1 cursor-pointer">
                      <div className="text-sm font-medium text-[#191c19]">{video.title}</div>
                      <div className="text-xs text-[#6f7a6e]">{video.description || t('common.messages.noDescription')}</div>
                    </label>
                  </div>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <button
              onClick={() => onOpenChange(false)}
              className="px-4 py-2 border border-[#e1e3de] rounded-xl text-sm font-bold hover:bg-[#f2f4ef] transition-colors"
            >
              {t('common.actions.cancel')}
            </button>
            <button
              onClick={handleAddVideos}
              disabled={addVideosMutation.isPending || selectedVideos.length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-[#00652c] text-white rounded-xl text-sm font-bold hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {addVideosMutation.isPending && <InlineSpinner className="w-3.5 h-3.5" />}
              {addVideosMutation.isPending ? t('videos.groupDetail.adding') : t('videos.groupDetail.add')}
            </button>
          </DialogFooter>
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

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('videos.groupDetail.editTitle')}</DialogTitle>
          <DialogDescription>
            {t('videos.groupDetail.editDescription', 'Update the group name and description.')}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {updateError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">{updateError}</div>
          )}
          <div className="space-y-1">
            <label className="text-xs font-bold text-[#3f493f]">{t('videos.groups.nameLabel')}</label>
            <input
              type="text"
              value={editedName}
              onChange={(event) => onNameChange(event.target.value)}
              disabled={isUpdating}
              className="w-full px-3 py-2.5 bg-[#f2f4ef] border border-[#e1e3de] rounded-xl text-sm focus:ring-2 focus:ring-[#00652c]/20 focus:border-[#00652c] outline-none transition-all"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold text-[#3f493f]">{t('videos.groups.descriptionLabel')}</label>
            <textarea
              value={editedDescription}
              onChange={(event) => onDescriptionChange(event.target.value)}
              disabled={isUpdating}
              rows={3}
              className="w-full px-3 py-2.5 bg-[#f2f4ef] border border-[#e1e3de] rounded-xl text-sm focus:ring-2 focus:ring-[#00652c]/20 focus:border-[#00652c] outline-none transition-all resize-none"
            />
          </div>
        </div>
        <DialogFooter>
          <button
            onClick={() => onOpenChange(false)}
            disabled={isUpdating}
            className="flex items-center gap-1.5 px-4 py-2 border border-[#e1e3de] rounded-xl text-sm font-bold hover:bg-[#f2f4ef] transition-colors disabled:opacity-50"
          >
            <X className="w-3.5 h-3.5" />
            {t('common.actions.cancel')}
          </button>
          <button
            onClick={onSave}
            disabled={isUpdating || !editedName.trim()}
            className="flex items-center gap-1.5 px-4 py-2 bg-[#00652c] text-white rounded-xl text-sm font-bold hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {isUpdating ? <InlineSpinner className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
            {isUpdating ? t('common.actions.saving') : t('common.actions.save')}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function GroupVideoList({
  group,
  selectedVideo,
  deleteError,
  isDeleting,
  isMobile,
  mobileTab,
  sensors,
  onOpenAdd,
  onStartEditing,
  onDeleteGroup,
  onVideoSelect,
  onMobileTabChange,
  onRemoveVideo,
  onDragEnd,
}: {
  group: VideoGroup;
  selectedVideo: SelectedVideo | null;
  deleteError: string | null;
  isDeleting: boolean;
  isMobile: boolean;
  mobileTab: MobileTab;
  sensors: SensorDescriptor[];
  onOpenAdd: () => void;
  onStartEditing: () => void;
  onDeleteGroup: () => void;
  onVideoSelect: (videoId: number) => void;
  onMobileTabChange: (tab: MobileTab) => void;
  onRemoveVideo: (videoId: number) => Promise<void> | void;
  onDragEnd: (event: DragEndEvent) => Promise<void> | void;
}) {
  const { t } = useTranslation();

  return (
    <aside className={`lg:col-span-1 flex flex-col min-h-0 ${mobileTab === 'videos' ? 'flex' : 'hidden lg:flex'}`}>
      <div className="bg-white rounded-xl flex flex-col h-full overflow-hidden shadow-[0_4px_20px_rgba(28,25,23,0.04)]">
        {deleteError && (
          <div className="px-4 pt-3 shrink-0">
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">{deleteError}</div>
          </div>
        )}
        <div className="p-4 border-b border-stone-100 flex items-center justify-between gap-2 shrink-0">
          <h2 className="font-extrabold text-[#191c19] truncate flex-1 min-w-0">{group.name}</h2>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs bg-[#f2f4ef] px-2 py-0.5 rounded-full text-[#6f7a6e] font-medium">
              {t('videos.groupDetail.videoCount', { count: group.videos?.length ?? 0 })}
            </span>
            <button
              onClick={onOpenAdd}
              className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white border border-[#e1e3de] hover:bg-[#f2f4ef] transition-colors text-[#191c19] text-xs font-bold shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{t('videos.groupDetail.add')}</span>
            </button>
            <button
              onClick={onStartEditing}
              className="p-1.5 text-[#3f493f] hover:bg-stone-100 rounded-lg transition-colors"
              title={t('videos.groupDetail.editTitle')}
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onDeleteGroup}
              disabled={isDeleting}
              className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
              title={t('videos.groupDetail.delete')}
            >
              {isDeleting ? <InlineSpinner className="w-3.5 h-3.5" /> : <Trash2 className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
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
            <p className="text-center text-[#6f7a6e] py-8 text-sm">
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
  onVideoPlayFromTime: (videoId: number, seconds: number) => void;
}) {
  const { t } = useTranslation();

  return (
    <section className={`lg:col-span-2 flex flex-col gap-3 lg:min-h-0 ${mobileTab === 'player' ? 'flex' : 'hidden lg:flex'}`}>
      <div className="bg-white rounded-xl flex flex-col lg:flex-1 overflow-hidden shadow-[0_8px_30px_rgba(28,25,23,0.08)]">
        <div className="p-4 border-b border-stone-100 shrink-0 flex items-center justify-between gap-3 min-w-0">
          <h1 className="font-extrabold text-[#191c19] text-lg truncate flex-1 min-w-0">
            {selectedVideo ? selectedVideo.title : t('videos.groupDetail.playerPlaceholder')}
          </h1>
          <div className="flex items-center gap-2 shrink-0">
            {groupId && <DashboardButton groupId={groupId} size="sm" />}
          </div>
        </div>
        <div className="aspect-video lg:aspect-auto lg:flex-1 bg-[#1a1c1c] flex items-center justify-center lg:min-h-0">
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
              <p className="text-stone-400 text-sm">{t('videos.groupDetail.videoNoFile')}</p>
            )
          ) : (
            <p className="text-stone-400 text-sm text-center px-4">{t('videos.groupDetail.playerPlaceholder')}</p>
          )}
        </div>
      </div>
      <div className="lg:hidden">
        <ChatPanel
          groupId={groupId ?? undefined}
          onVideoPlay={onVideoPlayFromTime}
          className="h-[480px] shadow-[0_4px_20px_rgba(28,25,23,0.04)]"
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
    <nav className="fixed bottom-0 left-0 w-full z-50 lg:hidden flex justify-around items-center h-16 bg-white border-t border-stone-100 shadow-[0_-4px_20px_rgba(28,25,23,0.06)] rounded-t-2xl px-4">
      {(['videos', 'player'] as MobileTab[]).map((tab) => {
        const Icon = mobileTabIcon[tab];
        const isActive = mobileTab === tab;
        return (
          <button
            key={tab}
            onClick={() => onChange(tab)}
            className={`flex flex-col items-center justify-center gap-1 px-4 py-1 rounded-xl transition-colors ${
              isActive
                ? 'bg-[#f0fdf4] text-[#00652c]'
                : 'text-stone-400 hover:text-[#00652c]'
            }`}
          >
            <Icon className="w-5 h-5" />
            <span className="text-[11px] font-medium">{mobileTabLabel[tab]}</span>
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
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  return (
    <div
      className="bg-[#f8faf5] flex flex-col"
      style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
    >
      <AppNav activePage="groups" />

      {isLoading ? (
        <div className="mt-16 min-h-[calc(100dvh-64px)] flex items-center justify-center">
          <LoadingSpinner />
        </div>
      ) : error && !group ? (
        <div className="mt-16 min-h-[calc(100dvh-64px)] flex flex-col items-center justify-center gap-4">
          <p className="text-red-500">{error}</p>
          <Link href="/videos/groups" className="text-[#00652c] font-bold hover:underline flex items-center gap-1">
            <ArrowLeft className="w-4 h-4" />
            {t('common.actions.backToList')}
          </Link>
        </div>
      ) : !group ? (
        <div className="mt-16 min-h-[calc(100dvh-64px)] flex items-center justify-center">
          <p className="text-[#3f493f]">{t('common.messages.groupNotFound')}</p>
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

          <main className="mt-16 flex flex-col px-6 pt-4 gap-4 max-w-[1600px] mx-auto w-full overflow-y-auto pb-16 lg:pb-4 lg:h-[calc(100dvh-64px)] lg:overflow-hidden">
            <ShareLinkPanel
              shareSlug={shareSlug}
              shareLink={shareLink}
              isGeneratingLink={isGeneratingLink}
              isCopied={isCopied}
              onGenerate={onGenerateShareLink}
              onDelete={onDeleteShareLink}
              onCopy={onCopyShareLink}
            />

            <div className="flex flex-col lg:grid lg:grid-cols-4 gap-6 lg:flex-1 lg:min-h-0 lg:items-stretch">
              <GroupVideoList
                group={group}
                selectedVideo={selectedVideo}
                deleteError={deleteError}
                isDeleting={isDeleting}
                isMobile={isMobile}
                mobileTab={mobileTab}
                sensors={sensors}
                onOpenAdd={() => onOpenAddModalChange(true)}
                onStartEditing={onStartEditing}
                onDeleteGroup={onDeleteGroup}
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

              <aside className="hidden lg:flex lg:col-span-1 flex-col min-h-0">
                <ChatPanel
                  groupId={groupId ?? undefined}
                  onVideoPlay={onVideoPlayFromTime}
                  className="flex-1 min-h-0 shadow-[0_4px_20px_rgba(28,25,23,0.04)]"
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
