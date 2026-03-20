import { useMemo, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useVideos } from '@/hooks/useVideos';
import { useVideoStats } from '@/hooks/useVideoStats';
import { VideoUploadModal } from '@/components/video/VideoUploadModal';
import { VideoCard } from '@/components/video/VideoCard';
import { TagManagementModal } from '@/components/video/TagManagementModal';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { useAuth } from '@/hooks/useAuth';
import { useI18nNavigate } from '@/lib/i18n';
import { useTags } from '@/hooks/useTags';
import { AppPageShell } from '@/components/layout/AppPageShell';
import { AppPageHeader } from '@/components/layout/AppPageHeader';
import { Plus, Search, Tag } from 'lucide-react';

type StatusFilter = 'all' | 'completed' | 'processing' | 'error';
type SortOrder = 'uploaded_at_desc' | 'uploaded_at_asc' | 'title_asc';

export default function VideosPage() {
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState<SortOrder>('uploaded_at_desc');

  const { videos, isLoading, error, refetch: refetchVideos } = useVideos(selectedTagIds);
  const stats = useVideoStats(videos);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isTagManagementOpen, setIsTagManagementOpen] = useState(false);
  const [searchParams] = useSearchParams();
  const navigate = useI18nNavigate();
  const { t } = useTranslation();
  const { user, isLoading: userLoading, refetch: refetchUser } = useAuth();
  const { tags } = useTags();

  const shouldOpenModalFromQuery = useMemo(
    () => searchParams?.get('upload') === 'true',
    [searchParams],
  );

  const handleTagToggle = useCallback((tagId: number) => {
    setSelectedTagIds((prev) =>
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId],
    );
  }, []);

  const handleUploadSuccess = useCallback(() => {
    void refetchVideos();
    void refetchUser();
  }, [refetchVideos, refetchUser]);

  const handleCloseModal = () => {
    setIsUploadModalOpen(false);
    if (shouldOpenModalFromQuery) {
      navigate('/videos', { replace: true });
    }
  };

  const isUploadDisabled = useMemo(() => {
    if (!user || userLoading) return true;
    if (user.video_limit === null) return false;
    return user.video_count >= user.video_limit;
  }, [user, userLoading]);

  const filteredAndSortedVideos = useMemo(() => {
    let result = [...videos];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((v) => v.title.toLowerCase().includes(q));
    }

    if (statusFilter === 'completed') {
      result = result.filter((v) => v.status === 'completed');
    } else if (statusFilter === 'processing') {
      result = result.filter((v) =>
        ['pending', 'processing', 'indexing', 'uploading'].includes(v.status),
      );
    } else if (statusFilter === 'error') {
      result = result.filter((v) => v.status === 'error');
    }

    if (sortOrder === 'uploaded_at_desc') {
      result.sort((a, b) => new Date(b.uploaded_at).getTime() - new Date(a.uploaded_at).getTime());
    } else if (sortOrder === 'uploaded_at_asc') {
      result.sort((a, b) => new Date(a.uploaded_at).getTime() - new Date(b.uploaded_at).getTime());
    } else if (sortOrder === 'title_asc') {
      result.sort((a, b) => a.title.localeCompare(b.title, 'ja'));
    }

    return result;
  }, [videos, searchQuery, statusFilter, sortOrder]);

  return (
    <AppPageShell activePage="videos">
      <AppPageHeader
        title={t('videos.list.title')}
        description={t('videos.list.managingCount', { count: stats.total })}
        action={(
          <button
            onClick={() => setIsUploadModalOpen(true)}
            disabled={isUploadDisabled}
            className="flex items-center gap-2 bg-[#00652c] hover:opacity-90 text-white px-5 py-2.5 rounded-xl text-sm font-bold transition-all shadow-sm active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
          >
            <Plus className="w-5 h-5" />
            <span>{t('videos.list.uploadButton')}</span>
          </button>
        )}
      />

        {/* Stats Row */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-px bg-[#becabc]/20 rounded-xl overflow-hidden mb-8 shadow-[0_12px_32px_-4px_rgba(25,28,25,0.04)] border border-[#e1e3de]/50">
          {[
            { label: t('videos.list.statsRow.all'), value: stats.total, color: 'text-[#191c19]', labelColor: 'text-[#3f493f]' },
            { label: t('videos.list.statsRow.completed'), value: stats.completed, color: 'text-[#00652c]', labelColor: 'text-[#00652c]' },
            { label: t('videos.list.statsRow.pending'), value: stats.pending, color: 'text-[#3f493f]', labelColor: 'text-[#3f493f]' },
            { label: t('videos.list.statsRow.processing'), value: stats.processing, color: 'text-[#904d00]', labelColor: 'text-[#904d00]' },
            { label: t('videos.list.statsRow.indexing'), value: stats.indexing, color: 'text-[#15803d]', labelColor: 'text-[#15803d]' },
          ].map(({ label, value, color, labelColor }) => (
            <div key={label} className="bg-white p-4 flex flex-col items-center">
              <span className={`text-xs font-bold ${labelColor} tracking-widest uppercase`}>{label}</span>
              <span className={`text-xl font-bold ${color}`}>{value}</span>
            </div>
          ))}
        </div>

        {/* Filter & Search Bar */}
        <section className="bg-white rounded-xl p-5 mb-8 shadow-[0_4px_20px_rgba(28,25,23,0.04)] border border-[#e1e3de]/30">
          <div className="flex flex-col lg:flex-row gap-6">
            <div className="relative flex-grow">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-[#3f493f] w-4 h-4" />
              <input
                className="w-full pl-12 pr-4 py-3 bg-[#f2f4ef] border border-[#e1e3de] rounded-xl focus:ring-2 focus:ring-[#00652c]/20 focus:border-[#00652c] outline-none transition-all placeholder:text-[#3f493f]/60 text-sm"
                placeholder={t('videos.list.searchPlaceholder')}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-sm font-medium text-[#3f493f]">{t('videos.list.sortLabel')}</span>
              <select
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value as SortOrder)}
                className="bg-[#f2f4ef] border border-[#e1e3de] px-4 py-3 rounded-xl text-sm font-medium hover:bg-[#e7e9e4] transition-colors outline-none cursor-pointer"
              >
                <option value="uploaded_at_desc">{t('videos.list.sort.uploadedDesc')}</option>
                <option value="uploaded_at_asc">{t('videos.list.sort.uploadedAsc')}</option>
                <option value="title_asc">{t('videos.list.sort.titleAsc')}</option>
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4 mt-6 pt-6 border-t border-[#e1e3de]/30">
            <div className="flex flex-wrap items-center gap-2">
              {(
                [
                  { key: 'all', label: t('videos.list.filter.all') },
                  { key: 'completed', label: t('videos.list.filter.completed') },
                  { key: 'processing', label: t('videos.list.filter.processing') },
                  { key: 'error', label: t('videos.list.filter.error') },
                ] as { key: StatusFilter; label: string }[]
              ).map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setStatusFilter(key)}
                  className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-colors ${
                    statusFilter === key
                      ? 'bg-[#00652c] text-white'
                      : 'bg-[#f2f4ef] text-[#3f493f] hover:bg-[#e7e9e4]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {tags.length > 0 && (
              <>
                <div className="w-px h-6 bg-[#e1e3de] mx-2" />
                <div className="flex flex-wrap items-center gap-2">
                  {tags.map((tag) => {
                    const isSelected = selectedTagIds.includes(tag.id);
                    return (
                      <button
                        key={tag.id}
                        onClick={() => handleTagToggle(tag.id)}
                        className="px-4 py-1.5 rounded-full border text-sm font-medium hover:bg-[#f2f4ef] transition-colors"
                        style={{
                          backgroundColor: isSelected ? `${tag.color}30` : undefined,
                          color: isSelected ? tag.color : '#3f493f',
                          borderColor: isSelected ? tag.color : '#e1e3de',
                        }}
                      >
                        {tag.name}
                        {tag.video_count !== undefined && (
                          <span className="ml-1 opacity-60">({tag.video_count})</span>
                        )}
                      </button>
                    );
                  })}
                  <button
                    onClick={() => setIsTagManagementOpen(true)}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-xl border border-dashed border-[#6f7a6e] text-[#3f493f] text-xs font-bold uppercase tracking-wider hover:bg-[#f2f4ef] transition-colors ml-2"
                  >
                    <Tag className="w-3.5 h-3.5" />
                    {t('videos.list.manageTags')}
                  </button>
                </div>
              </>
            )}
          </div>
        </section>

        {/* Video Grid */}
        {isLoading ? (
          <div className="flex justify-center py-24">
            <LoadingSpinner />
          </div>
        ) : error ? (
          <div className="text-center py-24 text-red-500">{error}</div>
        ) : filteredAndSortedVideos.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-[#3f493f]">
            <div className="w-24 h-24 bg-[#f2f4ef] rounded-full flex items-center justify-center mb-4">
              <Search className="w-12 h-12 text-[#becabc]" />
            </div>
            <p className="text-base font-medium">{t('videos.list.noVideos')}</p>
            <p className="text-sm mt-1 text-[#6f7a6e]">{t('videos.list.noVideosHint')}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredAndSortedVideos.map((video) => (
              <VideoCard key={video.id} video={video} />
            ))}
          </div>
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
