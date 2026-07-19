import { useMemo, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useVideos, type VideosOrdering } from '@/hooks/useVideos';
import { useVideoStats } from '@/hooks/useVideoStats';
import { VideoUploadModal } from '@/components/video/VideoUploadModal';
import { VideoCard } from '@/components/video/VideoCard';
import { TagManagementModal } from '@/components/video/TagManagementModal';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { ErrorMessage } from '@/components/auth/ErrorMessage';
import { useAuth } from '@/hooks/useAuth';
import { useTags } from '@/hooks/useTags';
import { AppPageShell } from '@/components/layout/AppPageShell';
import { AppPageHeader } from '@/components/layout/AppPageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Divider } from '@/components/ui/divider';
import { ChipLabel } from '@/components/ui/chip-label';
import { MenuList, MenuListItem } from '@/components/ui/menu-list';
import { resolveTagChipColor } from '@/lib/tagColors';
import { cn } from '@/lib/utils';
import { Plus, Search, Tag } from 'lucide-react';

const STATUS_FILTERS = ['all', 'completed', 'processing', 'error'] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

type SortOrder = Extract<VideosOrdering, 'uploaded_at_desc' | 'uploaded_at_asc' | 'title_asc'>;
const SORT_ORDERS: SortOrder[] = ['uploaded_at_desc', 'uploaded_at_asc', 'title_asc'];
const IN_PROGRESS_STATUSES = ['pending', 'processing', 'indexing', 'uploading'];

function parseStatusFilter(value: string | null): StatusFilter {
  return STATUS_FILTERS.includes(value as StatusFilter) ? (value as StatusFilter) : 'all';
}

function parseSortOrder(value: string | null): SortOrder {
  return SORT_ORDERS.includes(value as SortOrder) ? (value as SortOrder) : 'uploaded_at_desc';
}

function parseTagIds(value: string | null): number[] {
  if (!value) return [];
  const ids = value
    .split(',')
    .map((raw) => Number(raw))
    .filter((id) => Number.isInteger(id) && id > 0);
  return Array.from(new Set(ids)).sort((a, b) => a - b);
}

function toApiStatusFilter(statusFilter: StatusFilter): string | undefined {
  if (statusFilter === 'all') return undefined;
  if (statusFilter === 'processing') return IN_PROGRESS_STATUSES.join(',');
  return statusFilter;
}

