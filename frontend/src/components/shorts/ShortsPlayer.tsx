import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Volume2, VolumeX, Loader2, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { apiClient, type PopularScene } from '@/lib/api';
import { timeStringToSeconds } from '@/lib/utils/video';

interface ShortsPlayerProps {
  scenes: PopularScene[];
  shareToken?: string;
  onClose: () => void;
}

// Increased preload range to ensure more videos are ready
const PRELOAD_RANGE = 5;

export function ShortsPlayer({ scenes, shareToken, onClose }: ShortsPlayerProps) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRefs = useRef(new Map<number, HTMLVideoElement>());
  const slideRefs = useRef(new Map<number, HTMLDivElement>());
  const unlockedVideosRef = useRef(new Set<number>());  // Track which videos are unlocked
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isAudioUnlocked, setIsAudioUnlocked] = useState(false);
  const [showPlayOverlay, setShowPlayOverlay] = useState(true);
  const currentIndexRef = useRef(currentIndex);

  // Keep ref in sync
  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);

  // Pre-compute time values and video URLs
  const sceneMeta = useMemo(() =>
    scenes.map((scene) => {
      const startSeconds = timeStringToSeconds(scene.start_time);
      const endSeconds = timeStringToSeconds(scene.end_time);
      const end = endSeconds > startSeconds ? endSeconds : startSeconds + 0.001;
      let src = '';
      if (scene.file) {
        src = shareToken
          ? apiClient.getSharedVideoUrl(scene.file, shareToken)
          : apiClient.getVideoUrl(scene.file);
      }
      return { startSeconds, endSeconds: end, src };
    }),
    [scenes, shareToken]
  );

  // Unlock a video element by playing it muted briefly
  const unlockVideo = useCallback((video: HTMLVideoElement, index: number) => {
    if (unlockedVideosRef.current.has(index)) return Promise.resolve();

    return new Promise<void>((resolve) => {
      const originalMuted = video.muted;
      const originalTime = video.currentTime;
      video.muted = true;
      video.play().then(() => {
        video.pause();
        video.currentTime = originalTime;
        video.muted = originalMuted;
        unlockedVideosRef.current.add(index);
        resolve();
      }).catch(() => {
        resolve();
      });
    });
  }, []);

  // Unlock all loaded videos
  const unlockAllVideos = useCallback(async () => {
    const promises: Promise<void>[] = [];
    videoRefs.current.forEach((video, index) => {
      promises.push(unlockVideo(video, index));
    });
    await Promise.all(promises);
  }, [unlockVideo]);

  // Play video - simpler approach since videos are pre-unlocked
  const playVideo = useCallback((index: number, muted: boolean) => {
    const video = videoRefs.current.get(index);
    const meta = sceneMeta[index];
    if (!video || !meta) return;

    video.currentTime = meta.startSeconds;
    video.muted = muted;

    video.play().catch(() => {
      // If play fails, unlock and retry
      unlockVideo(video, index).then(() => {
        video.muted = muted;
        video.play().catch(() => {
          // Final fallback: play muted
          video.muted = true;
          setIsMuted(true);
          video.play().catch(() => { });
        });
      });
    });
  }, [sceneMeta, unlockVideo]);

  // Handle initial tap to unlock audio and start playback
  const handlePlayOverlayClick = useCallback(async () => {
    setShowPlayOverlay(false);

    // Unlock all currently loaded videos
    await unlockAllVideos();

    setIsAudioUnlocked(true);
    setIsMuted(false);

    // Start playing current video with sound
    playVideo(currentIndex, false);
  }, [currentIndex, playVideo, unlockAllVideos]);

  // IntersectionObserver for scroll-based slide detection
  useEffect(() => {
    if (scenes.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
            const newIndex = Number((entry.target as HTMLElement).dataset.index);
            setCurrentIndex(newIndex);
          }
        }
      },
      { threshold: 0.6, root: containerRef.current }
    );
    requestAnimationFrame(() => {
      if (slideRefs.current && slideRefs.current.size > 0) {
        slideRefs.current.forEach((s) => { if (s) observer.observe(s); });
      }
    });
    return () => observer.disconnect();
  }, [scenes.length]);

  // Unlock newly loaded videos when they appear
  useEffect(() => {
    if (!isAudioUnlocked) return;

    // Unlock any new videos that have been loaded
    videoRefs.current.forEach((video, index) => {
      if (!unlockedVideosRef.current.has(index)) {
        unlockVideo(video, index);
      }
    });
  }, [currentIndex, isAudioUnlocked, unlockVideo]);

  // Handle scroll/touch to play videos
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !isAudioUnlocked) return;

    let scrollTimeout: ReturnType<typeof setTimeout>;
    let isTouching = false;

    const pauseAllExceptCurrent = () => {
      videoRefs.current.forEach((video, i) => {
        if (i !== currentIndexRef.current && !video.paused) {
          video.pause();
        }
      });
    };

    const handleTouchStart = () => {
      isTouching = true;
      pauseAllExceptCurrent();
    };

    const handleTouchEnd = () => {
      isTouching = false;
      // Play in touchend context (strongest user gesture)
      const idx = currentIndexRef.current;
      const video = videoRefs.current.get(idx);
      if (video) {
        // Ensure video is unlocked, then play
        if (!unlockedVideosRef.current.has(idx)) {
          unlockVideo(video, idx).then(() => {
            playVideo(idx, isMuted);
          });
        } else {
          playVideo(idx, isMuted);
        }
      }
    };

    const handleScroll = () => {
      clearTimeout(scrollTimeout);
      pauseAllExceptCurrent();

      scrollTimeout = setTimeout(() => {
        if (!isTouching) {
          const idx = currentIndexRef.current;
          playVideo(idx, isMuted);
        }
      }, 150);
    };

    container.addEventListener('touchstart', handleTouchStart, { passive: true });
    container.addEventListener('touchend', handleTouchEnd, { passive: true });
    container.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchend', handleTouchEnd);
      container.removeEventListener('scroll', handleScroll);
      clearTimeout(scrollTimeout);
    };
  }, [isAudioUnlocked, isMuted, playVideo, unlockVideo]);

  // Pause other videos when current index changes
  useEffect(() => {
    videoRefs.current.forEach((video, i) => {
      if (i !== currentIndex && video && !video.paused) {
        video.pause();
      }
    });
  }, [currentIndex]);

  // Handle mute toggle
  const handleMuteToggle = useCallback(() => {
    const newMuted = !isMuted;
    setIsMuted(newMuted);
    const video = videoRefs.current.get(currentIndexRef.current);
    if (video) {
      video.muted = newMuted;
      if (!newMuted && video.paused) {
        video.play().catch(() => { });
      }
    }
  }, [isMuted]);

  // Handle tap/click on video to toggle play/pause
  const handleVideoClick = useCallback((index: number) => {
    if (!isAudioUnlocked) {
      handlePlayOverlayClick();
      return;
    }
    const video = videoRefs.current.get(index);
    if (video) {
      if (video.paused) {
        playVideo(index, isMuted);
      } else {
        video.pause();
      }
    }
  }, [isAudioUnlocked, isMuted, handlePlayOverlayClick, playVideo]);

  // Escape key + body scroll lock
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  if (scenes.length === 0) {
    return (
      <div className="fixed inset-0 z-50 bg-black flex items-center justify-center">
        <div className="text-white text-center">
          <p className="text-lg">{t('shorts.noScenes')}</p>
          <Button variant="outline" className="mt-4" onClick={onClose}>
            {t('common.actions.close')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black">
      {/* Play overlay for initial unlock */}
      {showPlayOverlay && (
        <div
          className="absolute inset-0 z-20 flex items-center justify-center bg-black/60 cursor-pointer"
          onClick={handlePlayOverlayClick}
        >
          <div className="flex flex-col items-center gap-4 text-white">
            <div className="w-20 h-20 rounded-full bg-white/20 flex items-center justify-center backdrop-blur-sm">
              <Play className="h-10 w-10 text-white ml-1" />
            </div>
            <p className="text-lg font-medium">{t('shorts.tapToPlay')}</p>
          </div>
        </div>
      )}

      <div className="absolute top-4 right-4 z-10 flex gap-2">
        <Button variant="ghost" size="icon" className="text-white hover:bg-white/20" onClick={handleMuteToggle}>
          {isMuted ? <VolumeX className="h-6 w-6" /> : <Volume2 className="h-6 w-6" />}
        </Button>
        <Button variant="ghost" size="icon" className="text-white hover:bg-white/20" onClick={onClose}>
          <X className="h-6 w-6" />
        </Button>
      </div>

      <div className="absolute top-4 left-4 z-10 text-white/70 text-sm">
        {currentIndex + 1} / {scenes.length}
      </div>

      <div
        ref={containerRef}
        className="h-full w-full overflow-y-scroll snap-y snap-mandatory scroll-smooth"
        style={{ scrollSnapType: 'y mandatory', WebkitOverflowScrolling: 'touch' }}
      >
        {scenes.map((scene, index) => {
          const distance = Math.abs(index - currentIndex);
          const shouldLoad = distance <= PRELOAD_RANGE;
          const meta = sceneMeta[index];

          return (
            <div
              key={`${scene.video_id}-${scene.start_time}`}
              ref={(el) => { if (el) { slideRefs.current.set(index, el); } else { slideRefs.current.delete(index); } }}
              data-index={index}
              className="h-full w-full snap-start snap-always relative flex items-center justify-center bg-black"
            >
              {scene.file ? (
                shouldLoad ? (
                  <video
                    ref={(el) => { if (el) { videoRefs.current.set(index, el); } else { videoRefs.current.delete(index); } }}
                    className="max-h-full max-w-full object-contain cursor-pointer"
                    src={meta.src}
                    playsInline
                    // @ts-expect-error - webkit-playsinline is needed for iOS Safari
                    webkitplaysinline=""
                    muted={isMuted}
                    preload="auto"
                    onClick={() => handleVideoClick(index)}
                    onLoadedMetadata={(e) => {
                      const v = e.currentTarget;
                      if (v.currentTime < meta.startSeconds || v.currentTime > meta.endSeconds) {
                        v.currentTime = meta.startSeconds;
                      }
                      // Auto-unlock when video loads if audio is already unlocked
                      if (isAudioUnlocked && !unlockedVideosRef.current.has(index)) {
                        unlockVideo(v, index);
                      }
                    }}
                    onTimeUpdate={(e) => {
                      const video = e.currentTarget;
                      if (video.currentTime >= meta.endSeconds) {
                        video.currentTime = meta.startSeconds;
                        video.play().catch(() => { });
                      }
                    }}
                  />
                ) : (
                  <div className="flex items-center justify-center text-white/40">
                    <Loader2 className="h-8 w-8 animate-spin" />
                  </div>
                )
              ) : (
                <div className="text-white/50">{t('videos.shared.videoNoFile')}</div>
              )}

              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-6 pb-8">
                <h3 className="text-white text-lg font-semibold mb-1 line-clamp-2">{scene.title}</h3>
                <div className="flex items-center gap-4 text-white/70 text-sm">
                  <span>{scene.start_time} - {scene.end_time}</span>
                  <span>{t('shorts.referenceCount', { count: scene.reference_count })}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
