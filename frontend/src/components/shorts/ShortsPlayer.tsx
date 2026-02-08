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

const PRELOAD_RANGE = 2;

export function ShortsPlayer({ scenes, shareToken, onClose }: ShortsPlayerProps) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRefs = useRef(new Map<number, HTMLVideoElement>());
  const slideRefs = useRef(new Map<number, HTMLDivElement>());
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isMuted, setIsMuted] = useState(false);  // Start unmuted for better UX
  const [isAudioUnlocked, setIsAudioUnlocked] = useState(false);
  const [showPlayOverlay, setShowPlayOverlay] = useState(true);
  const currentIndexRef = useRef(currentIndex);
  const isMutedRef = useRef(isMuted);
  const userWantsMutedRef = useRef(false);  // Track if user explicitly wants mute

  // Keep refs in sync
  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

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

  // Play video using mute-then-unmute technique for mobile compatibility
  const playVideoWithUnlock = useCallback((index: number) => {
    const video = videoRefs.current.get(index);
    const meta = sceneMeta[index];
    if (!video || !meta) return;

    video.currentTime = meta.startSeconds;

    // If user explicitly wants muted, just play muted
    if (userWantsMutedRef.current) {
      video.muted = true;
      video.play().catch(() => { });
      return;
    }

    // Mute-then-unmute technique: Start muted to ensure playback starts
    // Then immediately unmute (works because we're in user gesture context)
    video.muted = true;
    const playPromise = video.play();

    if (playPromise !== undefined) {
      playPromise.then(() => {
        // Successfully started playing, now unmute
        video.muted = false;
        setIsMuted(false);
      }).catch(() => {
        // Play failed even with mute, keep muted state
        setIsMuted(true);
        userWantsMutedRef.current = true;
      });
    }
  }, [sceneMeta]);

  // Handle initial tap to unlock audio and start playback
  const handlePlayOverlayClick = useCallback(() => {
    setIsAudioUnlocked(true);
    setShowPlayOverlay(false);
    userWantsMutedRef.current = false;
    playVideoWithUnlock(currentIndex);
  }, [currentIndex, playVideoWithUnlock]);

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

  // Handle touch events to capture user gesture for audio unlock
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !isAudioUnlocked) return;

    let lastTouchTime = 0;
    let scrollTimeout: ReturnType<typeof setTimeout>;
    let pendingPlayIndex: number | null = null;

    const handleTouchStart = () => {
      lastTouchTime = Date.now();
      // Pause current video during touch
      videoRefs.current.forEach((video) => {
        if (!video.paused) video.pause();
      });
    };

    const handleTouchEnd = () => {
      // Play video in touchend event (strongest user gesture context)
      const idx = currentIndexRef.current;
      if (pendingPlayIndex !== null && pendingPlayIndex !== idx) {
        // Index changed, play the new one
        playVideoWithUnlock(idx);
      }
      pendingPlayIndex = null;
    };

    const handleScroll = () => {
      clearTimeout(scrollTimeout);
      pendingPlayIndex = currentIndexRef.current;

      // Pause all videos during scroll
      videoRefs.current.forEach((video) => {
        if (!video.paused) video.pause();
      });

      // If scroll without touch (momentum), use timeout
      scrollTimeout = setTimeout(() => {
        const timeSinceTouch = Date.now() - lastTouchTime;
        const idx = currentIndexRef.current;

        // If recent touch, play with unlock technique
        if (timeSinceTouch < 500) {
          playVideoWithUnlock(idx);
        } else {
          // Fallback: try normal play, will mute if needed
          const video = videoRefs.current.get(idx);
          const meta = sceneMeta[idx];
          if (video && meta) {
            video.currentTime = meta.startSeconds;
            video.muted = userWantsMutedRef.current;
            video.play().then(() => {
              if (!userWantsMutedRef.current) {
                video.muted = false;
                setIsMuted(false);
              }
            }).catch(() => {
              // Failed, use mute-then-unmute
              playVideoWithUnlock(idx);
            });
          }
        }
        pendingPlayIndex = null;
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
  }, [isAudioUnlocked, playVideoWithUnlock, sceneMeta]);

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
    const newMuted = !isMutedRef.current;
    userWantsMutedRef.current = newMuted;
    setIsMuted(newMuted);
    const video = videoRefs.current.get(currentIndexRef.current);
    if (video) {
      video.muted = newMuted;
      // If unmuting and paused, try to play
      if (!newMuted && video.paused) {
        video.play().catch(() => { });
      }
    }
  }, []);

  // Handle tap/click on video to toggle play/pause
  const handleVideoClick = useCallback((index: number) => {
    if (!isAudioUnlocked) {
      handlePlayOverlayClick();
      return;
    }
    const video = videoRefs.current.get(index);
    if (video) {
      if (video.paused) {
        playVideoWithUnlock(index);
      } else {
        video.pause();
      }
    }
  }, [isAudioUnlocked, handlePlayOverlayClick, playVideoWithUnlock]);

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
                    preload={index === currentIndex || index === currentIndex + 1 ? 'auto' : 'metadata'}
                    onClick={() => handleVideoClick(index)}
                    onLoadedMetadata={(e) => {
                      const v = e.currentTarget;
                      if (v.currentTime < meta.startSeconds || v.currentTime > meta.endSeconds) {
                        v.currentTime = meta.startSeconds;
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
