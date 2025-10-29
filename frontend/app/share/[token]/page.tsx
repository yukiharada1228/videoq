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
import { getStatusBadgeClassName, getStatusLabel } from '@/lib/utils/video';
import { convertVideoInGroupToSelectedVideo, SelectedVideo } from '@/lib/utils/videoConversion';

// 共有ページ用の動画アイテムコンポーネント（ドラッグ＆ドロップなし）
interface VideoItemProps {
  video: VideoInGroup;
  isSelected: boolean;
  onSelect: (videoId: number) => void;
}

function VideoItem({ video, isSelected, onSelect }: VideoItemProps) {
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
          <p className="text-xs text-gray-600 line-clamp-1">{video.description || '説明なし'}</p>
          <div className="flex items-center gap-2 mt-2">
            <span className={getStatusBadgeClassName(video.status, 'sm')}>
              {getStatusLabel(video.status)}
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

  const [group, setGroup] = useState<VideoGroup | null>(null);
  const [selectedVideo, setSelectedVideo] = useState<SelectedVideo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const pendingStartTimeRef = useRef<number | null>(null);

  useEffect(() => {
    const loadGroup = async () => {
      if (!shareToken) return;

      try {
        setIsLoading(true);
        const groupData = await apiClient.getSharedGroup(shareToken);
        console.log('Shared group data:', groupData);
        console.log('Owner has API key:', groupData.owner_has_api_key);
        setGroup(groupData);

        // 最初の動画を自動選択
        if (groupData.videos && groupData.videos.length > 0) {
          const firstVideo = convertVideoInGroupToSelectedVideo(groupData.videos[0]);
          setSelectedVideo(firstVideo);
        }
      } catch (err) {
        setError('共有グループの読み込みに失敗しました');
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    };

    loadGroup();
  }, [shareToken]);

  const handleVideoSelect = (videoId: number) => {
    const video = group?.videos?.find(v => v.id === videoId);
    if (video) {
      const selectedVid = convertVideoInGroupToSelectedVideo(video);
      setSelectedVideo(selectedVid);
    }
  };

  const handleVideoCanPlay = () => {
    if (pendingStartTimeRef.current !== null && videoRef.current) {
      videoRef.current.currentTime = pendingStartTimeRef.current;
      videoRef.current.play();
      pendingStartTimeRef.current = null;
    }
  };

  // チャットから動画を選択して指定時間から再生する関数
  const handleVideoPlayFromTime = (videoId: number, startTime: string) => {
    // 時間文字列を秒に変換（形式: HH:MM:SS,mmm または MM:SS）
    const timeToSeconds = (timeStr: string): number => {
      // カンマがあればミリ秒部分を削除
      const timeWithoutMs = timeStr.split(',')[0];
      const parts = timeWithoutMs.split(':');

      if (parts.length === 3) {
        // HH:MM:SS 形式
        const hours = parseInt(parts[0], 10);
        const minutes = parseInt(parts[1], 10);
        const seconds = parseInt(parts[2], 10);
        return hours * 3600 + minutes * 60 + seconds;
      } else if (parts.length === 2) {
        // MM:SS 形式
        const minutes = parseInt(parts[0], 10);
        const seconds = parseInt(parts[1], 10);
        return minutes * 60 + seconds;
      }
      return 0;
    };

    const seconds = timeToSeconds(startTime);

    // 同じ動画が既に選択されている場合は即座に時間を設定
    if (selectedVideo?.id === videoId && videoRef.current) {
      videoRef.current.currentTime = seconds;
      videoRef.current.play();
    } else {
      // 別の動画を選択する場合は開始時間を保存
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
              <MessageAlert type="error" message={error || '共有グループが見つかりません'} />
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
      <div className="flex-1 container mx-auto px-4 py-4">
        <div className="space-y-4 h-full flex flex-col">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">{group.name}</h1>
              <p className="text-gray-500 mt-1">
                {group.description || '説明なし'}
              </p>
            </div>
          </div>

          {error && <MessageAlert type="error" message={error} />}

          {/* 3カラムレイアウト */}
          <div className="grid grid-cols-12 gap-4 flex-1 min-h-0">
            {/* 左側：動画一覧 */}
            <div className="col-span-3 overflow-y-auto">
              <Card className="h-full">
                <CardHeader>
                  <CardTitle>動画一覧</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
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
                    <p className="text-center text-gray-500 py-4 text-sm">動画がありません</p>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* 中央：動画プレイヤー */}
            <div className="col-span-6">
              <Card className="h-full flex flex-col">
                <CardHeader>
                  <CardTitle>
                    {selectedVideo ? selectedVideo.title : '動画を選択してください'}
                  </CardTitle>
                  {selectedVideo && (
                    <p className="text-sm text-gray-600 mt-1">{selectedVideo.description || '説明なし'}</p>
                  )}
                </CardHeader>
                <CardContent className="flex-1 flex items-center justify-center">
                  {selectedVideo ? (
                    selectedVideo.file ? (
                      <video
                        ref={videoRef}
                        key={selectedVideo.id}
                        controls
                        className="w-full max-h-[500px] rounded"
                        src={apiClient.getSharedVideoUrl(selectedVideo.file, shareToken)}
                        onCanPlay={handleVideoCanPlay}
                      >
                        お使いのブラウザは動画タグをサポートしていません。
                      </video>
                    ) : (
                      <p className="text-gray-500">動画ファイルがありません</p>
                    )
                  ) : (
                    <p className="text-gray-500 text-center">
                      左側のリストから動画を選択してください
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* 右側：チャット */}
            <div className="col-span-3">
              <ChatPanel
                hasApiKey={!!group.owner_has_api_key}
                groupId={group.id}
                onVideoPlay={handleVideoPlayFromTime}
                shareToken={shareToken}
              />
            </div>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}
