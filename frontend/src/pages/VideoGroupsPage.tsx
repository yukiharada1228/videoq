import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useI18nNavigate } from '@/lib/i18n';
import { AppPageShell } from '@/components/layout/AppPageShell';
import { AppPageHeader } from '@/components/layout/AppPageHeader';
import { SeoHead } from '@/components/seo/SeoHead';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { useAuth } from '@/hooks/useAuth';
import { useVideoGroups } from '@/hooks/useVideoGroups';
import { useCreateVideoGroupMutation } from '@/hooks/useVideoGroupsPageData';
import { VideoGroupCreateModal } from '@/components/video/VideoGroupCreateModal';
import { Plus, ArrowRight, FolderOpen } from 'lucide-react';


export default function VideoGroupsPage() {
  const { user, isLoading: authLoading } = useAuth();
  const navigate = useI18nNavigate();
  const { groups, isLoading, error: loadError } = useVideoGroups(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { t } = useTranslation();

  const createGroupMutation = useCreateVideoGroupMutation({ userId: user?.id });

  const handleCreate = async (name: string, description: string) => {
    await createGroupMutation.mutateAsync({ name, description });
  };

  return (
    <AppPageShell activePage="groups">
      <SeoHead
        title={t('seo.app.groups.title')}
        description={t('seo.app.groups.description')}
        path="/videos/groups"
      />
      <AppPageHeader
        title={t('videos.groups.title')}
        description={t('videos.groups.subtitle')}
        action={
          <button
            onClick={() => setIsModalOpen(true)}
            className="shrink-0 flex items-center gap-2 px-5 py-2.5 bg-[#00652c] text-white text-sm font-bold rounded-xl hover:opacity-90 shadow-sm transition-all active:scale-95"
          >
            <Plus className="w-4 h-4" />
            {t('videos.groups.create')}
          </button>
        }
      />

      <div className="w-full">
        {/* ── Error ───────────────────────────────────────────────────── */}
        {loadError && (
          <div className="mb-6 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
            {loadError}
          </div>
        )}

        {/* ── Loading ──────────────────────────────────────────────────── */}
        {authLoading || isLoading ? (
          <div className="flex justify-center py-24">
            <LoadingSpinner />
          </div>

        ) : groups.length === 0 ? (
          /* ── Empty State ──────────────────────────────────────────── */
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
              onClick={() => setIsModalOpen(true)}
              className="flex items-center gap-2 px-5 py-2.5 bg-[#00652c] text-white text-sm font-bold rounded-xl hover:opacity-90 shadow-sm transition-all active:scale-95"
            >
              <Plus className="w-4 h-4" />
              {t('videos.groups.create')}
            </button>
          </div>

        ) : (
          /* ── Groups Grid ────────────────────────────────────────────── */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {groups.map((group) => (
              <button
                key={group.id}
                onClick={() => navigate(`/videos/groups/${group.id}`)}
                className="group text-left bg-white rounded-2xl shadow-[0_4px_20px_rgba(28,25,23,0.04)] hover:shadow-[0_8px_30px_rgba(28,25,23,0.10)] transition-all duration-200 hover:-translate-y-0.5 overflow-hidden"
              >
                <div className="p-5">
                  <h2 className="font-extrabold text-[#191c19] text-base leading-snug mb-2 group-hover:text-[#00652c] transition-colors">
                    {group.name}
                  </h2>
                  <p className="text-sm text-[#6f7a6e] leading-relaxed line-clamp-2 mb-4 min-h-[2.5rem]">
                    {group.description || t('common.messages.noDescription')}
                  </p>
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center px-2.5 py-1 bg-[#f0fdf4] text-[#00652c] text-xs font-bold rounded-full">
                      {t('videos.groups.videoCount', { count: group.video_count })}
                    </span>
                    <span className="w-8 h-8 rounded-full flex items-center justify-center bg-[#f0fdf4] text-[#00652c] opacity-0 group-hover:opacity-100 transition-opacity">
                      <ArrowRight className="w-4 h-4" />
                    </span>
                  </div>
                </div>
              </button>
            ))}
          </div>
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
