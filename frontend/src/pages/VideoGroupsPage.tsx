import { useEffect, useState, type KeyboardEvent } from 'react';
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
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useTranslation } from 'react-i18next';
import { useI18nNavigate } from '@/lib/i18n';
import type { VideoGroupList } from '@/lib/api';
import { AppPageShell } from '@/components/layout/AppPageShell';
import { AppPageHeader } from '@/components/layout/AppPageHeader';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { useAuth } from '@/hooks/useAuth';
import { useVideoGroups } from '@/hooks/useVideoGroups';
import {
  useCreateVideoGroupMutation,
  useReorderVideoGroupsMutation,
} from '@/hooks/useVideoGroupsPageData';
import { VideoGroupCreateModal } from '@/components/video/VideoGroupCreateModal';
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  FolderOpen,
  GripVertical,
  Plus,
} from 'lucide-react';

interface SortableGroupCardProps {
  group: VideoGroupList;
  isFirst: boolean;
  isLast: boolean;
  canReorder: boolean;
  isSortingDisabled: boolean;
  onOpen: (groupId: number) => void;
  onMove: (groupId: number, direction: 'up' | 'down') => void;
}

function SortableGroupCard({
  group,
  isFirst,
  isLast,
  canReorder,
  isSortingDisabled,
  onOpen,
  onMove,
}: SortableGroupCardProps) {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: group.id,
    disabled: isSortingDisabled,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const handleOpen = () => {
    onOpen(group.id);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onOpen(group.id);
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      role="button"
      tabIndex={0}
      onClick={handleOpen}
      onKeyDown={handleKeyDown}
      className={`group text-left bg-white rounded-2xl shadow-[0_4px_20px_rgba(28,25,23,0.04)] overflow-hidden border border-transparent hover:shadow-[0_8px_30px_rgba(28,25,23,0.10)] cursor-pointer transition-colors ${isDragging ? 'shadow-lg z-50' : ''}`}
    >
      <div className="p-5">
        <div className="flex items-start gap-3">
          {canReorder && (
            <span
              {...attributes}
              {...listeners}
              onClick={(event) => event.stopPropagation()}
              className={`mt-0.5 shrink-0 text-[#9aa49a] ${isSortingDisabled ? 'cursor-wait opacity-50' : 'cursor-grab active:cursor-grabbing'}`}
              aria-label={t('videos.groups.dragHandle')}
            >
              <GripVertical className="w-5 h-5" />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <h2 className="font-extrabold text-[#191c19] text-base leading-snug mb-2 group-hover:text-[#00652c] transition-colors">
              {group.name}
            </h2>
            <p className="text-sm text-[#6f7a6e] leading-relaxed line-clamp-2 mb-4 min-h-[2.5rem]">
              {group.description || t('common.messages.noDescription')}
            </p>
          </div>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="inline-flex items-center px-2.5 py-1 bg-[#f0fdf4] text-[#00652c] text-xs font-bold rounded-full">
            {t('videos.groups.videoCount', { count: group.video_count })}
          </span>
          <div className="flex items-center gap-1">
            {canReorder && (
              <>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onMove(group.id, 'up');
                  }}
                  disabled={isFirst || isSortingDisabled}
                  aria-label={t('videos.groups.moveUp', { name: group.name })}
                  className="w-8 h-8 rounded-full flex items-center justify-center bg-[#f2f4ef] text-[#3f493f] hover:bg-[#e7e9e4] disabled:opacity-35 disabled:cursor-not-allowed transition-colors"
                >
                  <ArrowUp className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onMove(group.id, 'down');
                  }}
                  disabled={isLast || isSortingDisabled}
                  aria-label={t('videos.groups.moveDown', { name: group.name })}
                  className="w-8 h-8 rounded-full flex items-center justify-center bg-[#f2f4ef] text-[#3f493f] hover:bg-[#e7e9e4] disabled:opacity-35 disabled:cursor-not-allowed transition-colors"
                >
                  <ArrowDown className="w-4 h-4" />
                </button>
              </>
            )}
            <span className="w-8 h-8 rounded-full flex items-center justify-center bg-[#f0fdf4] text-[#00652c] opacity-0 group-hover:opacity-100 transition-opacity">
              <ArrowRight className="w-4 h-4" />
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function VideoGroupsPage() {
  const { user, isLoading: authLoading } = useAuth();
  const navigate = useI18nNavigate();
  const {
    groups,
    isLoading,
    error: loadError,
    isFetchingNextPage,
    sentinelRef,
  } = useVideoGroups(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [orderedGroups, setOrderedGroups] = useState<VideoGroupList[] | null>(null);
  const { t } = useTranslation();

  const createGroupMutation = useCreateVideoGroupMutation({ userId: user?.id });
  const reorderGroupsMutation = useReorderVideoGroupsMutation({ userId: user?.id });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  useEffect(() => {
    setOrderedGroups(groups);
  }, [groups]);

  const handleCreate = async (name: string, description: string) => {
    await createGroupMutation.mutateAsync({ name, description });
  };

  const visibleGroups = orderedGroups ?? groups;
  const reorderError = reorderGroupsMutation.error instanceof Error
    ? reorderGroupsMutation.error.message
    : null;
  const canReorder = visibleGroups.length > 1;
  const isSortingDisabled = !canReorder || reorderGroupsMutation.isPending;

  const applyGroupOrder = (nextGroups: VideoGroupList[]) => {
    const previousGroups = visibleGroups;
    setOrderedGroups(nextGroups);
    reorderGroupsMutation.mutate(
      nextGroups.map((group) => group.id),
      {
        onError: () => setOrderedGroups(previousGroups),
      },
    );
  };

  const handleMoveGroup = (groupId: number, direction: 'up' | 'down') => {
    if (isSortingDisabled) return;
    const oldIndex = visibleGroups.findIndex((group) => group.id === groupId);
    if (oldIndex === -1) return;
    const newIndex = direction === 'up' ? oldIndex - 1 : oldIndex + 1;
    if (newIndex < 0 || newIndex >= visibleGroups.length) return;
    applyGroupOrder(arrayMove(visibleGroups, oldIndex, newIndex));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    if (isSortingDisabled) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = visibleGroups.findIndex((group) => group.id === active.id);
    const newIndex = visibleGroups.findIndex((group) => group.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    applyGroupOrder(arrayMove(visibleGroups, oldIndex, newIndex));
  };

  return (
    <AppPageShell activePage="groups">
      <AppPageHeader
        title={t('videos.groups.title')}
        description={t('videos.groups.subtitle')}
        action={(
          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            className="shrink-0 flex items-center gap-2 px-5 py-2.5 bg-[#00652c] text-white text-sm font-bold rounded-xl hover:opacity-90 shadow-sm transition-all active:scale-95"
          >
            <Plus className="w-4 h-4" />
            {t('videos.groups.create')}
          </button>
        )}
      />

      <div className="w-full">
        {(loadError || reorderError) && (
          <div className="mb-6 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
            {loadError || reorderError}
          </div>
        )}

        {authLoading || isLoading ? (
          <div className="flex justify-center py-24">
            <LoadingSpinner />
          </div>
        ) : groups.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-20 h-20 rounded-2xl bg-[#f0fdf4] flex items-center justify-center mb-6">
              <FolderOpen className="w-10 h-10 text-[#00652c] opacity-60" />
            </div>
            <h2 className="text-base font-bold text-[#191c19] mb-2">
              {t('videos.groups.empty')}
            </h2>
            <p className="text-sm text-[#6f7a6e] mb-8 max-w-sm">
              {t('videos.groups.emptyDescription')}
            </p>
            <button
              type="button"
              onClick={() => setIsModalOpen(true)}
              className="flex items-center gap-2 px-5 py-2.5 bg-[#00652c] text-white text-sm font-bold rounded-xl hover:opacity-90 shadow-sm transition-all active:scale-95"
            >
              <Plus className="w-4 h-4" />
              {t('videos.groups.create')}
            </button>
          </div>
        ) : (
          <>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={visibleGroups.map((group) => group.id)} strategy={rectSortingStrategy}>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                  {visibleGroups.map((group, index) => (
                    <SortableGroupCard
                      key={group.id}
                      group={group}
                      isFirst={index === 0}
                      isLast={index === visibleGroups.length - 1}
                      canReorder={canReorder}
                      isSortingDisabled={isSortingDisabled}
                      onOpen={(groupId) => navigate(`/videos/groups/${groupId}`)}
                      onMove={handleMoveGroup}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>

            <div ref={sentinelRef} data-testid="groups-infinite-scroll-sentinel" />

            {isFetchingNextPage && (
              <div className="flex justify-center mt-4">
                <span className="text-sm text-[#3f493f]">{t('videos.groups.loadingMore')}</span>
              </div>
            )}
          </>
        )}
      </div>

      <VideoGroupCreateModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onCreate={handleCreate}
      />
    </AppPageShell>
  );
}
