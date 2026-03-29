import { useCallback, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  GraduationCap, List, Play,
  CheckCircle, Clock, AlertCircle,
} from 'lucide-react';
import { Link } from '@/lib/i18n';
import { apiClient, type VideoInGroup } from '@/lib/api';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { ChatPanel } from '@/components/chat/ChatPanel';
import { convertVideoInGroupToSelectedVideo, type SelectedVideo } from '@/lib/utils/videoConversion';
import { useVideoPlayback } from '@/hooks/useVideoPlayback';
import { useMobileTab } from '@/hooks/useMobileTab';
import { useSharedGroupQuery } from '@/hooks/useSharePageData';
import { useI18nNavigate } from '@/lib/i18n';

type MobileTab = 'videos' | 'player';

function buildYoutubeEmbedSrc(embedUrl: string, startSeconds: number | null): string {
  if (startSeconds === null) {
    return embedUrl;
  }
  return `${embedUrl}?autoplay=1&start=${startSeconds}`;
}

// ── Status badge ──────────────────────────────────────────────────────────────

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

// ── Video list item ───────────────────────────────────────────────────────────

interface VideoItemProps {
  video: VideoInGroup;
  isSelected: boolean;
  onSelect: (videoId: number) => void;
}

function VideoItem({ video, isSelected, onSelect }: VideoItemProps) {
  return (
    <div
      onClick={() => onSelect(video.id)}
      className={`flex items-center gap-2 p-3 rounded-xl cursor-pointer group transition-colors ${
        isSelected ? 'bg-[#f0fdf4] border-l-4 border-[#00652c]' : 'hover:bg-stone-50'
      }`}
    >
      <div className="flex-1 min-w-0">
        <p className={`text-sm truncate leading-tight ${isSelected ? 'font-bold text-[#00652c]' : 'font-medium text-[#191c19]'}`}>
          {video.title}
        </p>
        <VideoStatusBadge status={video.status} />
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SharePage() {
  const params = useParams<{ token: string }>();
  const shareToken = params?.token ?? '';
  const { t } = useTranslation();
  const navigate = useI18nNavigate();

  const [selectedVideoId, setSelectedVideoId] = useState<number | null>(null);

  const { mobileTab, setMobileTab, isMobile } = useMobileTab();
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


  const { videoRef, handleVideoCanPlay, handleVideoPlayFromTime, youtubeStartSeconds } = useVideoPlayback({
    selectedVideo,
    onVideoSelect: handleVideoSelect,
    onMobileSwitch: () => setMobileTab('player'),
  });

  const mobileTabIcon: Record<MobileTab, typeof List> = { videos: List, player: Play };
  const mobileTabLabel: Record<MobileTab, string> = {
    videos: t('videos.shared.tabs.videos'),
    player: t('videos.shared.tabs.player'),
  };

  // ── Loading ────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f8faf5]">
        <LoadingSpinner />
      </div>
    );
  }

  // ── Error ──────────────────────────────────────────────────────────────────

  if (error || !group) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#f8faf5] gap-4">
        <p className="text-red-500">{error || t('common.messages.shareNotFound')}</p>
        <button
          onClick={() => navigate('/')}
          className="px-5 py-2.5 bg-[#00652c] text-white text-sm font-bold rounded-full hover:bg-[#005323] transition-colors"
        >
          {t('common.actions.backToHome')}
        </button>
      </div>
    );
  }

  // ── Main ───────────────────────────────────────────────────────────────────

  return (
    <div
      className="bg-[#f8faf5] flex flex-col"
      style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
    >
      {/* ── Fixed Header ────────────────────────────────────────────────── */}
      <header className="fixed top-0 w-full bg-white/80 backdrop-blur-xl border-b border-stone-200/60 z-50">
        <div className="max-w-screen-xl px-6 lg:px-8 mx-auto w-full flex justify-between items-center py-4">
          <div className="flex items-center gap-6 min-w-0">
            <Link
              href="/"
              className="flex items-center gap-2 text-xl font-bold text-stone-900 shrink-0"
              style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
            >
              <GraduationCap className="text-[#00652c] w-6 h-6" />
              <span>VideoQ</span>
            </Link>
            <div className="hidden lg:flex items-center gap-1 text-sm text-[#6f7a6e] font-medium min-w-0">
              <span className="text-[#00652c] font-bold border-b-2 border-[#00652c] truncate max-w-[200px]">
                {group.name}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs font-bold uppercase tracking-wider text-[#006d30] bg-[#d3ffd5] px-3 py-1.5 rounded-full">
              {t('videos.shared.publicBadge')}
            </span>
          </div>
        </div>
      </header>

      {/* ── Main ────────────────────────────────────────────────────────── */}
      <main className="mt-16 flex flex-col px-6 pt-4 gap-4 max-w-[1600px] mx-auto w-full overflow-y-auto pb-16 lg:pb-0 lg:h-[calc(100dvh-4rem)] lg:overflow-hidden">
        {group.description && (
          <div className="shrink-0 rounded-2xl border border-stone-200/70 bg-white/80 px-4 py-3 text-sm text-[#4f5a4f] shadow-[0_4px_20px_rgba(28,25,23,0.04)]">
            {group.description}
          </div>
        )}

        {/* 3-column grid */}
        <div className="flex flex-col lg:grid lg:grid-cols-4 gap-6 lg:flex-1 lg:min-h-0 lg:items-stretch">

          {/* LEFT: Video list */}
          <aside className={`lg:col-span-1 flex flex-col min-h-0 ${mobileTab === 'videos' ? 'flex' : 'hidden lg:flex'}`}>
            <div className="bg-white rounded-xl flex flex-col h-full overflow-hidden shadow-[0_4px_20px_rgba(28,25,23,0.04)]">
              <div className="p-4 border-b border-stone-100 flex items-center justify-between shrink-0">
                <h2 className="font-extrabold text-[#191c19]">{t('videos.groupDetail.videoListTitle')}</h2>
                <span className="text-xs bg-[#f2f4ef] px-2 py-0.5 rounded-full text-[#6f7a6e] font-medium">
                  {t('videos.groupDetail.videoCount', { count: group.videos?.length ?? 0 })}
                </span>
              </div>
              <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {group.videos && group.videos.length > 0 ? (
                  group.videos.map((video) => (
                    <VideoItem
                      key={video.id}
                      video={video}
                      isSelected={selectedVideo?.id === video.id}
                      onSelect={(videoId) => {
                        handleVideoSelect(videoId);
                        if (isMobile) setMobileTab('player');
                      }}
                    />
                  ))
                ) : (
                  <p className="text-center text-[#6f7a6e] py-8 text-sm">
                    {t('videos.shared.noVideos')}
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
                  {selectedVideo ? selectedVideo.title : t('videos.shared.playerPlaceholder')}
                </h1>
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
                      src={apiClient.getSharedVideoUrl(selectedVideo.file, shareToken)}
                      onCanPlay={handleVideoCanPlay}
                    >
                      {t('common.messages.browserNoVideoSupport')}
                    </video>
                  ) : (
                    <p className="text-stone-400 text-sm">{t('videos.shared.videoNoFile')}</p>
                  )
                ) : (
                  <p className="text-stone-400 text-sm text-center px-4">{t('videos.shared.playerPlaceholder')}</p>
                )}
              </div>
            </div>
            {/* Chat below player on mobile */}
            <div className="lg:hidden">
              <ChatPanel
                groupId={group.id}
                onVideoPlay={handleVideoPlayFromTime}
                shareToken={shareToken}
                className="h-[480px] shadow-[0_4px_20px_rgba(28,25,23,0.04)]"
              />
            </div>
          </section>

          {/* RIGHT: Chat (desktop only) */}
          <aside className="hidden lg:flex lg:col-span-1 flex-col min-h-0">
            <ChatPanel
              groupId={group.id}
              onVideoPlay={handleVideoPlayFromTime}
              shareToken={shareToken}
              className="flex-1 min-h-0 shadow-[0_4px_20px_rgba(28,25,23,0.04)]"
            />
          </aside>

        </div>
      </main>

      {/* ── Mobile bottom nav ───────────────────────────────────────────── */}
      <nav className="fixed bottom-0 left-0 w-full z-50 lg:hidden flex justify-around items-center h-16 bg-white border-t border-stone-100 shadow-[0_-4px_20px_rgba(28,25,23,0.06)] rounded-t-2xl px-4">
        {(['videos', 'player'] as MobileTab[]).map((tab) => {
          const Icon = mobileTabIcon[tab];
          const isActive = mobileTab === tab;
          return (
            <button
              key={tab}
              onClick={() => setMobileTab(tab)}
              className={`flex flex-col items-center justify-center gap-1 px-4 py-1 rounded-xl transition-colors ${
                isActive ? 'bg-[#f0fdf4] text-[#00652c]' : 'text-stone-400 hover:text-[#00652c]'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[11px] font-medium">{mobileTabLabel[tab]}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
