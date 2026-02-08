import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Volume2, VolumeX, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { apiClient, type PopularScene } from '@/lib/api';
import { timeStringToSeconds } from '@/lib/utils/video';

interface ShortsPlayerProps {
  scenes: PopularScene[];
  shareToken?: string;
  onClose: () => void;
}

export function ShortsPlayer({ scenes, shareToken, onClose }: ShortsPlayerProps) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);  // Single video element
  const slideRefs = useRef(new Map<number, HTMLDivElement>());
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [showPlayOverlay, setShowPlayOverlay] = useState(true);
  const [videoOffset, setVideoOffset] = useState(0);  // For smooth scroll following
  const currentIndexRef = useRef(currentIndex);
  const [isScrolling, setIsScrolling] = useState(false);

  // Keep ref in sync
  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);

  // Pre-compute time values and video URLs with media fragments
  const sceneMeta = useMemo(() =>
    scenes.map((scene) => {
      const startSeconds = timeStringToSeconds(scene.start_time);
      const endSeconds = timeStringToSeconds(scene.end_time);
      const end = endSeconds > startSeconds ? endSeconds : startSeconds + 0.001;
      let src = '';
      let baseSrc = '';
      if (scene.file) {
        baseSrc = shareToken
          ? apiClient.getSharedVideoUrl(scene.file, shareToken)
          : apiClient.getVideoUrl(scene.file);
        // Add media fragment to load only the specific time range
        // Format: #t=startSeconds,endSeconds
        src = `${baseSrc}#t=${startSeconds},${end}`;
      }
      return { startSeconds, endSeconds: end, src, baseSrc };
    }),
    [scenes, shareToken]
  );

  // Current scene metadata
  const currentMeta = sceneMeta[currentIndex];

  // Play the current video
  const playCurrentVideo = useCallback(() => {
    const video = videoRef.current;
    if (!video || !currentMeta) return;

    // Set to start time of the scene
    video.currentTime = currentMeta.startSeconds;
    video.play().catch(() => {
      // Fallback: try muted
      video.muted = true;
      setIsMuted(true);
      video.play().catch(() => { });
    });
  }, [currentMeta]);

  // Handle initial tap to unlock audio and start playback
  const handlePlayOverlayClick = useCallback(() => {
    setShowPlayOverlay(false);
    setIsMuted(false);

    const video = videoRef.current;
    if (video) {
      video.muted = false;
      playCurrentVideo();
    }
  }, [playCurrentVideo]);

  // Update video source when index changes
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !currentMeta?.src || showPlayOverlay) return;

    // Don't change during scroll animation
    if (isScrolling) return;

    // Change source and play
    if (video.src !== currentMeta.src) {
      video.src = currentMeta.src;
      video.load();
    }
    // Set to start time of the scene
    video.currentTime = currentMeta.startSeconds;
    video.muted = isMuted;

    video.play().catch(() => { });
  }, [currentIndex, currentMeta, isMuted, showPlayOverlay, isScrolling]);

  // IntersectionObserver for scroll-based slide detection
  useEffect(() => {
    if (scenes.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
            const newIndex = Number((entry.target as HTMLElement).dataset.index);
            if (newIndex !== currentIndexRef.current) {
              setCurrentIndex(newIndex);
              setVideoOffset(0);  // Reset offset when slide changes
            }
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

  // Track scroll position for smooth video following
  useEffect(() => {
    const container = containerRef.current;
    if (!container || showPlayOverlay) return;

    let scrollTimeout: ReturnType<typeof setTimeout>;

    const handleScroll = () => {
      setIsScrolling(true);
      clearTimeout(scrollTimeout);

      const scrollTop = container.scrollTop;
      const slideHeight = container.clientHeight;
      const currentSlideTop = currentIndexRef.current * slideHeight;

      // Calculate offset from current slide position
      const offset = scrollTop - currentSlideTop;
      setVideoOffset(-offset);  // Negative because we want video to move opposite to scroll

      scrollTimeout = setTimeout(() => {
        setIsScrolling(false);
        setVideoOffset(0);  // Reset offset after scroll ends

        // Ensure video is playing
        const video = videoRef.current;
        if (video && video.paused && currentMeta?.src) {
          video.play().catch(() => { });
        }
      }, 150);
    };

    container.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      container.removeEventListener('scroll', handleScroll);
      clearTimeout(scrollTimeout);
    };
  }, [showPlayOverlay, currentMeta]);

  // Handle touch events to ensure playback in user gesture context
  useEffect(() => {
    const container = containerRef.current;
    if (!container || showPlayOverlay) return;

    const handleTouchEnd = () => {
      setTimeout(() => {
        const video = videoRef.current;
        if (video && video.paused) {
          video.muted = isMuted;
          video.play().catch(() => { });
        }
      }, 200);
    };

    container.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      container.removeEventListener('touchend', handleTouchEnd);
    };
  }, [showPlayOverlay, isMuted]);

  // Handle mute toggle
  const handleMuteToggle = useCallback(() => {
    const newMuted = !isMuted;
    setIsMuted(newMuted);
    const video = videoRef.current;
    if (video) {
      video.muted = newMuted;
      if (!newMuted && video.paused) {
        video.play().catch(() => { });
      }
    }
  }, [isMuted]);

  // Handle tap on video area to toggle play/pause
  const handleVideoAreaClick = useCallback(() => {
    if (showPlayOverlay) {
      handlePlayOverlayClick();
      return;
    }
    const video = videoRef.current;
    if (video) {
      if (video.paused) {
        video.play().catch(() => { });
      } else {
        video.pause();
      }
    }
  }, [showPlayOverlay, handlePlayOverlayClick]);

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

  // Handle video time update for looping
  const handleTimeUpdate = useCallback(() => {
    const video = videoRef.current;
    if (!video || !currentMeta) return;

    // Loop back to start when reaching end time
    if (video.currentTime >= currentMeta.endSeconds) {
      video.currentTime = currentMeta.startSeconds;
      video.play().catch(() => { });
    }
  }, [currentMeta]);

  // Handle video loaded
  const handleLoadedMetadata = useCallback(() => {
    const video = videoRef.current;
    if (!video || !currentMeta) return;

    // Ensure video starts at the correct position
    if (video.currentTime < currentMeta.startSeconds || video.currentTime > currentMeta.endSeconds) {
      video.currentTime = currentMeta.startSeconds;
    }
  }, [currentMeta]);

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

  // Next scene metadata for preloading
  const nextMeta = currentIndex < sceneMeta.length - 1 ? sceneMeta[currentIndex + 1] : null;

  return (
    <div className="fixed inset-0 z-50 bg-black overflow-hidden">
      {/* Preload next video */}
      {nextMeta?.src && (
        <link rel="preload" as="video" href={nextMeta.src} />
      )}

      {/* Single video element that follows scroll */}
      <div
        className="absolute inset-0 flex items-center justify-center pointer-events-none"
        style={{
          transform: `translateY(${videoOffset}px)`,
          transition: isScrolling ? 'none' : 'transform 0.1s ease-out',
          zIndex: 5
        }}
      >
        {currentMeta?.src && (
          <video
            ref={videoRef}
            className="max-h-full max-w-full object-contain"
            src={currentMeta.src}
            playsInline
            // @ts-expect-error - webkit-playsinline is needed for iOS Safari
            webkitplaysinline=""
            muted={isMuted}
            preload="auto"
            onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={handleLoadedMetadata}
          />
        )}
      </div>

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

      {/* Controls */}
      <div className="absolute top-4 right-4 z-30 flex gap-2">
        <Button variant="ghost" size="icon" className="text-white hover:bg-white/20" onClick={handleMuteToggle}>
          {isMuted ? <VolumeX className="h-6 w-6" /> : <Volume2 className="h-6 w-6" />}
        </Button>
        <Button variant="ghost" size="icon" className="text-white hover:bg-white/20" onClick={onClose}>
          <X className="h-6 w-6" />
        </Button>
      </div>

      <div className="absolute top-4 left-4 z-30 text-white/70 text-sm">
        {currentIndex + 1} / {scenes.length}
      </div>

      {/* Scrollable slides */}
      <div
        ref={containerRef}
        className="h-full w-full overflow-y-scroll snap-y snap-mandatory scroll-smooth relative z-10"
        style={{ scrollSnapType: 'y mandatory', WebkitOverflowScrolling: 'touch' }}
        onClick={handleVideoAreaClick}
      >
        {scenes.map((scene, index) => (
          <div
            key={`${scene.video_id}-${scene.start_time}`}
            ref={(el) => { if (el) { slideRefs.current.set(index, el); } else { slideRefs.current.delete(index); } }}
            data-index={index}
            className="h-full w-full snap-start snap-always relative flex items-center justify-center"
          >
            {/* Scene info overlay */}
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-6 pb-8 pointer-events-none z-20">
              <h3 className="text-white text-lg font-semibold mb-1 line-clamp-2">{scene.title}</h3>
              <div className="flex items-center gap-4 text-white/70 text-sm">
                <span>{scene.start_time} - {scene.end_time}</span>
                <span>{t('shorts.referenceCount', { count: scene.reference_count })}</span>
              </div>
            </div>

            {/* Show message if no file */}
            {!scene.file && (
              <div className="text-white/50 z-10">{t('videos.shared.videoNoFile')}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
