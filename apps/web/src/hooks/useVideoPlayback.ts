import { useRef, useState } from 'react';
import type { VideoInCourse } from '@videoq/trpc';
import { timeStringToSeconds } from '@/lib/utils/video';
import { seekAndPlay } from '@/lib/video/playback';

interface UseVideoPlaybackOptions {
  selectedVideo: Pick<VideoInCourse, 'id' | 'source_type'> | null;
  onVideoSelect: (videoId: number) => void;
  onMobileSwitch?: () => void;
}

interface UseVideoPlaybackReturn {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  handleVideoSelect: (videoId: number) => void;
  handleVideoCanPlay: (event?: React.SyntheticEvent<HTMLVideoElement>) => void;
  handleVideoPlayFromTime: (videoId: number, startTime: string) => void;
  youtubeStartSeconds: number | null;
  youtubeSeekId: number;
}

type PlaybackTarget = { videoId: number; seconds: number };

export function useVideoPlayback({
  selectedVideo,
  onVideoSelect,
  onMobileSwitch,
}: UseVideoPlaybackOptions): UseVideoPlaybackReturn {
  const videoRef = useRef<HTMLVideoElement>(null);
  const pendingStartTimeRef = useRef<PlaybackTarget | null>(null);
  const [youtubeStart, setYoutubeStart] = useState<(PlaybackTarget & { seekId: number }) | null>(null);

  const handleVideoSelect = (videoId: number) => {
    pendingStartTimeRef.current = null;
    setYoutubeStart(null);
    onVideoSelect(videoId);
  };

  const handleVideoCanPlay = (event?: React.SyntheticEvent<HTMLVideoElement>) => {
    const target = pendingStartTimeRef.current;
    const videoElement = event?.currentTarget ?? videoRef.current;
    if (target && target.videoId === selectedVideo?.id && videoElement && videoElement === videoRef.current) {
      pendingStartTimeRef.current = null;
      seekAndPlay(videoElement, target.seconds);
    }
  };

  const handleVideoPlayFromTime = (videoId: number, startTime: string) => {
    const seconds = timeStringToSeconds(startTime);

    onMobileSwitch?.();

    if (selectedVideo?.id === videoId && videoRef.current) {
      pendingStartTimeRef.current = null;
      setYoutubeStart(null);
      seekAndPlay(videoRef.current, seconds);
    } else {
      const target = { videoId, seconds };
      pendingStartTimeRef.current = target;
      // Each click must reload the embed, even when its start time is unchanged.
      setYoutubeStart(previous => ({ ...target, seekId: (previous?.seekId ?? 0) + 1 }));
      if (selectedVideo?.id !== videoId) onVideoSelect(videoId);
    }
  };

  const youtubeTarget = selectedVideo?.source_type === 'youtube' && youtubeStart?.videoId === selectedVideo.id
    ? youtubeStart : null;

  return {
    videoRef,
    handleVideoSelect,
    handleVideoCanPlay,
    handleVideoPlayFromTime,
    youtubeStartSeconds: youtubeTarget?.seconds ?? null,
    youtubeSeekId: youtubeTarget?.seekId ?? 0,
  };
}
