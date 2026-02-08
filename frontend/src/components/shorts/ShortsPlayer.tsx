import { useEffect, useRef, useState } from 'react';
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

const PRELOAD_RANGE = 1;

export function ShortsPlayer({ scenes, shareToken, onClose }: ShortsPlayerProps) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRefs = useRef(new Map<number, HTMLVideoElement>());
  const slideRefs = useRef(new Map<number, HTMLDivElement>());
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isMuted, setIsMuted] = useState(false);

  const getVideoSrc = (scene: PopularScene) => {
    if (!scene.file) return '';
    const baseUrl = shareToken
      ? apiClient.getSharedVideoUrl(scene.file, shareToken)
      : apiClient.getVideoUrl(scene.file);
    return `${baseUrl}#t=${timeStringToSeconds(scene.start_time)},${timeStringToSeconds(scene.end_time)}`;
  };

  // IntersectionObserver for scroll-based slide detection
  useEffect(() => {
    if (scenes.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
            setCurrentIndex(Number((entry.target as HTMLElement).dataset.index));
          }
        }
      },
      { threshold: 0.5, root: containerRef.current }
    );
    requestAnimationFrame(() => slideRefs.current.forEach((s) => observer.observe(s)));
    return () => observer.disconnect();
  }, [scenes.length]);

  // Play/pause based on current slide
  useEffect(() => {
    videoRefs.current.forEach((video, i) => {
      if (i !== currentIndex) video.pause();
    });
    const video = videoRefs.current.get(currentIndex);
    if (video) {
      video.currentTime = timeStringToSeconds(scenes[currentIndex].start_time);
      void video.play();
    }
  }, [currentIndex, scenes]);

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
      <div className="absolute top-4 right-4 z-10 flex gap-2">
        <Button variant="ghost" size="icon" className="text-white hover:bg-white/20" onClick={() => setIsMuted((m) => !m)}>
          {isMuted ? <VolumeX className="h-6 w-6" /> : <Volume2 className="h-6 w-6" />}
        </Button>
        <Button variant="ghost" size="icon" className="text-white hover:bg-white/20" onClick={onClose}>
          <X className="h-6 w-6" />
        </Button>
      </div>

      <div className="absolute top-4 left-4 z-10 text-white/70 text-sm">
        {currentIndex + 1} / {scenes.length}
      </div>

      <div ref={containerRef} className="h-full w-full overflow-y-scroll snap-y snap-mandatory" style={{ scrollSnapType: 'y mandatory' }}>
        {scenes.map((scene, index) => {
          const shouldLoad = Math.abs(index - currentIndex) <= PRELOAD_RANGE;

          return (
            <div
              key={`${scene.video_id}-${scene.start_time}`}
              ref={(el) => { el ? slideRefs.current.set(index, el) : slideRefs.current.delete(index); }}
              data-index={index}
              className="h-full w-full snap-start snap-always relative flex items-center justify-center"
            >
              {scene.file ? (
                shouldLoad ? (
                  <video
                    ref={(el) => { el ? videoRefs.current.set(index, el) : videoRefs.current.delete(index); }}
                    className="max-h-full max-w-full object-contain"
                    src={getVideoSrc(scene)}
                    playsInline
                    muted={isMuted}
                    preload={index === currentIndex ? 'auto' : 'metadata'}
                    onLoadedMetadata={(e) => { e.currentTarget.currentTime = timeStringToSeconds(scene.start_time); }}
                    onTimeUpdate={(e) => {
                      const video = e.currentTarget;
                      if (video.currentTime >= timeStringToSeconds(scene.end_time)) {
                        video.currentTime = timeStringToSeconds(scene.start_time);
                        void video.play();
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
