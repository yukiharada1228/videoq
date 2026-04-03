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
import { DashboardButton } from '@/components/dashboard/DashboardButton';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { InlineSpinner } from '@/components/common/InlineSpinner';
import { SeoHead } from '@/components/seo/SeoHead';
import { Link, useI18nNavigate } from '@/lib/i18n';
import { handleAsyncError } from '@/lib/utils/errorHandling';
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
import {
  ArrowLeft, ChevronRight, Plus, GripVertical,
  CheckCircle, Clock, AlertCircle, Copy, Trash2,
  Pencil, List, Play,
  Save, X, GraduationCap,
} from 'lucide-react';

function buildYoutubeEmbedSrc(embedUrl: string, startSeconds: number | null): string {
  if (startSeconds === null) {
    return embedUrl;
  }
  return `${embedUrl}?autoplay=1&start=${startSeconds}`;
}

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

// ── Status badge ─────────────────────────────────────────────────────────────

function VideoStatusBadge({ status }: { status: string }) {
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

// ── Sortable video item ───────────────────────────────────────────────────────

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
          onClick={(e) => e.stopPropagation()}
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
        onClick={(e) => { e.stopPropagation(); onRemove(video.id); }}
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        aria-label={t('videos.groupDetail.removeFromGroup')}
        className="inline-flex items-center rounded-lg p-1.5 text-red-600 hover:bg-red-50 transition-colors shrink-0"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

// ── Share link panel ──────────────────────────────────────────────────────────

interface ShareLinkPanelProps {
  shareSlug: string;
  shareLink: string | null;
  isGeneratingLink: boolean;
  isCopied: boolean;
  onGenerate: (shareSlug: string) => Promise<void> | void;
  onDelete: () => void;
  onCopy: () => void;
}

function ShareLinkPanel({ shareSlug, shareLink, isGeneratingLink, isCopied, onGenerate, onDelete, onCopy }: ShareLinkPanelProps) {
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
              onChange={(e) => setInputValue(e.target.value)}
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
          onClick={() => { void onGenerate(inputValue); }}
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

// ── Add videos dialog ─────────────────────────────────────────────────────────

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
    if (ORDERING_OPTIONS.includes(value)) setOrdering(value);
  }, []);

  const handleTagToggle = useCallback((tagId: number) => {
    setSelectedTagIds((prev) =>
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId]
    );
  }, []);

  const handleTagClear = useCallback(() => setSelectedTagIds([]), []);

  useEffect(() => {
    const handler = setTimeout(() => setVideoSearch(videoSearchInput), 300);
    return () => clearTimeout(handler);
  }, [videoSearchInput]);

  const availableVideosQuery = useAddableVideosQuery({
    isOpen, groupId, group,
    q: videoSearch.trim(), status: statusFilter, ordering, tagIds: selectedTagIds,
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
        alert(t('videos.groupDetail.addResult', { added: result.added_count, skipped: result.skipped_count }));
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
                onChange={(e) => setVideoSearchInput(e.target.value)}
                className="w-full md:w-1/2 px-3 py-2 bg-[#f2f4ef] border border-[#e1e3de] rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#00652c]/20 focus:border-[#00652c]"
              />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
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
                onClick={() => setSelectedVideos(availableVideos?.map((v) => v.id) ?? [])}
                disabled={!availableVideos?.length}
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
                {availableVideos.map((v) => (
                  <div key={v.id} className="flex items-center gap-3 p-3 border border-[#e1e3de] rounded-xl hover:bg-[#f2f4ef] transition-colors">
                    <Checkbox
                      id={`video-${v.id}`}
                      checked={selectedVideos.includes(v.id)}
                      onCheckedChange={(checked: boolean | 'indeterminate') => {
                        if (checked === true) setSelectedVideos([...selectedVideos, v.id]);
                        else if (checked === false) setSelectedVideos(selectedVideos.filter((id) => id !== v.id));
                      }}
                    />
                    <label htmlFor={`video-${v.id}`} className="flex-1 cursor-pointer">
                      <div className="text-sm font-medium text-[#191c19]">{v.title}</div>
                      <div className="text-xs text-[#6f7a6e]">{v.description || t('common.messages.noDescription')}</div>
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

// ── Main page ─────────────────────────────────────────────────────────────────

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
    if (v) setSelectedVideo(convertVideoInGroupToSelectedVideo(v));
  }, [group?.videos]);

  const { videoRef, handleVideoCanPlay, handleVideoPlayFromTime, youtubeStartSeconds } = useVideoPlayback({
    selectedVideo,
    onVideoSelect: handleVideoSelect,
    onMobileSwitch: () => setMobileTab('player'),
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const { syncGroupDetail, setGroupDetailCache, removeVideoMutation, reorderVideosMutation, deleteGroupMutation, updateGroupMutation } =
    useVideoGroupDetailMutations({
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
      if (selectedVideo) setSelectedVideo(null);
      return;
    }
    const exists = selectedVideo ? videos.some((v) => v.id === selectedVideo.id) : false;
    if (!exists) setSelectedVideo(convertVideoInGroupToSelectedVideo(videos[0]));
  }, [group?.videos, selectedVideo]);


  const handleRemoveVideo = async (videoId: number) => {
    if (!confirm(t('videos.groupDetail.removeVideoConfirm')) || !groupId) return;
    try {
      await removeVideoMutation.mutateAsync(videoId);
      if (selectedVideo?.id === videoId) setSelectedVideo(null);
    } catch (err) {
      handleAsyncError(err, t('videos.groupDetail.removeVideoError'), () => {});
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !group?.videos || !groupId) return;
    const oldIndex = group.videos.findIndex((v) => v.id === active.id);
    const newIndex = group.videos.findIndex((v) => v.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const newVideos = arrayMove(group.videos, oldIndex, newIndex);
    setGroupDetailCache({ ...group, videos: newVideos });
    try {
      await reorderVideosMutation.mutateAsync(newVideos.map((v) => v.id));
    } catch (err) {
      handleAsyncError(err, t('videos.groupDetail.orderUpdateError'), () => {});
      await syncGroupDetail();
    }
  };

  const handleDelete = async () => {
    if (!groupId || !confirm(t('confirmations.deleteGroup'))) return;
    try {
      setIsDeleting(true);
      await deleteGroupMutation.mutateAsync();
    } catch (err) {
      handleAsyncError(err, t('videos.groupDetail.deleteError'), () => {});
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    if (group) {
      setEditedName(group.name);
      setEditedDescription(group.description || '');
    }
  };

  const isLoading = groupIsLoading || groupIsFetching;
  const isUpdating = updateGroupMutation.isPending;
  const updateError = updateGroupMutation.error instanceof Error ? updateGroupMutation.error.message : null;

  // ── Loading / error states ───────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f8faf5]">
        <LoadingSpinner />
      </div>
    );
  }

  if (error && !group) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#f8faf5] gap-4">
        <p className="text-red-500">{error}</p>
        <Link href="/videos/groups" className="text-[#00652c] font-bold hover:underline flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" />
          {t('common.actions.backToList')}
        </Link>
      </div>
    );
  }

  if (!group) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f8faf5]">
        <p className="text-[#3f493f]">{t('common.messages.groupNotFound')}</p>
      </div>
    );
  }

  const mobileTabIcon: Record<MobileTab, typeof List> = { videos: List, player: Play };
  const mobileTabLabel: Record<MobileTab, string> = {
    videos: t('videos.groupDetail.mobileTabs.videos'),
    player: t('videos.groupDetail.mobileTabs.player'),
  };

  return (
    <>
      <SeoHead
        title={`${group.name} | VideoQ`}
        description={group.description || t('seo.app.groupDetail.description')}
        path={`/videos/groups/${group.id}`}
      />
      <div
        className="bg-[#f8faf5] flex flex-col"
        style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
      >
      {/* ── Fixed Header ─────────────────────────────────────────────────── */}
      <header className="fixed top-0 w-full bg-white/80 backdrop-blur-xl border-b border-stone-200/60 z-50">
        <div className="max-w-screen-xl px-6 lg:px-8 mx-auto w-full flex justify-between items-center py-4">
        <div className="flex items-center gap-6 min-w-0">
          <Link href="/" className="flex items-center gap-2 text-xl font-bold text-stone-900 shrink-0" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
            <GraduationCap className="text-[#00652c] w-6 h-6" />
            <span>VideoQ</span>
          </Link>
          <div className="hidden lg:flex items-center gap-1 text-sm text-[#6f7a6e] font-medium min-w-0">
            <Link href="/videos/groups" className="text-stone-400 hover:text-[#00652c] transition-colors shrink-0">
              {t('videos.groupDetail.breadcrumbGroups')}
            </Link>
            <ChevronRight className="w-3.5 h-3.5 text-stone-300 shrink-0" />
            <span className="text-[#00652c] font-bold border-b-2 border-[#00652c] truncate max-w-[200px]">
              {group.name}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center gap-1.5 px-3 sm:px-4 py-1.5 rounded-full border border-[#00652c] text-[#00652c] font-bold text-sm hover:bg-[#f0fdf4] transition-colors active:scale-95"
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{t('videos.groupDetail.addVideoButton')}</span>
          </button>

          <div className="h-6 w-px bg-stone-200 mx-1" />

          <button
            onClick={() => setIsEditing(true)}
            className="p-2 text-[#3f493f] hover:bg-stone-100 rounded-full transition-colors"
            title={t('videos.groupDetail.editTitle')}
          >
            <Pencil className="w-4 h-4" />
          </button>
          <button
            onClick={handleDelete}
            disabled={isDeleting}
            className="p-2 text-red-500 hover:bg-red-50 rounded-full transition-colors disabled:opacity-50"
            title={t('videos.groupDetail.delete')}
          >
            {isDeleting ? <InlineSpinner className="w-4 h-4" /> : <Trash2 className="w-4 h-4" />}
          </button>

        </div>
        </div>
      </header>

      {/* ── Edit Dialog ──────────────────────────────────────────────────── */}
      <Dialog open={isEditing} onOpenChange={(open) => !open && handleCancelEdit()}>
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
                onChange={(e) => setEditedName(e.target.value)}
                disabled={isUpdating}
                className="w-full px-3 py-2.5 bg-[#f2f4ef] border border-[#e1e3de] rounded-xl text-sm focus:ring-2 focus:ring-[#00652c]/20 focus:border-[#00652c] outline-none transition-all"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-[#3f493f]">{t('videos.groups.descriptionLabel')}</label>
              <textarea
                value={editedDescription}
                onChange={(e) => setEditedDescription(e.target.value)}
                disabled={isUpdating}
                rows={3}
                className="w-full px-3 py-2.5 bg-[#f2f4ef] border border-[#e1e3de] rounded-xl text-sm focus:ring-2 focus:ring-[#00652c]/20 focus:border-[#00652c] outline-none transition-all resize-none"
              />
            </div>
          </div>
          <DialogFooter>
            <button
              onClick={handleCancelEdit}
              disabled={isUpdating}
              className="flex items-center gap-1.5 px-4 py-2 border border-[#e1e3de] rounded-xl text-sm font-bold hover:bg-[#f2f4ef] transition-colors disabled:opacity-50"
            >
              <X className="w-3.5 h-3.5" />
              {t('common.actions.cancel')}
            </button>
            <button
              onClick={() => void updateGroupMutation.mutateAsync({ name: editedName, description: editedDescription })}
              disabled={isUpdating || !editedName.trim()}
              className="flex items-center gap-1.5 px-4 py-2 bg-[#00652c] text-white rounded-xl text-sm font-bold hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {isUpdating ? <InlineSpinner className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
              {isUpdating ? t('common.actions.saving') : t('common.actions.save')}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Main ─────────────────────────────────────────────────────────── */}
      <main className="mt-16 flex flex-col px-6 pt-4 gap-4 max-w-[1600px] mx-auto w-full overflow-y-auto pb-16 lg:pb-0 lg:h-[calc(100dvh-4rem)] lg:overflow-hidden">
        {/* Share link panel */}
        <ShareLinkPanel
          shareSlug={group.share_slug ?? ''}
          shareLink={shareLink}
          isGeneratingLink={isGeneratingLink}
          isCopied={isCopied}
          onGenerate={generateShareLink}
          onDelete={deleteShareLink}
          onCopy={copyShareLink}
        />

        {/* 3-column grid */}
        <div className="flex flex-col lg:grid lg:grid-cols-4 gap-6 lg:flex-1 lg:min-h-0 lg:items-stretch">

          {/* LEFT: Video list */}
          <aside className={`lg:col-span-1 flex flex-col min-h-0 ${mobileTab === 'videos' ? 'flex' : 'hidden lg:flex'}`}>
            <div className="bg-white rounded-xl flex flex-col h-full overflow-hidden shadow-[0_4px_20px_rgba(28,25,23,0.04)]">
              <div className="p-4 border-b border-stone-100 flex items-center justify-between gap-2 shrink-0">
                <h2 className="font-extrabold text-[#191c19]">{t('videos.groupDetail.videoListTitle')}</h2>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs bg-[#f2f4ef] px-2 py-0.5 rounded-full text-[#6f7a6e] font-medium">
                    {t('videos.groupDetail.videoCount', { count: group.videos?.length ?? 0 })}
                  </span>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-2 space-y-1">
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
                            if (isMobile) setMobileTab('player');
                          }}
                          onRemove={handleRemoveVideo}
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

          {/* CENTER: Video player */}
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
                      onCanPlay={handleVideoCanPlay}
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
            {/* Chat below player on mobile */}
            <div className="lg:hidden">
              <ChatPanel
                groupId={groupId ?? undefined}
                onVideoPlay={handleVideoPlayFromTime}
                className="h-[480px] shadow-[0_4px_20px_rgba(28,25,23,0.04)]"
              />
            </div>
          </section>

          {/* RIGHT: Chat (desktop only) */}
          <aside className="hidden lg:flex lg:col-span-1 flex-col min-h-0">
            <ChatPanel
              groupId={groupId ?? undefined}
              onVideoPlay={handleVideoPlayFromTime}
              className="flex-1 min-h-0 shadow-[0_4px_20px_rgba(28,25,23,0.04)]"
            />
          </aside>
        </div>
      </main>

      {/* ── Mobile bottom nav ─────────────────────────────────────────────── */}
      <nav className="fixed bottom-0 left-0 w-full z-50 lg:hidden flex justify-around items-center h-16 bg-white border-t border-stone-100 shadow-[0_-4px_20px_rgba(28,25,23,0.06)] rounded-t-2xl px-4">
        {(['videos', 'player'] as MobileTab[]).map((tab) => {
          const Icon = mobileTabIcon[tab];
          const isActive = mobileTab === tab;
          return (
            <button
              key={tab}
              onClick={() => setMobileTab(tab)}
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

      {/* Add Videos Dialog */}
      <AddVideosDialog
        isOpen={isAddModalOpen}
        onOpenChange={setIsAddModalOpen}
        groupId={groupId}
        group={group}
      />
      </div>
    </>
  );
}
