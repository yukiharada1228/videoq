import { useEffect, useState } from 'react';
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
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useTranslation } from 'react-i18next';
import { useI18nNavigate } from '@/lib/i18n';
import type { VideoGroupList } from '@/lib/api';
import { AppPageShell } from '@/components/layout/AppPageShell';
import { AppPageHeader } from '@/components/layout/AppPageHeader';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { ErrorMessage } from '@/components/auth/ErrorMessage';
import { useAuth } from '@/hooks/useAuth';
import { useVideoGroups } from '@/hooks/useVideoGroups';
import {
  useCreateVideoGroupMutation,
  useReorderVideoGroupsMutation,
} from '@/hooks/useVideoGroupsPageData';
import { VideoGroupCreateModal } from '@/components/video/VideoGroupCreateModal';
import { Button } from '@/components/ui/button';
import { ChipLabel } from '@/components/ui/chip-label';
import { Heading, HeadingTitle } from '@/components/ui/heading';
import { MenuList, MenuListItem } from '@/components/ui/menu-list';
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  GripVertical,
  Plus,
} from 'lucide-react';

interface SortableGroupRowProps {
  group: VideoGroupList;
  isFirst: boolean;
  isLast: boolean;
  canReorder: boolean;
  isSortingDisabled: boolean;
  onOpen: (groupId: number) => void;
  onMove: (groupId: number, direction: 'up' | 'down') => void;
}

function SortableGroupRow({
  group,
  isFirst,
  isLast,
  canReorder,
  isSortingDisabled,
  onOpen,
  onMove,
}: SortableGroupRowProps) {
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

  return (
    <MenuListItem
      ref={setNodeRef}
      style={style}
      className={`border-b border-solid-gray-200 ${isDragging ? 'z-50 bg-white' : ''}`}
    >
      <div className="flex w-full items-center gap-3 px-2 py-3 md:px-4">
        {canReorder && (
          <span
            {...attributes}
            {...listeners}
            onClick={(event) => event.stopPropagation()}
            className={`shrink-0 text-solid-gray-420 ${isSortingDisabled ? 'cursor-wait opacity-50' : 'cursor-grab active:cursor-grabbing'}`}
            aria-label={t('videos.groups.dragHandle')}
          >
            <GripVertical className="h-5 w-5" />
          </span>
        )}

        <button
          type="button"
          onClick={() => onOpen(group.id)}
          className="min-w-0 flex-1 text-left focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-black focus-visible:bg-yellow-300"
        >
          <span className="block truncate text-std-16B-170 text-solid-gray-800 hover:underline">
            {group.name}
          </span>
          <span className="mt-1 block line-clamp-1 text-std-16N-170 text-solid-gray-600">
            {group.description || t('common.messages.noDescription')}
          </span>
        </button>

        <ChipLabel variant="filled-1" color="blue" className="min-h-0 shrink-0 text-oln-14N-100">
          {t('videos.groups.videoCount', { count: group.video_count })}
        </ChipLabel>

        <div className="flex shrink-0 items-center gap-1">
          {canReorder && (
            <>
              <Button
                type="button"
                variant="outline"
                size="xs"
                onClick={(event) => {
                  event.stopPropagation();
                  onMove(group.id, 'up');
                }}
                disabled={isFirst || isSortingDisabled}
                aria-label={t('videos.groups.moveUp', { name: group.name })}
                className="min-w-0 w-8 px-0"
              >
                <ArrowUp className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="xs"
                onClick={(event) => {
                  event.stopPropagation();
                  onMove(group.id, 'down');
                }}
                disabled={isLast || isSortingDisabled}
                aria-label={t('videos.groups.moveDown', { name: group.name })}
                className="min-w-0 w-8 px-0"
              >
                <ArrowDown className="h-4 w-4" />
              </Button>
            </>
          )}
          <Button
            type="button"
            variant="solid"
            size="xs"
            onClick={() => onOpen(group.id)}
            aria-label={t('videos.groups.open', { name: group.name })}
            className="min-w-0 w-8 px-0"
          >
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </MenuListItem>
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
          <Button
            type="button"
            variant="solid"
            size="md"
            onClick={() => setIsModalOpen(true)}
            className="shrink-0"
          >
            <Plus className="w-4 h-4 mr-2" />
            {t('videos.groups.create')}
          </Button>
        )}
      />

      <div className="w-full">
        {(loadError || reorderError) && (
          <div className="mb-6">
            <ErrorMessage message={loadError || reorderError} />
          </div>
        )}

        {authLoading || isLoading ? (
          <div className="flex justify-center py-24">
            <LoadingSpinner />
          </div>
        ) : groups.length === 0 ? (
          <div className="flex flex-col items-start justify-center border-t border-solid-gray-420 py-12">
            <Heading size="20" hasChip className="mb-2">
              <HeadingTitle level="h2">{t('videos.groups.empty')}</HeadingTitle>
            </Heading>
            <p className="mb-8 max-w-lg text-std-16N-170 text-solid-gray-600">
              {t('videos.groups.emptyDescription')}
            </p>
            <Button
              type="button"
              variant="solid"
              size="md"
              onClick={() => setIsModalOpen(true)}
            >
              <Plus className="w-4 h-4 mr-2" />
              {t('videos.groups.create')}
            </Button>
          </div>
        ) : (
          <>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext
                items={visibleGroups.map((group) => group.id)}
                strategy={verticalListSortingStrategy}
              >
                <MenuList className="border-t border-solid-gray-420">
                  {visibleGroups.map((group, index) => (
                    <SortableGroupRow
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
                </MenuList>
              </SortableContext>
            </DndContext>

            <div ref={sentinelRef} data-testid="groups-infinite-scroll-sentinel" />

            {isFetchingNextPage && (
              <div className="flex justify-center mt-4">
                <span className="text-std-16N-170 text-solid-gray-600">{t('videos.groups.loadingMore')}</span>
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
