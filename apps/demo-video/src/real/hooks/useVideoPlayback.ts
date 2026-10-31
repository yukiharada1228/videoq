import { useLayoutEffect, useRef } from 'react';
import { continueRender, delayRender } from 'remotion';
import { useFilm } from '../film';

// The real page's <video> stays on screen; this seeks it to the frame's time and
// holds the screenshot until the picture has been decoded.
export function useVideoPlayback({ selectedVideo, onVideoSelect }: {
  selectedVideo: { id: number } | null;
  onVideoSelect: (videoId: number) => void;
  onMobileSwitch?: () => void;
}) {
  const { playback } = useFilm();
  const videoRef = useRef<HTMLVideoElement>(null);
  const selectedId = selectedVideo?.id;
  useLayoutEffect(() => {
    if (selectedId !== playback.videoId) onVideoSelect(playback.videoId);
  }, [selectedId, playback.videoId, onVideoSelect]);
  useLayoutEffect(() => seekVideo(videoRef.current, playback.seconds), [selectedId, playback.seconds]);
  return {
    videoRef,
    handleVideoSelect: () => {},
    handleVideoCanPlay: () => {},
    handleVideoPlayFromTime: () => {},
    youtubeStartSeconds: null,
    youtubeSeekId: 0,
  };
}

export function seekVideo(video: HTMLVideoElement | null, seconds: number) {
  if (!video) return;
  const handle = delayRender(`Seeking the lesson to ${seconds}s`);
  const finish = () => {
    video.removeEventListener('seeked', finish);
    video.removeEventListener('loadedmetadata', seek);
    continueRender(handle);
  };
  const seek = () => {
    if (Math.abs(video.currentTime - seconds) < 0.001 && video.readyState >= 2) { finish(); return; }
    video.addEventListener('seeked', finish);
    video.currentTime = seconds;
  };
  if (video.readyState >= 1) seek();
  else video.addEventListener('loadedmetadata', seek);
  return finish;
}
