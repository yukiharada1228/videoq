import { useMemo } from 'react';
import type { ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useI18nNavigate } from '@/lib/i18n';
import { useAuth } from '@/hooks/useAuth';
import { type User } from '@/lib/api';
import { useHomePageData } from '@/hooks/useHomePageData';
import { useVideoStats } from '@/hooks/useVideoStats';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { VideoCard } from '@/components/video/VideoCard';
import { queryKeys } from '@/lib/queryKeys';
import { AppPageShell } from '@/components/layout/AppPageShell';
import { AppPageHeader } from '@/components/layout/AppPageHeader';
import { useTranslation } from 'react-i18next';
import {
  Upload, Video, CheckCircle, Clock,
  Folder, Film, Users, ArrowRight, Lightbulb,
} from 'lucide-react';



function StatCard({ icon, iconBg, borderColor, label, value }: {
  icon: ReactNode;
  iconBg: string;
  borderColor: string;
  label: string;
  value: string;
}) {
  return (
    <div className={`bg-white p-5 rounded-xl border-l-4 ${borderColor} shadow-[0_4px_20px_rgba(28,25,23,0.04)] flex items-center gap-3`}>
      <div className={`w-10 h-10 ${iconBg} rounded-full flex items-center justify-center shrink-0`}>
        {icon}
      </div>
      <div>
        <p className="text-sm font-semibold text-[#3f493f]">{label}</p>
        <p className="text-xl font-extrabold text-[#1c1c19]">{value}</p>
      </div>
    </div>
  );
}

function ActionCard({ icon, iconBg, borderHoverColor, title, description, linkLabel, linkColor, onClick }: {
  icon: ReactNode;
  iconBg: string;
  borderHoverColor: string;
  title: string;
  description: string;
  linkLabel: string;
  linkColor: string;
  onClick: () => void;
}) {
  return (
    <div
      className={`group bg-white p-5 rounded-xl shadow-[0_4px_20px_rgba(28,25,23,0.04)] border-t-4 border-transparent ${borderHoverColor} transition-all cursor-pointer`}
      onClick={onClick}
    >
      <div className={`w-12 h-12 ${iconBg} rounded-xl flex items-center justify-center mb-4`}>
        {icon}
      </div>
      <h3 className="text-base font-bold mb-2">{title}</h3>
      <p className="text-[#3f493f] text-sm mb-4 leading-relaxed">{description}</p>
      <div className={`flex items-center ${linkColor} font-bold text-sm`}>
        {linkLabel} <ArrowRight className="ml-1 w-4 h-4" />
      </div>
    </div>
  );
}

