import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { GraduationCap, Zap } from 'lucide-react';
import { Link } from '@/lib/i18n';
import { apiClient, type VideoInGroup } from '@/lib/api';
import { ShortsButton } from '@/components/shorts/ShortsButton';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { ChatPanel } from '@/components/chat/ChatPanel';
import { StatusBadge } from '@/components/common/StatusBadge';
import { convertVideoInGroupToSelectedVideo, type SelectedVideo } from '@/lib/utils/videoConversion';
import { useVideoPlayback } from '@/hooks/useVideoPlayback';
import { useMobileTab } from '@/hooks/useMobileTab';
import { useSharedGroupQuery } from '@/hooks/useSharePageData';
import { useI18nNavigate } from '@/lib/i18n';

type MobileTab = 'videos' | 'player' | 'chat';

interface MobileTabNavigationProps {
  mobileTab: MobileTab;
  onTabChange: (tab: MobileTab) => void;
  labels: Record<MobileTab, string>;
}

function MobileTabNavigation({ mobileTab, onTabChange, labels }: MobileTabNavigationProps) {
  const tabs: MobileTab[] = ['videos', 'player', 'chat'];
  return (
    <div className="lg:hidden flex border-b border-stone-200 bg-white rounded-t-xl">
      {tabs.map((tab) => (
        <button
          key={tab}
          onClick={() => onTabChange(tab)}
          className={`flex-1 px-4 py-3 text-sm font-bold transition-colors ${
            mobileTab === tab
              ? 'text-[#00652c] border-b-2 border-[#00652c]'
              : 'text-stone-500 hover:text-stone-700'
          }`}
        >
          {labels[tab]}
        </button>
      ))}
    </div>
  );
}

interface VideoItemProps {
  video: VideoInGroup;
  isSelected: boolean;
  onSelect: (videoId: number) => void;
}

