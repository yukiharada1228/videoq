'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import { apiClient, VideoGroup, VideoInGroup } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { MessageAlert } from '@/components/common/MessageAlert';
import { ChatPanel } from '@/components/chat/ChatPanel';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { getStatusBadgeClassName, getStatusLabel, timeStringToSeconds } from '@/lib/utils/video';
import { convertVideoInGroupToSelectedVideo, SelectedVideo } from '@/lib/utils/videoConversion';
import { useTranslation } from 'react-i18next';

// Video item component for shared page (no drag & drop)
interface VideoItemProps {
  video: VideoInGroup;
  isSelected: boolean;
  onSelect: (videoId: number) => void;
}

function VideoItem({ video, isSelected, onSelect }: VideoItemProps) {
  const { t, i18n } = useTranslation();
  return (
    <div
      onClick={() => onSelect(video.id)}
      className={`p-3 border rounded cursor-pointer hover:bg-gray-50 ${
        isSelected ? 'bg-blue-50 border-blue-300' : ''
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-sm text-gray-900 truncate">{video.title}</h3>
          <p className="text-xs text-gray-600 line-clamp-1">
            {video.description || t('videos.shared.noDescription')}
          </p>
          <div className="flex items-center gap-2 mt-2">
            <span className={getStatusBadgeClassName(video.status, 'sm')}>
              {getStatusLabel(video.status, i18n.language)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SharedGroupPage() {
  const params = useParams();
  const shareToken = params?.token as string;
  const { t } = useTranslation();

  const [group, setGroup] = useState<VideoGroup | null>(null);
  const [selectedVideo, setSelectedVideo] = useState<SelectedVideo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const pendingStartTimeRef = useRef<number | null>(null);

  // Mobile tab state
  const [mobileTab, setMobileTab] = useState<'videos' | 'player' | 'chat'>('player');

  useEffect(() => {
    const loadGroup = async () => {
      if (!shareToken) return;

      try {
        setIsLoading(true);
        const groupData = await apiClient.getSharedGroup(shareToken);
        setGroup(groupData);

        // Automatically select first video
        if (groupData.videos && groupData.videos.length > 0) {
          const firstVideo = convertVideoInGroupToSelectedVideo(groupData.videos[0]);
          setSelectedVideo(firstVideo);
        }
      } catch (err) {
        setError(t('common.messages.shareLoadFailed'));
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    };

    loadGroup();
  }, [shareToken, t]);

  const handleVideoSelect = (videoId: number) => {
    const video = group?.videos?.find(v => v.id === videoId);
    if (video) {
      const selectedVid = convertVideoInGroupToSelectedVideo(video);
      setSelectedVideo(selectedVid);
      // Switch to player tab when video is selected on mobile
      if (window.innerWidth < 1024) {
        setMobileTab('player');
      }
    }
  };

  const handleVideoCanPlay = () => {
    if (pendingStartTimeRef.current !== null && videoRef.current) {
      videoRef.current.currentTime = pendingStartTimeRef.current;
      videoRef.current.play();
      pendingStartTimeRef.current = null;
    }
  };

  // Function to select video from chat and play from specified time
  const handleVideoPlayFromTime = (videoId: number, startTime: string) => {
    // Convert time string to seconds using common utility
    const seconds = timeStringToSeconds(startTime);

    // Automatically switch to player tab on mobile
    if (window.innerWidth < 1024) {
      setMobileTab('player');
    }

    // Set time immediately if same video is already selected
    if (selectedVideo?.id === videoId && videoRef.current) {
      videoRef.current.currentTime = seconds;
      videoRef.current.play();
    } else {
      // Save start time when selecting different video
      pendingStartTimeRef.current = seconds;
      handleVideoSelect(videoId);
    }
  };

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
              <MessageAlert
                type="error"
                message={error || t('common.messages.shareNotFound')}
              />
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
          </div>

          {error && <MessageAlert type="error" message={error} />}

          {/* モバイル用タブナビゲーション */}
          <div className="lg:hidden flex border-b border-gray-200 bg-white rounded-t-lg">
            <button
              onClick={() => setMobileTab('videos')}
              className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                mobileTab === 'videos'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {t('videos.shared.tabs.videos')}
            </button>
            <button
              onClick={() => setMobileTab('player')}
              className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                mobileTab === 'player'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {t('videos.shared.tabs.player')}
            </button>
            <button
              onClick={() => setMobileTab('chat')}
              className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                mobileTab === 'chat'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {t('videos.shared.tabs.chat')}
            </button>
          </div>

          {/* レスポンシブレイアウト: モバイルはタブ切り替え、PCは3カラム */}
          <div className="flex flex-col lg:grid flex-1 min-h-0 gap-4 lg:gap-6 lg:grid-cols-[320px_minmax(0,1fr)_360px]">
            {/* 左側：動画一覧 */}
            <div className={`flex-col min-h-0 ${mobileTab === 'videos' ? 'flex' : 'hidden lg:flex'}`}>
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
                          onSelect={handleVideoSelect}
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

            {/* 中央：動画プレイヤー */}
            <div className={`flex-col min-h-0 ${mobileTab === 'player' ? 'flex' : 'hidden lg:flex'}`}>
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
                      <p className="text-gray-500 text-sm">
                        {t('videos.shared.videoNoFile')}
                      </p>
                    )
                  ) : (
                    <p className="text-gray-500 text-center text-sm">
                      {t('videos.shared.playerPlaceholder')}
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* 右側：チャット */}
            <div className={`flex-col min-h-0 ${mobileTab === 'chat' ? 'flex' : 'hidden lg:flex'}`}>
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
