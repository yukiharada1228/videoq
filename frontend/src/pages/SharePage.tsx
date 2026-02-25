import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { apiClient, type VideoGroup, type VideoInGroup } from '@/lib/api';
import { ShortsButton } from '@/components/shorts/ShortsButton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { MessageAlert } from '@/components/common/MessageAlert';
import { ChatPanel } from '@/components/chat/ChatPanel';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { getStatusBadgeClassName, getStatusLabel } from '@/lib/utils/video';
import { convertVideoInGroupToSelectedVideo, type SelectedVideo } from '@/lib/utils/videoConversion';
import { useVideoPlayback } from '@/hooks/useVideoPlayback';
import { useMobileTab } from '@/hooks/useMobileTab';

type MobileTab = 'videos' | 'player' | 'chat';

interface MobileTabNavigationProps {
  mobileTab: MobileTab;
  onTabChange: (tab: MobileTab) => void;
  labels: Record<MobileTab, string>;
}

// Shared pattern -- also in VideoGroupDetailPage.tsx
function MobileTabNavigation({ mobileTab, onTabChange, labels }: MobileTabNavigationProps) {
  const tabs: MobileTab[] = ['videos', 'player', 'chat'];
  return (
    <div className="lg:hidden flex border-b border-gray-200 bg-white rounded-t-lg">
      {tabs.map((tab) => (
        <button
          key={tab}
          onClick={() => onTabChange(tab)}
          className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
            mobileTab === tab ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-600 hover:text-gray-900'
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
      className={`p-3 border rounded cursor-pointer hover:bg-gray-50 ${isSelected ? 'bg-blue-50 border-blue-300' : ''}`}
    >
      <div className="flex items-center justify-between">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-sm text-gray-900 truncate">{video.title}</h3>
          <p className="text-xs text-gray-600 line-clamp-1">
            {video.description || t('videos.shared.noDescription')}
          </p>
          <div className="flex items-center gap-2 mt-2">
            <span className={getStatusBadgeClassName(video.status, 'sm')}>
              {t(getStatusLabel(video.status))}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SharePage() {
  const params = useParams<{ token: string }>();
  const shareToken = params?.token ?? '';
  const { t } = useTranslation();

  const [group, setGroup] = useState<VideoGroup | null>(null);
  const [selectedVideo, setSelectedVideo] = useState<SelectedVideo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { mobileTab, setMobileTab } = useMobileTab();

  const handleVideoSelect = useCallback((videoId: number) => {
    const video = group?.videos?.find((v) => v.id === videoId);
    if (video) {
      setSelectedVideo(convertVideoInGroupToSelectedVideo(video));
    }
  }, [group?.videos]);

  const { videoRef, handleVideoCanPlay, handleVideoPlayFromTime } = useVideoPlayback({
    selectedVideo,
    onVideoSelect: handleVideoSelect,
    onMobileSwitch: () => setMobileTab('player'),
  });

  useEffect(() => {
    const loadGroup = async () => {
      if (!shareToken) return;

      try {
        setIsLoading(true);
        const groupData = await apiClient.getSharedGroup(shareToken);
        setGroup(groupData);

        if (groupData.videos && groupData.videos.length > 0) {
          setSelectedVideo(convertVideoInGroupToSelectedVideo(groupData.videos[0]));
        }
      } catch (err) {
        setError(t('common.messages.shareLoadFailed'));
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    };

    void loadGroup();
  }, [shareToken, t]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <div className="flex-1 flex items-center justify-center">
          <LoadingSpinner fullScreen={false} />
        </div>
        <Footer />
      </div>
    );
  }

  if (error || !group) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <div className="flex-1 flex items-center justify-center p-4">
          <Card className="max-w-md w-full">
            <CardContent className="py-16 text-center">
              <MessageAlert type="error" message={error || t('common.messages.shareNotFound')} />
            </CardContent>
          </Card>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      <Header />
      <div className="flex-1 w-full px-6 py-6">
        <div className="space-y-4 h-full flex flex-col">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl lg:text-3xl font-bold text-gray-900">{group.name}</h1>
              <p className="text-sm lg:text-base text-gray-500 mt-1">
                {group.description || t('videos.shared.descriptionFallback')}
              </p>
            </div>
            {group.videos && group.videos.length > 0 && (
              <ShortsButton
                groupId={group.id}
                videos={group.videos}
                shareToken={shareToken}
                size="sm"
              />
            )}
          </div>

          {error && <MessageAlert type="error" message={error} />}

          <MobileTabNavigation
            mobileTab={mobileTab}
            onTabChange={setMobileTab}
            labels={{
              videos: t('videos.shared.tabs.videos'),
              player: t('videos.shared.tabs.player'),
              chat: t('videos.shared.tabs.chat'),
            }}
          />

          <div className="flex flex-col lg:grid flex-1 min-h-0 gap-4 lg:gap-6 lg:grid-cols-[1fr_2fr_1fr]">
            <div className={`flex-col min-h-0 min-w-0 ${mobileTab === 'videos' ? 'flex' : 'hidden lg:flex'}`}>
              <Card className="h-[500px] lg:h-[600px] flex flex-col">
                <CardHeader>
                  <CardTitle>{t('videos.shared.tabs.videos')}</CardTitle>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col overflow-hidden">
                  <div className="flex-1 overflow-y-auto space-y-2">
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
                      <p className="text-center text-gray-500 py-4 text-sm">
                        {t('videos.shared.noVideos')}
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className={`flex-col min-h-0 min-w-0 ${mobileTab === 'player' ? 'flex' : 'hidden lg:flex'}`}>
              <Card className="h-[500px] lg:h-[600px] flex flex-col">
                <CardHeader>
                  <CardTitle className="text-base lg:text-lg">
                    {selectedVideo ? selectedVideo.title : t('videos.shared.playerPlaceholder')}
                  </CardTitle>
                  {selectedVideo && (
                    <p className="text-xs lg:text-sm text-gray-600 mt-1">
                      {selectedVideo.description || t('videos.shared.noDescription')}
                    </p>
                  )}
                </CardHeader>
                <CardContent className="flex-1 flex items-center justify-center overflow-hidden">
                  {selectedVideo ? (
                    selectedVideo.file ? (
                      <video
                        ref={videoRef}
                        key={selectedVideo.id}
                        controls
                        className="w-full h-full max-h-[400px] lg:max-h-[500px] rounded object-contain"
                        src={apiClient.getSharedVideoUrl(selectedVideo.file, shareToken)}
                        onCanPlay={handleVideoCanPlay}
                      >
                        {t('common.messages.browserNoVideoSupport')}
                      </video>
                    ) : (
                      <p className="text-gray-500 text-sm">{t('videos.shared.videoNoFile')}</p>
                    )
                  ) : (
                    <p className="text-gray-500 text-center text-sm">{t('videos.shared.playerPlaceholder')}</p>
                  )}
                </CardContent>
              </Card>
            </div>

            <div className={`flex-col min-h-0 min-w-0 ${mobileTab === 'chat' ? 'flex' : 'hidden lg:flex'}`}>
              <ChatPanel
                groupId={group.id}
                onVideoPlay={handleVideoPlayFromTime}
                shareToken={shareToken}
                className="h-[500px] lg:h-[600px]"
              />
            </div>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}