export default function HomePage() {
  const navigate = useI18nNavigate();
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const { user, isLoading } = useAuth();
  const cachedUser = queryClient.getQueryData<User | null>(queryKeys.auth.me) ?? null;
  const currentUser = user ?? cachedUser;

  const { videos, groups, isLoading: isLoadingData } = useHomePageData({ userId: user?.id });
  const videoStats = useVideoStats(videos);

  const recentVideos = useMemo(
    () =>
      [...videos]
        .sort((a, b) => new Date(b.uploaded_at).getTime() - new Date(a.uploaded_at).getTime())
        .slice(0, 3),
    [videos],
  );

  const processingCount = videoStats.pending + videoStats.processing + videoStats.indexing;

  if (isLoading || !user || isLoadingData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f8faf5]">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <AppPageShell activePage="home">
      <AppPageHeader
        title={t('home.welcome.greeting', { username: currentUser?.username })}
        description={t('home.welcome.dailyMotivation')}
        action={(
          <button
            onClick={() => navigate('/videos?upload=true')}
            className="flex items-center gap-2 px-5 py-2.5 bg-[#00652c] text-white text-sm font-bold rounded-xl hover:opacity-90 transition-all active:scale-95 shadow-sm shrink-0"
          >
            <Upload className="w-4 h-4" />
            {t('home.actions.upload.title')}
          </button>
        )}
      />

        {/* Stats Grid */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
          <StatCard
            icon={<Video className="text-[#005b8c] w-5 h-5" />}
            iconBg="bg-[#cce5ff]"
            borderColor="border-[#005b8c]"
            label={t('home.stats.totalVideos')}
            value={t('home.stats.videoCount', { count: videoStats.total })}
          />
          <StatCard
            icon={<CheckCircle className="text-[#00652c] w-5 h-5" style={{ fill: 'currentColor' } as React.CSSProperties} />}
            iconBg="bg-[#95f8a7]"
            borderColor="border-[#00652c]"
            label={t('home.stats.analysisCompleted')}
            value={t('home.stats.videoCount', { count: videoStats.completed })}
          />
          <StatCard
            icon={<Clock className="text-[#904d00] w-5 h-5" />}
            iconBg="bg-[#ffdcc3]"
            borderColor="border-[#904d00]"
            label={t('home.stats.processing')}
            value={t('home.stats.videoCount', { count: processingCount })}
          />
          <StatCard
            icon={<Folder className="text-[#00652c] w-5 h-5" />}
            iconBg="bg-[#95f8a7]"
            borderColor="border-[#00652c]"
            label={t('home.stats.groups')}
            value={t('home.stats.groupCount', { count: groups.length })}
          />
        </section>

        {/* Quick Actions Bento */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
          <ActionCard
            icon={<Upload className="text-[#00652c] w-7 h-7" />}
            iconBg="bg-[#95f8a7]/30"
            borderHoverColor="hover:border-[#00652c]"
            title={t('home.actions.upload.title')}
            description={t('home.actions.upload.descriptionLong')}
            linkLabel={t('home.actions.upload.linkLabel')}
            linkColor="text-[#00652c]"
            onClick={() => navigate('/videos?upload=true')}
          />
          <ActionCard
            icon={<Film className="text-[#005b8c] w-7 h-7" />}
            iconBg="bg-[#cce5ff]/30"
            borderHoverColor="hover:border-[#005b8c]"
            title={t('home.actions.library.title')}
            description={t('home.actions.library.descriptionLong', { count: videoStats.total })}
            linkLabel={t('home.actions.library.linkLabel')}
            linkColor="text-[#005b8c]"
            onClick={() => navigate('/videos')}
          />
          <ActionCard
            icon={<Users className="text-[#904d00] w-7 h-7" />}
            iconBg="bg-[#ffdcc3]/30"
            borderHoverColor="hover:border-[#904d00]"
            title={t('home.actions.groups.title')}
            description={t('home.actions.groups.descriptionLong', { count: groups.length })}
            linkLabel={t('home.actions.groups.linkLabel')}
            linkColor="text-[#904d00]"
            onClick={() => navigate('/videos/groups')}
          />
        </section>

        {/* Recent Videos */}
        {recentVideos.length > 0 && (
          <section className="mb-8">
            <div className="flex justify-between items-center mb-5">
              <h2 className="text-base font-bold text-[#191c19]">{t('home.recentVideos.title')}</h2>
              <Link href="/videos" className="text-[#00652c] text-sm font-bold flex items-center hover:underline">
                {t('home.recentVideos.viewAll')} <ArrowRight className="ml-1 w-3.5 h-3.5" />
              </Link>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {recentVideos.map((video) => (
                <VideoCard key={video.id} video={video} />
              ))}
            </div>
          </section>
        )}

        {/* Tips Card */}
        <section className="mt-8">
          <div className="bg-[#95f8a7]/20 border-2 border-[#00652c]/20 rounded-xl p-6 flex items-start gap-4 shadow-sm">
            <div className="bg-[#00652c] text-white p-2 rounded-full flex items-center justify-center shrink-0">
              <Lightbulb className="w-5 h-5" />
            </div>
            <p className="text-[#005323] font-medium text-sm leading-snug">
              <span className="font-bold">{t('home.tips.hint')}:</span> {t('home.tips.message')}
            </p>
          </div>
        </section>
    </AppPageShell>
  );
}
