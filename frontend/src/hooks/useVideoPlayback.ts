import { useRef } from 'react';
import { timeStringToSeconds } from '@/lib/utils/video';
import { type SelectedVideo } from '@/lib/utils/videoConversion';

interface UseVideoPlaybackOptions {
  selectedVideo: SelectedVideo | null;
  onVideoSelect: (videoId: number) => void;
  onMobileSwitch?: () => void;
}

interface UseVideoPlaybackReturn {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  handleVideoCanPlay: (event?: React.SyntheticEvent<HTMLVideoElement>) => void;
  handleVideoPlayFromTime: (videoId: number, startTime: string) => void;
}

export function useVideoPlayback({
  selectedVideo,
  onVideoSelect,
  onMobileSwitch,
}: UseVideoPlaybackOptions): UseVideoPlaybackReturn {
  const videoRef = useRef<HTMLVideoElement>(null);
  const pendingStartTimeRef = useRef<number | null>(null);

  const handleVideoCanPlay = (event?: React.SyntheticEvent<HTMLVideoElement>) => {
    if (pendingStartTimeRef.current !== null) {
      const videoElement = event?.currentTarget ?? videoRef.current;
      if (videoElement) {
        videoElement.currentTime = pendingStartTimeRef.current;
        void videoElement.play();
        pendingStartTimeRef.current = null;
      }
    }
  };

  const handleVideoPlayFromTime = (videoId: number, startTime: string) => {
    const seconds = timeStringToSeconds(startTime);

    if (onMobileSwitch) {
      onMobileSwitch();
    }

    if (selectedVideo?.id === videoId && videoRef.current) {
      videoRef.current.currentTime = seconds;
      void videoRef.current.play();
    } else {
      pendingStartTimeRef.current = seconds;
      onVideoSelect(videoId);
    }
  };

  return {
    videoRef,
    handleVideoCanPlay,
    handleVideoPlayFromTime,
  };
}
