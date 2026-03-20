import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useI18nNavigate } from '@/lib/i18n';
import { AppPageShell } from '@/components/layout/AppPageShell';
import { AppPageHeader } from '@/components/layout/AppPageHeader';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { InlineSpinner } from '@/components/common/InlineSpinner';
import { useAuth } from '@/hooks/useAuth';
import { useVideoGroups } from '@/hooks/useVideoGroups';
import { useCreateVideoGroupMutation } from '@/hooks/useVideoGroupsPageData';
import { handleAsyncError } from '@/lib/utils/errorHandling';
import { Plus, ArrowRight, FolderOpen, X, Check } from 'lucide-react';

// カードの上部アクセントカラー（グループごとに循環）
const ACCENT_COLORS = [
  'from-[#00652c] to-[#15803d]',
  'from-[#006d30] to-[#059669]',
  'from-[#065f46] to-[#047857]',
  'from-[#15803d] to-[#16a34a]',
  'from-[#166534] to-[#15803d]',
  'from-[#14532d] to-[#166534]',
];

export default function VideoGroupsPage() {
  const { user, isLoading: authLoading } = useAuth();
  const navigate = useI18nNavigate();
  const { groups, isLoading, error: loadError } = useVideoGroups(true);
  const [formError, setFormError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDescription, setNewGroupDescription] = useState('');
  const { t } = useTranslation();

  const createGroupMutation = useCreateVideoGroupMutation({
    userId: user?.id,
    onSuccess: () => {
      setNewGroupName('');
      setNewGroupDescription('');
      setIsCreating(false);
    },
  });

  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) {
      setFormError(t('validation.required'));
      return;
    }
    setFormError(null);
    try {
      await createGroupMutation.mutateAsync({
        name: newGroupName,
        description: newGroupDescription,
      });
    } catch (err) {
      handleAsyncError(err, t('videos.groups.createError'), (msg) => setFormError(msg));
    }
  };

  const handleCancel = () => {
    setIsCreating(false);
    setNewGroupName('');
    setNewGroupDescription('');
    setFormError(null);
  };

  return (
    <AppPageShell activePage="groups">
      <AppPageHeader
        title={t('videos.groups.title')}
        description={t('videos.groups.subtitle')}
        action={!isCreating ? (
          <button
            onClick={() => setIsCreating(true)}
            className="shrink-0 flex items-center gap-2 px-5 py-2.5 bg-[#00652c] text-white text-sm font-bold rounded-xl hover:opacity-90 shadow-sm transition-all active:scale-95"
          >
            <Plus className="w-4 h-4" />
            {t('videos.groups.create')}
          </button>
        ) : undefined}
      />

      <div className="w-full">
        {/* ── Inline Create Form ───────────────────────────────────────── */}
        {isCreating && (
          <div className="bg-white rounded-xl shadow-[0_4px_20px_rgba(28,25,23,0.04)] p-5 mb-8 border border-[#e1e3de]/40">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-extrabold text-[#191c19] text-lg">{t('videos.groups.createTitle')}</h2>
              <button
                onClick={handleCancel}
                className="p-1.5 text-stone-400 hover:text-stone-600 hover:bg-stone-100 rounded-full transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {formError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">
                {formError}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[#3f493f] uppercase tracking-wider">
                  {t('videos.groups.nameLabel')}
                </label>
                <input
                  type="text"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  placeholder={t('videos.groups.namePlaceholder')}
                  disabled={createGroupMutation.isPending}
                  autoFocus
                  className="w-full px-4 py-3 bg-[#f2f4ef] border border-transparent rounded-xl text-sm text-[#191c19] placeholder:text-stone-400 focus:outline-none focus:border-[#00652c] focus:bg-white transition-all"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[#3f493f] uppercase tracking-wider">
                  {t('videos.groups.descriptionLabel')}
                  <span className="ml-1 normal-case font-normal text-stone-400">{t('videos.groups.optional')}</span>
                </label>
                <input
                  type="text"
                  value={newGroupDescription}
                  onChange={(e) => setNewGroupDescription(e.target.value)}
                  placeholder={t('videos.groups.descriptionPlaceholder')}
                  disabled={createGroupMutation.isPending}
                  className="w-full px-4 py-3 bg-[#f2f4ef] border border-transparent rounded-xl text-sm text-[#191c19] placeholder:text-stone-400 focus:outline-none focus:border-[#00652c] focus:bg-white transition-all"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-5">
              <button
                onClick={handleCancel}
                disabled={createGroupMutation.isPending}
                className="px-5 py-2.5 text-sm font-bold text-[#3f493f] hover:bg-stone-100 rounded-xl transition-colors disabled:opacity-50"
              >
                {t('common.actions.cancel')}
              </button>
              <button
                onClick={handleCreateGroup}
                disabled={createGroupMutation.isPending || !newGroupName.trim()}
                className="flex items-center gap-2 px-5 py-2.5 bg-[#00652c] text-white text-sm font-bold rounded-xl hover:bg-[#005323] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {createGroupMutation.isPending ? (
                  <><InlineSpinner className="w-4 h-4" />{t('common.actions.creating')}</>
                ) : (
                  <><Check className="w-4 h-4" />{t('common.actions.create')}</>
                )}
              </button>
            </div>
          </div>
        )}

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
            {!isCreating && (
              <button
                onClick={() => setIsCreating(true)}
                className="flex items-center gap-2 px-5 py-2.5 bg-[#00652c] text-white text-sm font-bold rounded-xl hover:opacity-90 shadow-sm transition-all active:scale-95"
              >
                <Plus className="w-4 h-4" />
                {t('videos.groups.create')}
              </button>
            )}
          </div>

        ) : (
          /* ── Groups Grid ────────────────────────────────────────────── */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {groups.map((group, i) => (
              <button
                key={group.id}
                onClick={() => navigate(`/videos/groups/${group.id}`)}
                className="group text-left bg-white rounded-2xl shadow-[0_4px_20px_rgba(28,25,23,0.04)] hover:shadow-[0_8px_30px_rgba(28,25,23,0.10)] transition-all duration-200 hover:-translate-y-0.5 overflow-hidden"
              >
                {/* Accent bar */}
                <div className={`h-1.5 w-full bg-gradient-to-r ${ACCENT_COLORS[i % ACCENT_COLORS.length]}`} />

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
    </AppPageShell>
  );
}