function VideoItem({ video, isSelected, onSelect }: VideoItemProps) {
  const { t } = useTranslation();
  return (
    <div
      onClick={() => onSelect(video.id)}
      className={`border-l-4 rounded-xl p-3 cursor-pointer transition-all ${
        isSelected
          ? 'bg-[#f0fdf4] border-[#00652c]'
          : 'border-transparent hover:bg-[#f8faf5]'
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-1">
        <h3 className={`text-sm truncate ${isSelected ? 'font-bold text-[#191c19]' : 'font-semibold text-[#191c19]'}`}>
          {video.title}
        </h3>
        <StatusBadge status={video.status} size="xs" />
      </div>
      <p className="text-xs text-[#6f7a6e] line-clamp-2 leading-relaxed">
        {video.description || t('videos.shared.noDescription')}
      </p>
    </div>
  );
}

export default function SharePage() {
  const params = useParams<{ token: string }>();
  const shareToken = params?.token ?? '';
  const { t } = useTranslation();
  const navigate = useI18nNavigate();

  const [selectedVideoId, setSelectedVideoId] = useState<number | null>(null);

  const { mobileTab, setMobileTab } = useMobileTab();
  const groupQuery = useSharedGroupQuery(shareToken);
  const group = groupQuery.data ?? null;
  const error = groupQuery.error ? t('common.messages.shareLoadFailed') : null;
  const isLoading = groupQuery.isLoading || groupQuery.isFetching;

  const handleVideoSelect = useCallback((videoId: number) => {
    setSelectedVideoId(videoId);
  }, []);

  const selectedVideo = useMemo<SelectedVideo | null>(() => {
    if (!group?.videos?.length) return null;
    const selected = selectedVideoId
      ? group.videos.find((video) => video.id === selectedVideoId)
      : null;
    return convertVideoInGroupToSelectedVideo(selected ?? group.videos[0]);
  }, [group, selectedVideoId]);

  const { videoRef, handleVideoCanPlay, handleVideoPlayFromTime } = useVideoPlayback({
    selectedVideo,
    onVideoSelect: handleVideoSelect,
    onMobileSwitch: () => setMobileTab('player'),
  });

  useEffect(() => {
    if (groupQuery.error) {
      console.error(groupQuery.error);
    }
  }, [groupQuery.error]);

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="h-screen flex flex-col bg-[#f8faf5]">
        <nav className="fixed top-0 w-full z-50 bg-white/70 backdrop-blur-xl shadow-[0_12px_32px_rgba(28,28,25,0.06)] h-[64px] flex items-center px-8">
          <span className="text-xl font-bold text-[#00652c]">VideoQ</span>
        </nav>
        <div className="flex-1 flex items-center justify-center mt-[64px]">
          <LoadingSpinner />
        </div>
      </div>
    );
  }

  // ── Error ────────────────────────────────────────────────────────────────────
  if (error || !group) {
    return (
      <div className="h-screen flex flex-col bg-[#f8faf5]">
        <nav className="fixed top-0 w-full z-50 bg-white/70 backdrop-blur-xl shadow-[0_12px_32px_rgba(28,28,25,0.06)] h-[64px] flex items-center px-8">
          <span className="text-xl font-bold text-[#00652c]">VideoQ</span>
        </nav>
        <div className="flex-1 flex items-center justify-center mt-[64px] p-6">
          <div className="bg-white rounded-2xl shadow-[0_4px_20px_rgba(28,25,23,0.06)] p-12 max-w-md w-full text-center">
            <p className="text-sm text-red-600">{error || t('common.messages.shareNotFound')}</p>
            <button
              onClick={() => navigate('/')}
              className="mt-6 px-5 py-2.5 bg-[#00652c] text-white text-sm font-bold rounded-full hover:bg-[#005323] transition-colors"
            >
              {t('common.actions.backToHome')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Main ─────────────────────────────────────────────────────────────────────
  return (
    <div className="h-screen flex flex-col overflow-hidden bg-[#f8faf5]" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>

      {/* ── Nav ── */}
      <nav className="fixed top-0 w-full z-50 bg-white/70 backdrop-blur-xl shadow-[0_12px_32px_rgba(28,28,25,0.06)] h-[64px] flex justify-between items-center px-8">
        <Link href="/" className="flex items-center gap-2">
          <GraduationCap className="w-5 h-5 text-[#00652c]" />
          <span className="text-xl font-bold text-[#00652c]">VideoQ</span>
        </Link>
        <div />
        <span className="text-xs font-bold uppercase tracking-wider text-[#006d30] bg-[#d3ffd5] px-3 py-1.5 rounded-full">
          {t('videos.shared.publicBadge')}
        </span>
      </nav>

      {/* ── Main ── */}
      <main className="mt-[64px] flex-1 flex flex-col p-6 gap-4 h-[calc(100vh-64px)] overflow-hidden">

        {/* ── Page Header ── */}
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-4 shrink-0">
          <div className="space-y-1">
            <span className="inline-block bg-[#d3ffd5] text-[#006d30] text-[10px] font-bold rounded-full px-3 py-1 mb-1">
              {t('videos.shared.publicBadge')}
            </span>
            <h1 className="text-3xl font-extrabold text-[#191c19] tracking-tight">{group.name}</h1>
            <p className="text-sm text-[#6f7a6e] font-medium">
              {group.description || t('videos.shared.descriptionFallback')}
            </p>
          </div>
          {group.videos && group.videos.length > 0 && (
            <div className="shrink-0">
              <ShortsButton
                groupId={group.id}
                videos={group.videos}
                shareToken={shareToken}
                size="sm"
              />
            </div>
          )}
        </header>

        {/* ── Mobile Tabs ── */}
        <MobileTabNavigation
          mobileTab={mobileTab}
          onTabChange={setMobileTab}
          labels={{
            videos: t('videos.shared.tabs.videos'),
            player: t('videos.shared.tabs.player'),
            chat: t('videos.shared.tabs.chat'),
          }}
        />

        {/* ── 3-Column Grid ── */}
        <section className="flex-1 grid grid-cols-12 gap-6 overflow-hidden min-h-0">

          {/* Left: Video List */}
          <aside className={`col-span-12 lg:col-span-3 bg-white rounded-2xl shadow-[0_4px_20px_rgba(28,25,23,0.04)] flex flex-col overflow-hidden ${mobileTab === 'videos' ? 'flex' : 'hidden lg:flex'}`}>
            <div className="p-4 shrink-0 flex items-center justify-between border-b border-stone-100">
              <h2 className="font-extrabold text-[#191c19] flex items-center gap-2">
                {t('videos.shared.tabs.videos')}
                <span className="bg-[#f2f4ef] text-[#6f7a6e] text-[10px] px-2 py-0.5 rounded-full font-bold">
                  {group.videos?.length ?? 0}{t('videos.shared.videoCountSuffix')}
                </span>
              </h2>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {group.videos && group.videos.length > 0 ? (
                group.videos.map((video) => (
                  <VideoItem
                    key={video.id}
                    video={video}
                    isSelected={selectedVideo?.id === video.id}
                    onSelect={(videoId) => {
                      handleVideoSelect(videoId);
                      setMobileTab('player');
                    }}
                  />
                ))
              ) : (
                <p className="text-center text-[#6f7a6e] py-8 text-sm">
                  {t('videos.shared.noVideos')}
                </p>
              )}
            </div>
          </aside>

          {/* Center: Video Player */}
          <section className={`col-span-12 lg:col-span-6 flex flex-col gap-4 overflow-hidden ${mobileTab === 'player' ? 'flex' : 'hidden lg:flex'}`}>
            <div className="bg-white rounded-2xl shadow-[0_8px_30px_rgba(28,25,23,0.08)] p-6 flex-1 flex flex-col gap-4 overflow-hidden">
              <div className="shrink-0">
                <h2 className="text-xl font-extrabold text-[#191c19] leading-snug">
                  {selectedVideo ? selectedVideo.title : t('videos.shared.playerPlaceholder')}
                </h2>
                {selectedVideo && (
                  <p className="text-sm text-[#6f7a6e] mt-1 line-clamp-2">
                    {selectedVideo.description || t('videos.shared.noDescription')}
                  </p>
                )}
              </div>
              <div className="flex-1 bg-zinc-950 rounded-xl overflow-hidden flex items-center justify-center min-h-0">
                {selectedVideo ? (
                  selectedVideo.file ? (
                    <video
                      ref={videoRef}
                      key={selectedVideo.id}
                      controls
                      className="w-full h-full object-contain"
                      src={apiClient.getSharedVideoUrl(selectedVideo.file, shareToken)}
                      onCanPlay={handleVideoCanPlay}
                    >
                      {t('common.messages.browserNoVideoSupport')}
                    </video>
                  ) : (
                    <p className="text-stone-400 text-sm">{t('videos.shared.videoNoFile')}</p>
                  )
                ) : (
                  <div className="flex flex-col items-center gap-4 text-stone-500">
                    <Zap className="w-12 h-12 opacity-30" />
                    <p className="text-sm">{t('videos.shared.playerPlaceholder')}</p>
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* Right: Chat */}
          <aside className={`col-span-12 lg:col-span-3 overflow-hidden ${mobileTab === 'chat' ? 'flex flex-col' : 'hidden lg:flex lg:flex-col'}`}>
            <ChatPanel
              groupId={group.id}
              onVideoPlay={handleVideoPlayFromTime}
              shareToken={shareToken}
              className="flex-1 min-h-0"
            />
          </aside>

        </section>

        {/* ── Footer ── */}
        <footer className="shrink-0 flex flex-col md:flex-row items-center justify-between gap-2 pt-2 border-t border-stone-100">
          <p className="text-xs font-semibold uppercase tracking-wider text-stone-400">
            © 2026 VideoQ Education Inc.
          </p>
          <div className="flex gap-6">
            <a href="#" className="text-xs font-semibold uppercase tracking-wider text-stone-400 hover:text-[#00652c] transition-colors">Privacy</a>
            <a href="#" className="text-xs font-semibold uppercase tracking-wider text-stone-400 hover:text-[#00652c] transition-colors">Terms</a>
          </div>
        </footer>

      </main>
    </div>
  );
}
