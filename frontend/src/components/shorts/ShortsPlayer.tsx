import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Volume2, VolumeX, Play, MessageCircleQuestion } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { apiClient, type PopularScene } from '@/lib/api';
import { timeStringToSeconds } from '@/lib/utils/video';
import { useQuestionAnimation } from '@/hooks/useQuestionAnimation';
import { useShortsScroll } from '@/hooks/useShortsScroll';

type QuestionPhase = 'hidden' | 'center' | 'shrinking' | 'top';

interface QuestionFlashcardProps {
  question: string;
  phase: QuestionPhase;
}

function QuestionFlashcard({ question, phase }: QuestionFlashcardProps) {
  const { t } = useTranslation();

  if (phase === 'hidden' || !question) return null;

  return (
    <>
      {phase === 'center' && (
        <div
          className="absolute inset-0 z-40 flex items-center justify-center px-8"
          style={{
            animation: 'questionFadeIn 0.4s ease-out',
          }}
        >
          <div
            className="max-w-md w-full p-6 rounded-2xl text-center"
            style={{
              background: 'rgba(0, 0, 0, 0.7)',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
            }}
          >
            <div className="flex items-center justify-center gap-2 mb-3">
              <MessageCircleQuestion className="h-5 w-5 text-blue-400" />
              <span className="text-blue-400 text-sm font-medium tracking-wide uppercase">
                {t('shorts.question')}
              </span>
            </div>
            <p className="text-white text-xl font-semibold leading-relaxed">
              {question}
            </p>
          </div>
        </div>
      )}

      {(phase === 'shrinking' || phase === 'top') && (
        <div
          className="absolute left-4 right-16 z-40"
          style={{
            top: phase === 'shrinking' ? undefined : '3.5rem',
            animation: phase === 'shrinking'
              ? 'questionShrinkToTop 0.5s ease-in-out forwards'
              : undefined,
          }}
        >
          <div
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl max-w-full"
            style={{
              background: 'rgba(0, 0, 0, 0.6)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
            }}
          >
            <MessageCircleQuestion className="h-4 w-4 text-blue-400 shrink-0" />
            <p className="text-white text-sm font-medium truncate">
              {question}
            </p>
          </div>
        </div>
      )}

      <style>{`
        @keyframes questionFadeIn {
          from {
            opacity: 0;
            transform: scale(0.9);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
        @keyframes questionShrinkToTop {
          from {
            top: 50%;
            left: 50%;
            right: auto;
            transform: translate(-50%, -50%) scale(1);
            opacity: 0.8;
          }
          to {
            top: 3.5rem;
            left: 1rem;
            right: auto;
            transform: translate(0, 0) scale(1);
            opacity: 1;
          }
        }
      `}</style>
    </>
  );
}

interface ShortsPlayerProps {
  scenes: PopularScene[];
  shareToken?: string;
  onClose: () => void;
}

export function ShortsPlayer({ scenes, shareToken, onClose }: ShortsPlayerProps) {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [showPlayOverlay, setShowPlayOverlay] = useState(true);

  const { questionPhase, startQuestionAnimation } = useQuestionAnimation();

  const {
    currentIndex,
    videoOffset,
    isScrolling,
    containerRef,
    slideRefs,
    currentIndexRef,
  } = useShortsScroll({
    scenes,
    showPlayOverlay,
    onIndexChange: (newIndex) => {
      const question = scenes[newIndex]?.questions?.[0] || '';
      startQuestionAnimation(question);
    },
  });

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
        src = `${baseSrc}#t=${startSeconds},${end}`;
      }
      return { startSeconds, endSeconds: end, src, baseSrc };
    }),
    [scenes, shareToken]
  );

  const currentMeta = sceneMeta[currentIndex];
  const currentScene = scenes[currentIndex];
  const currentQuestion = currentScene?.questions?.[0] || '';

  // Play the current video
  const playCurrentVideo = useCallback(() => {
    const video = videoRef.current;
    if (!video || !currentMeta) return;

    video.currentTime = currentMeta.startSeconds;
    video.play().catch(() => {
      video.muted = true;
      setIsMuted(true);
      video.play().catch(() => { });
    });
  }, [currentMeta]);

  // Handle initial tap to unlock audio and start playback
  const handlePlayOverlayClick = useCallback(() => {
    setShowPlayOverlay(false);
    setIsMuted(false);

    const question = scenes[currentIndexRef.current]?.questions?.[0] || '';
    startQuestionAnimation(question);

    const video = videoRef.current;
    if (video) {
      video.muted = false;
      playCurrentVideo();
    }
  }, [playCurrentVideo, scenes, currentIndexRef, startQuestionAnimation]);

  // Update video source when index changes
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !currentMeta?.src || showPlayOverlay) return;
    if (isScrolling) return;

    if (video.src !== currentMeta.src) {
      video.src = currentMeta.src;
      video.load();
    }
    video.currentTime = currentMeta.startSeconds;
    video.muted = isMuted;

    video.play().catch(() => { });
  }, [currentIndex, currentMeta, isMuted, showPlayOverlay, isScrolling]);

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
  }, [showPlayOverlay, isMuted, containerRef]);

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

    if (video.currentTime >= currentMeta.endSeconds) {
      video.currentTime = currentMeta.startSeconds;
      video.play().catch(() => { });
    }
  }, [currentMeta]);

  // Handle video loaded
  const handleLoadedMetadata = useCallback(() => {
    const video = videoRef.current;
    if (!video || !currentMeta) return;

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

  return (
    <div className="fixed inset-0 z-50 bg-black overflow-hidden">
      <QuestionFlashcard question={currentQuestion} phase={questionPhase} />

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
      <div className="absolute top-4 right-4 z-50 flex gap-2">
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
            <div className="absolute bottom-0 left-0 right-0 bg-linear-to-t from-black/80 to-transparent p-6 pb-8 pointer-events-none z-20">
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
