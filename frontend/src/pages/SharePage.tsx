import { useCallback, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { List, Play } from 'lucide-react';
import { Link } from '@/lib/i18n';
import { apiClient, type VideoInGroup } from '@/lib/api';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { StatusBadge } from '@/components/common/StatusBadge';
import { Button } from '@/components/ui/button';
import { ChipLabel } from '@/components/ui/chip-label';
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
      className={`flex items-center gap-2 p-3 rounded-8 cursor-pointer group transition-colors ${
        isSelected ? 'border-l-4 border-key-900 bg-key-50' : 'hover:bg-solid-gray-50'
      }`}
    >
      <div className="flex-1 min-w-0">
        <p className={`text-std-16N-170 truncate leading-tight ${isSelected ? 'font-bold text-key-900' : 'font-medium text-solid-gray-800'}`}>
          {video.title}
        </p>
        <StatusBadge status={video.status} size="xs" className="mt-1 ml-0" />
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
      <div className="min-h-screen flex items-center justify-center bg-solid-gray-50">
        <LoadingSpinner />
      </div>
    );
  }

  // ── Error ──────────────────────────────────────────────────────────────────

  if (error || !group) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-solid-gray-50 gap-4">
        <p className="text-error-1">{error || t('common.messages.shareNotFound')}</p>
        <Button variant="solid" size="md" onClick={() => navigate('/')}>
          {t('common.actions.backToHome')}
        </Button>
      </div>
    );
  }

  // ── Main ───────────────────────────────────────────────────────────────────

  return (
    <>
      <div className="bg-solid-gray-50 flex flex-col">
      {/* ── Fixed Header ────────────────────────────────────────────────── */}
      <header className="fixed top-0 z-50 w-full border-b border-solid-gray-420 bg-white">
        <div className="mx-auto flex w-full max-w-screen-xl items-center justify-between gap-4 px-6 py-4 lg:px-8">
          <div className="flex min-w-0 items-center gap-6">
            <Link href="/" className="shrink-0 text-std-20B-150 text-solid-gray-800">
              VideoQ
            </Link>
            <div className="hidden min-w-0 items-center gap-1 text-std-16N-170 font-medium text-solid-gray-600 lg:flex">
              <span className="max-w-[200px] truncate font-bold text-key-900">
                {group.name}
              </span>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <ChipLabel variant="filled-1" color="blue" className="min-h-0 text-oln-14N-100">
              {t('videos.shared.publicBadge')}
            </ChipLabel>
          </div>
        </div>
      </header>

      {/* ── Main ────────────────────────────────────────────────────────── */}
      <main className="mt-16 flex flex-col px-6 pt-4 gap-4 max-w-[1600px] mx-auto w-full overflow-y-auto pb-20 lg:pb-4 lg:h-[calc(100dvh-4rem)] lg:overflow-hidden">
        {group.description && (
          <div className="shrink-0 rounded-8 border border-solid-gray-300 bg-white px-4 py-3 text-std-16N-170 text-solid-gray-700">
            {group.description}
          </div>
        )}

        {/* 3-column grid */}
        <div className="flex flex-col lg:grid lg:grid-cols-4 gap-6 lg:flex-1 lg:min-h-0 lg:items-stretch">

          {/* LEFT: Video list */}
          <aside className={`lg:col-span-1 flex flex-col min-h-0 ${mobileTab === 'videos' ? 'flex' : 'hidden lg:flex'}`}>
            <div className="flex h-full flex-col overflow-hidden rounded-8 border border-solid-gray-300 bg-white">
              <div className="p-4 border-b border-solid-gray-200 flex items-center justify-between shrink-0">
                <h2 className="font-bold text-std-16B-170 text-solid-gray-800">{t('videos.groupDetail.videoListTitle')}</h2>
                <ChipLabel variant="filled-1" color="gray" className="min-h-0 text-oln-14N-100">
                  {t('videos.groupDetail.videoCount', { count: group.videos?.length ?? 0 })}
                </ChipLabel>
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
                  <p className="text-center text-solid-gray-600 py-8 text-std-16N-170">
                    {t('videos.shared.noVideos')}
                  </p>
                )}
              </div>
            </div>
          </aside>

          {/* CENTER: Video player */}
          <section className={`lg:col-span-2 flex flex-col gap-3 lg:min-h-0 ${mobileTab === 'player' ? 'flex' : 'hidden lg:flex'}`}>
            <div className="flex flex-col overflow-hidden border border-solid-gray-420 bg-white lg:flex-1">
              <div className="p-4 border-b border-solid-gray-200 shrink-0 flex items-center justify-between gap-3 min-w-0">
                <h1 className="font-bold text-solid-gray-800 text-std-18B-160 truncate flex-1 min-w-0">
                  {selectedVideo ? selectedVideo.title : t('videos.shared.playerPlaceholder')}
                </h1>
              </div>
              <div className="aspect-video lg:aspect-auto lg:flex-1 bg-solid-gray-800 flex items-center justify-center lg:min-h-0">
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
                    <p className="text-solid-gray-420 text-std-16N-170">{t('videos.shared.videoNoFile')}</p>
                  )
                ) : (
                  <p className="text-solid-gray-420 text-std-16N-170 text-center px-4">{t('videos.shared.playerPlaceholder')}</p>
                )}
              </div>
            </div>
            {/* Chat below player on mobile */}
            <div className="lg:hidden">
              <ChatPanel
                groupId={group.id}
                onVideoPlay={handleVideoPlayFromTime}
                shareToken={shareToken}
                className="h-[480px]"
              />
            </div>
          </section>

          {/* RIGHT: Chat (desktop only) */}
          <aside className="hidden lg:flex lg:col-span-1 flex-col min-h-0">
            <ChatPanel
              groupId={group.id}
              onVideoPlay={handleVideoPlayFromTime}
              shareToken={shareToken}
              className="min-h-0 flex-1"
            />
          </aside>

        </div>
      </main>

      {/* ── Mobile bottom nav ───────────────────────────────────────────── */}
      <nav className="fixed bottom-0 left-0 z-50 flex h-16 w-full items-center justify-around border-t border-solid-gray-420 bg-white px-4 lg:hidden">
        {(['videos', 'player'] as MobileTab[]).map((tab) => {
          const Icon = mobileTabIcon[tab];
          const isActive = mobileTab === tab;
          return (
            <button
              key={tab}
              onClick={() => setMobileTab(tab)}
              className={`flex flex-col items-center justify-center gap-1 px-4 py-1 transition-colors ${
                isActive ? 'border-b-2 border-key-900 text-key-900' : 'text-solid-gray-420 hover:text-key-900'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="text-dns-14N-120 font-medium">{mobileTabLabel[tab]}</span>
            </button>
          );
        })}
      </nav>
      </div>
    </>
  );
}
