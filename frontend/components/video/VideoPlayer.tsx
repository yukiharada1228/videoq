'use client';

import React, { useState, useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Play, Pause, Volume2, VolumeX, Maximize, Minimize } from 'lucide-react';
import { cn } from '@/lib/utils';

interface VideoPlayerProps {
  src: string;
  onCanPlay?: (event: React.SyntheticEvent<HTMLVideoElement>) => void;
  onLoadedMetadata?: (event: React.SyntheticEvent<HTMLVideoElement>) => void;
  className?: string;
}

export interface VideoPlayerHandle {
  videoElement: HTMLVideoElement | null;
  play: () => Promise<void>;
  pause: () => void;
  setCurrentTime: (time: number) => void;
}

const VideoPlayer = forwardRef<VideoPlayerHandle, VideoPlayerProps>(
  ({ src, onCanPlay, onLoadedMetadata, className }, ref) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [volume, setVolume] = useState(1);
    const [isMuted, setIsMuted] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [showControls, setShowControls] = useState(true);
    const [isHovering, setIsHovering] = useState(false);
    const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // Expose methods via ref
    useImperativeHandle(ref, () => ({
      videoElement: videoRef.current,
      play: async () => {
        if (videoRef.current) {
          await videoRef.current.play();
          setIsPlaying(true);
        }
      },
      pause: () => {
        if (videoRef.current) {
          videoRef.current.pause();
          setIsPlaying(false);
        }
      },
      setCurrentTime: (time: number) => {
        if (videoRef.current) {
          videoRef.current.currentTime = time;
          setCurrentTime(time);
        }
      },
    }));

    // Format time helper
    const formatTime = (seconds: number): string => {
      if (isNaN(seconds)) return '0:00';
      const hrs = Math.floor(seconds / 3600);
      const mins = Math.floor((seconds % 3600) / 60);
      const secs = Math.floor(seconds % 60);
      
      if (hrs > 0) {
        return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
      }
      return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    // Toggle play/pause
    const togglePlayPause = () => {
      if (videoRef.current) {
        if (isPlaying) {
          videoRef.current.pause();
        } else {
          videoRef.current.play();
        }
      }
    };

    // Handle time update
    const handleTimeUpdate = () => {
      if (videoRef.current) {
        setCurrentTime(videoRef.current.currentTime);
      }
    };

    // Handle progress change
    const handleProgressChange = (value: number[]) => {
      if (videoRef.current) {
        const newTime = (value[0] / 100) * duration;
        videoRef.current.currentTime = newTime;
        setCurrentTime(newTime);
      }
    };

    // Handle volume change
    const handleVolumeChange = (value: number[]) => {
      if (videoRef.current) {
        const newVolume = value[0] / 100;
        videoRef.current.volume = newVolume;
        setVolume(newVolume);
        setIsMuted(newVolume === 0);
      }
    };

    // Toggle mute
    const toggleMute = () => {
      if (videoRef.current) {
        if (isMuted) {
          videoRef.current.volume = volume > 0 ? volume : 0.5;
          setVolume(videoRef.current.volume);
          setIsMuted(false);
        } else {
          videoRef.current.volume = 0;
          setVolume(0);
          setIsMuted(true);
        }
      }
    };

    // Toggle fullscreen
    const toggleFullscreen = () => {
      if (!containerRef.current) return;

      if (!isFullscreen) {
        if (containerRef.current.requestFullscreen) {
          containerRef.current.requestFullscreen();
        }
      } else {
        if (document.exitFullscreen) {
          document.exitFullscreen();
        }
      }
    };

    // Handle loaded metadata
    const handleLoadedMetadata = (e: React.SyntheticEvent<HTMLVideoElement>) => {
      if (videoRef.current) {
        setDuration(videoRef.current.duration);
      }
      onLoadedMetadata?.(e);
    };

    // Handle can play
    const handleCanPlay = (e: React.SyntheticEvent<HTMLVideoElement>) => {
      onCanPlay?.(e);
    };

    // Handle play/pause events
    useEffect(() => {
      const video = videoRef.current;
      if (!video) return;

      const handlePlay = () => setIsPlaying(true);
      const handlePause = () => setIsPlaying(false);
      const handleVolumeChange = () => {
        if (video) {
          setVolume(video.volume);
          setIsMuted(video.muted || video.volume === 0);
        }
      };

      video.addEventListener('play', handlePlay);
      video.addEventListener('pause', handlePause);
      video.addEventListener('volumechange', handleVolumeChange);
      video.addEventListener('timeupdate', handleTimeUpdate);

      return () => {
        video.removeEventListener('play', handlePlay);
        video.removeEventListener('pause', handlePause);
        video.removeEventListener('volumechange', handleVolumeChange);
        video.removeEventListener('timeupdate', handleTimeUpdate);
      };
    }, []);

    // Handle fullscreen change
    useEffect(() => {
      const handleFullscreenChange = () => {
        setIsFullscreen(!!document.fullscreenElement);
      };

      document.addEventListener('fullscreenchange', handleFullscreenChange);
      return () => {
        document.removeEventListener('fullscreenchange', handleFullscreenChange);
      };
    }, []);

    // Handle controls visibility
    useEffect(() => {
      if (isHovering || !isPlaying) {
        setShowControls(true);
        if (controlsTimeoutRef.current) {
          clearTimeout(controlsTimeoutRef.current);
        }
      } else if (isPlaying) {
        controlsTimeoutRef.current = setTimeout(() => {
          setShowControls(false);
        }, 3000);
      }

      return () => {
        if (controlsTimeoutRef.current) {
          clearTimeout(controlsTimeoutRef.current);
        }
      };
    }, [isHovering, isPlaying]);

    const progressPercentage = duration > 0 ? (currentTime / duration) * 100 : 0;
    const volumePercentage = volume * 100;

    return (
      <div
        ref={containerRef}
        className={cn('relative w-full h-full bg-black rounded overflow-hidden group', className)}
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
        onMouseMove={() => setIsHovering(true)}
      >
        <video
          ref={videoRef}
          src={src}
          className="w-full h-full object-contain"
          onLoadedMetadata={handleLoadedMetadata}
          onCanPlay={handleCanPlay}
          onTimeUpdate={handleTimeUpdate}
          playsInline
        />

        {/* Controls overlay */}
        <div
          className={cn(
            'absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent transition-opacity duration-300',
            showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
          )}
        >
          {/* Bottom controls */}
          <div className="absolute bottom-0 left-0 right-0 p-3 md:p-4 space-y-3">
            {/* Progress bar */}
            <div className="w-full">
              <Slider
                value={[progressPercentage]}
                onValueChange={handleProgressChange}
                max={100}
                step={0.1}
                className="w-full cursor-pointer"
              />
            </div>

            {/* Control buttons */}
            <div className="flex items-center justify-between gap-2 md:gap-4">
              <div className="flex items-center gap-2 md:gap-3 flex-1 min-w-0">
                {/* Play/Pause button */}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={togglePlayPause}
                  className="text-white hover:bg-white/20 h-8 w-8 md:h-10 md:w-10"
                >
                  {isPlaying ? (
                    <Pause className="h-4 w-4 md:h-5 md:w-5" />
                  ) : (
                    <Play className="h-4 w-4 md:h-5 md:w-5" />
                  )}
                </Button>

                {/* Time display */}
                <span className="text-white text-xs md:text-sm font-mono whitespace-nowrap">
                  {formatTime(currentTime)} / {formatTime(duration)}
                </span>

                {/* Volume control */}
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={toggleMute}
                    className="text-white hover:bg-white/20 h-8 w-8 md:h-10 md:w-10"
                  >
                    {isMuted ? (
                      <VolumeX className="h-4 w-4 md:h-5 md:w-5" />
                    ) : (
                      <Volume2 className="h-4 w-4 md:h-5 md:w-5" />
                    )}
                  </Button>
                  <div className="hidden md:flex items-center gap-2 flex-1 min-w-0 max-w-[120px]">
                    <Slider
                      value={[volumePercentage]}
                      onValueChange={handleVolumeChange}
                      max={100}
                      step={1}
                      className="w-full cursor-pointer"
                    />
                  </div>
                </div>
              </div>

              {/* Fullscreen button */}
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleFullscreen}
                className="text-white hover:bg-white/20 h-8 w-8 md:h-10 md:w-10"
              >
                {isFullscreen ? (
                  <Minimize className="h-4 w-4 md:h-5 md:w-5" />
                ) : (
                  <Maximize className="h-4 w-4 md:h-5 md:w-5" />
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }
);

VideoPlayer.displayName = 'VideoPlayer';

export { VideoPlayer };