export default function VideosPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedTagIds = useMemo(
    () => parseTagIds(searchParams.get('tags')),
    [searchParams],
  );
  const statusFilter = useMemo(
    () => parseStatusFilter(searchParams.get('status')),
    [searchParams],
  );
  const searchQuery = searchParams.get('q') ?? '';
  const sortOrder = useMemo(
    () => parseSortOrder(searchParams.get('ordering')),
    [searchParams],
  );
  const apiStatusFilter = useMemo(() => toApiStatusFilter(statusFilter), [statusFilter]);

  const updateSearchParams = useCallback(
    (updates: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams);
      Object.entries(updates).forEach(([key, value]) => {
        if (value === null || value === '') {
          next.delete(key);
          return;
        }
        next.set(key, value);
      });
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  const {
    videos,
    isLoading,
    error,
    isFetchingNextPage,
    totalCount,
    sentinelRef,
    refetch: refetchVideos,
  } = useVideos({
    tagIds: selectedTagIds,
    q: searchQuery,
    status: apiStatusFilter,
    ordering: sortOrder,
  });

  const stats = useVideoStats(videos);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isTagManagementOpen, setIsTagManagementOpen] = useState(false);
  const { t } = useTranslation();
  const { user, isLoading: userLoading, refetch: refetchUser } = useAuth();
  const { tags } = useTags();

  const shouldOpenModalFromQuery = useMemo(
    () => searchParams?.get('upload') === 'true',
    [searchParams],
  );

  const handleTagToggle = useCallback((tagId: number) => {
    const nextTagIds = selectedTagIds.includes(tagId)
      ? selectedTagIds.filter((id) => id !== tagId)
      : [...selectedTagIds, tagId].sort((a, b) => a - b);
    updateSearchParams({
      tags: nextTagIds.length > 0 ? nextTagIds.join(',') : null,
    });
  }, [selectedTagIds, updateSearchParams]);

  const handleUploadSuccess = useCallback(() => {
    void refetchVideos();
    void refetchUser();
  }, [refetchVideos, refetchUser]);

  const handleCloseModal = () => {
    setIsUploadModalOpen(false);
    if (shouldOpenModalFromQuery) {
      updateSearchParams({ upload: null });
    }
  };

  const isUploadDisabled = useMemo(() => !user || userLoading, [user, userLoading]);

  const statsItems = [
    { label: t('videos.list.statsRow.all'), value: stats.total },
    { label: t('videos.list.statsRow.completed'), value: stats.completed },
    { label: t('videos.list.statsRow.pending'), value: stats.pending },
    { label: t('videos.list.statsRow.processing'), value: stats.processing },
    { label: t('videos.list.statsRow.indexing'), value: stats.indexing },
  ];

  return (
    <AppPageShell activePage="videos">
      <AppPageHeader
        title={t('videos.list.title')}
        description={t('videos.list.managingCount', { count: totalCount })}
        action={(
          <Button
            variant="solid"
            size="md"
            onClick={() => setIsUploadModalOpen(true)}
            disabled={isUploadDisabled}
            className="shrink-0"
          >
            <Plus className="w-5 h-5 mr-2" />
            {t('videos.list.uploadButton')}
          </Button>
        )}
      />

      <dl className="mb-10 grid grid-cols-1 border-t border-solid-gray-420 sm:grid-cols-2 lg:grid-cols-5">
        {statsItems.map(({ label, value }) => (
          <div
            key={label}
            className="flex items-baseline justify-between gap-4 border-b border-solid-gray-200 py-4 sm:pr-6"
          >
            <dt className="text-std-16N-170 text-solid-gray-700">{label}</dt>
            <dd className="text-std-20B-150 text-solid-gray-800">{value}</dd>
          </div>
        ))}
      </dl>

      <section className="mb-10 border-t border-solid-gray-420 pt-6">
        <div className="flex flex-col lg:flex-row gap-6">
          <div className="relative flex-grow">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-solid-gray-600 w-4 h-4 z-10" />
            <Input
              className="pl-12"
              blockSize="md"
              placeholder={t('videos.list.searchPlaceholder')}
              type="search"
              value={searchQuery}
              onChange={(e) => updateSearchParams({ q: e.target.value })}
            />
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Label htmlFor="videos-sort" size="sm" className="whitespace-nowrap">
              {t('videos.list.sortLabel')}
            </Label>
            <Select
              value={sortOrder}
              onValueChange={(value) => {
                const nextOrdering = value as SortOrder;
                updateSearchParams({
                  ordering: nextOrdering === 'uploaded_at_desc' ? null : nextOrdering,
                });
              }}
            >
              <SelectTrigger id="videos-sort" blockSize="md" className="min-w-[12rem]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="uploaded_at_desc">{t('videos.list.sort.uploadedDesc')}</SelectItem>
                <SelectItem value="uploaded_at_asc">{t('videos.list.sort.uploadedAsc')}</SelectItem>
                <SelectItem value="title_asc">{t('videos.list.sort.titleAsc')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <Divider className="my-6" />

        <div className="flex flex-wrap items-center gap-4">
          <div className="flex flex-wrap items-center gap-2">
            {(
              [
                { key: 'all', label: t('videos.list.filter.all') },
                { key: 'completed', label: t('videos.list.filter.completed') },
                { key: 'processing', label: t('videos.list.filter.processing') },
                { key: 'error', label: t('videos.list.filter.error') },
              ] as { key: StatusFilter; label: string }[]
            ).map(({ key, label }) => (
              <Button
                key={key}
                type="button"
                size="sm"
                variant={statusFilter === key ? 'solid' : 'outline'}
                onClick={() => updateSearchParams({ status: key === 'all' ? null : key })}
              >
                {label}
              </Button>
            ))}
          </div>

          {tags.length > 0 && (
            <>
              <div className="w-px h-6 bg-solid-gray-300 mx-2" />
              <div className="flex flex-wrap items-center gap-2">
                {tags.map((tag) => {
                  const isSelected = selectedTagIds.includes(tag.id);
                  return (
                    <button
                      key={tag.id}
                      type="button"
                      onClick={() => handleTagToggle(tag.id)}
                      className={cn(
                        'rounded-8 transition-opacity focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-black focus-visible:ring-2 focus-visible:ring-yellow-300',
                        isSelected ? 'opacity-100' : 'opacity-60 hover:opacity-100',
                      )}
                      aria-pressed={isSelected}
                    >
                      <ChipLabel
                        variant={isSelected ? 'filled-1' : 'outlined'}
                        color={resolveTagChipColor(tag.color)}
                        className="min-h-0 text-oln-14N-100"
                      >
                        {tag.name}
                        {tag.video_count !== undefined && (
                          <span className="ml-1 opacity-70">({tag.video_count})</span>
                        )}
                      </ChipLabel>
                    </button>
                  );
                })}
                <Button
                  type="button"
                  size="sm"
                  variant="text"
                  onClick={() => setIsTagManagementOpen(true)}
                  className="ml-2"
                >
                  <Tag className="w-3.5 h-3.5 mr-1" />
                  {t('videos.list.manageTags')}
                </Button>
              </div>
            </>
          )}
        </div>
      </section>

      {isLoading ? (
        <div className="flex justify-center py-24">
          <LoadingSpinner />
        </div>
      ) : error ? (
        <ErrorMessage message={error} />
      ) : (
        <>
          {videos.length === 0 ? (
            <div className="border-t border-solid-gray-420 py-12 text-solid-gray-700">
              <p className="text-std-16B-170">{t('videos.list.noVideos')}</p>
              <p className="mt-1 text-std-16N-170 text-solid-gray-600">{t('videos.list.noVideosHint')}</p>
            </div>
          ) : (
            <MenuList className="border-t border-solid-gray-420">
              {videos.map((video) => (
                <MenuListItem key={video.id} className="border-b border-solid-gray-200">
                  <VideoCard video={video} />
                </MenuListItem>
              ))}
            </MenuList>
          )}

          <div ref={sentinelRef} data-testid="infinite-scroll-sentinel" />

          {isFetchingNextPage && (
            <div className="flex justify-center mt-4">
              <span className="text-std-16N-170 text-solid-gray-600">{t('videos.list.loadingMore')}</span>
            </div>
          )}
        </>
      )}

      <VideoUploadModal
        isOpen={shouldOpenModalFromQuery || isUploadModalOpen}
        onClose={handleCloseModal}
        onUploadSuccess={handleUploadSuccess}
      />

      <TagManagementModal
        isOpen={isTagManagementOpen}
        onClose={() => setIsTagManagementOpen(false)}
      />
    </AppPageShell>
  );
}
