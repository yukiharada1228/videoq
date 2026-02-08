import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Volume2, VolumeX, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { apiClient, type PopularScene } from '@/lib/api';
import { timeStringToSeconds } from '@/lib/utils/video';

interface ShortsPlayerProps {
  scenes: PopularScene[];
  shareToken?: string;
  onClose: () => void;
}

/** Number of adjacent videos to preload in each direction */
const PRELOAD_RANGE = 1;

export function ShortsPlayer({ scenes, shareToken, onClose }: ShortsPlayerProps) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const videoElementsRef = useRef<Map<number, HTMLVideoElement>>(new Map());
  const slideRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isMuted, setIsMuted] = useState(false);

  const getVideoSrc = useCallback((scene: PopularScene): string => {
    if (!scene.file) return '';
    const baseUrl = shareToken
      ? apiClient.getSharedVideoUrl(scene.file, shareToken)
      : apiClient.getVideoUrl(scene.file);
    // Use media fragment to limit buffering to the clip range
    const start = timeStringToSeconds(scene.start_time);
    const end = timeStringToSeconds(scene.end_time);
    return `${baseUrl}#t=${start},${end}`;
  }, [shareToken]);

  const handleTimeUpdate = useCallback((scene: PopularScene, video: HTMLVideoElement) => {
    const endSeconds = timeStringToSeconds(scene.end_time);
    const startSeconds = timeStringToSeconds(scene.start_time);

    if (video.currentTime >= endSeconds) {
      video.currentTime = startSeconds;
    }
  }, []);

  const handleLoadedMetadata = useCallback((scene: PopularScene, video: HTMLVideoElement) => {
    const startSeconds = timeStringToSeconds(scene.start_time);
    video.currentTime = startSeconds;
  }, []);

  const playVideo = useCallback((index: number) => {
    const video = videoElementsRef.current.get(index);
    if (video) {
      const scene = scenes[index];
      const startSeconds = timeStringToSeconds(scene.start_time);
      video.currentTime = startSeconds;
      void video.play();
    }
  }, [scenes]);

  // Set up IntersectionObserver on slide containers
  useEffect(() => {
    if (scenes.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const index = Number((entry.target as HTMLElement).dataset.index);

          if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
            setCurrentIndex(index);
          }
        });
      },
      {
        threshold: 0.5,
        root: containerRef.current,
      }
    );

    // Observe after DOM is committed
    requestAnimationFrame(() => {
      slideRefs.current.forEach((slide) => {
        observer.observe(slide);
      });
    });

    return () => {
      observer.disconnect();
    };
  }, [scenes.length]);

  // Play/pause based on currentIndex changes
  useEffect(() => {
    // Pause all videos except current
    videoElementsRef.current.forEach((video, i) => {
      if (i !== currentIndex) {
        video.pause();
      }
    });
    // Play current video
    playVideo(currentIndex);
  }, [currentIndex, playVideo]);

  // Update muted state for loaded videos
  useEffect(() => {
    videoElementsRef.current.forEach((video) => {
      video.muted = isMuted;
    });
  }, [isMuted]);

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => !prev);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  const setVideoRef = useCallback((index: number) => (el: HTMLVideoElement | null) => {
    if (el) {
      videoElementsRef.current.set(index, el);
    } else {
      videoElementsRef.current.delete(index);
    }
  }, []);

  const setSlideRef = useCallback((index: number) => (el: HTMLDivElement | null) => {
    if (el) {
      slideRefs.current.set(index, el);
    } else {
      slideRefs.current.delete(index);
    }
  }, []);

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
      <div className="absolute top-4 right-4 z-10 flex gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="text-white hover:bg-white/20"
          onClick={toggleMute}
        >
          {isMuted ? <VolumeX className="h-6 w-6" /> : <Volume2 className="h-6 w-6" />}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="text-white hover:bg-white/20"
          onClick={onClose}
        >
          <X className="h-6 w-6" />
        </Button>
      </div>

      <div className="absolute top-4 left-4 z-10 text-white/70 text-sm">
        {currentIndex + 1} / {scenes.length}
      </div>

      <div
        ref={containerRef}
        className="h-full w-full overflow-y-scroll snap-y snap-mandatory"
        style={{ scrollSnapType: 'y mandatory' }}
      >
        {scenes.map((scene, index) => {
          const shouldLoad = Math.abs(index - currentIndex) <= PRELOAD_RANGE;

          return (
            <div
              key={`${scene.video_id}-${scene.start_time}`}
              ref={setSlideRef(index)}
              data-index={index}
              className="h-full w-full snap-start snap-always relative flex items-center justify-center"
            >
              {scene.file ? (
                shouldLoad ? (
                  <video
                    ref={setVideoRef(index)}
                    data-index={index}
                    className="max-h-full max-w-full object-contain"
                    src={getVideoSrc(scene)}
                    playsInline
                    muted={isMuted}
                    loop={false}
                    preload={index === currentIndex ? 'auto' : 'metadata'}
                    onLoadedMetadata={(e) => handleLoadedMetadata(scene, e.currentTarget)}
                    onTimeUpdate={(e) => handleTimeUpdate(scene, e.currentTarget)}
                  />
                ) : (
                  <div className="flex items-center justify-center text-white/40">
                    <Loader2 className="h-8 w-8 animate-spin" />
                  </div>
                )
              ) : (
                <div className="text-white/50">
                  {t('videos.shared.videoNoFile')}
                </div>
              )}

              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-6 pb-8">
                <h3 className="text-white text-lg font-semibold mb-1 line-clamp-2">
                  {scene.title}
                </h3>
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
