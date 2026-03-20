'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import type { VideoInGroup, VideoList as VideoListType } from '@/lib/api';
import { apiClient } from '@/lib/api';
import { formatDate } from '@/lib/utils/video';
import { StatusBadge } from '@/components/common/StatusBadge';
import { Link } from '@/lib/i18n';
import { useParams } from 'react-router-dom';
import { TagBadge } from './TagBadge';

interface VideoCardProps {
  video: VideoListType | VideoInGroup;
  showLink?: boolean;
  className?: string;
  onClick?: () => void;
}

/**
 * Custom hook that uses IntersectionObserver to detect when an element
 * enters the viewport. Once visible, stays true (no unloading on scroll-out).
 */
function useInView(rootMargin = '200px') {
  const ref = useRef<HTMLDivElement>(null);
  const [isInView, setIsInView] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element || isInView) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true);
        }
      },
      { rootMargin }
    );

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [isInView, rootMargin]);

  return { ref, isInView };
}

/**
 * Placeholder shown while the video card is outside the viewport.
 * Lightweight SVG icon on a gradient background — no network requests.
 */
function VideoPlaceholder() {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-gray-800 to-gray-900">
      <svg className="w-10 h-10 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
      </svg>
    </div>
  );
}

export function VideoCard({ video, showLink = true, className = '', onClick }: VideoCardProps) {
  const { locale } = useParams<{ locale: string }>();
  const { ref: cardRef, isInView } = useInView('200px');

  const handleMouseEnter = useCallback((e: React.MouseEvent<HTMLVideoElement>) => {
    const vid = e.currentTarget;
    vid.play().catch(() => { });
  }, []);

  const handleMouseLeave = useCallback((e: React.MouseEvent<HTMLVideoElement>) => {
    const vid = e.currentTarget;
    vid.pause();
    vid.currentTime = 0;
  }, []);

  const cardContent = (
    <div className={`h-full flex flex-col bg-white rounded-2xl shadow-[0_4px_20px_rgba(28,25,23,0.04)] hover:shadow-[0_8px_30px_rgba(28,25,23,0.10)] transition-all duration-200 cursor-pointer overflow-hidden group ${className}`}>
      {/* Thumbnail */}
      <div ref={cardRef} className="relative w-full aspect-video bg-[#1a1c1c] overflow-hidden">
        {video.file ? (
          <>
            {isInView ? (
              <video
                className="w-full h-full object-cover"
                muted
                playsInline
                preload="metadata"
                src={apiClient.getVideoUrl(video.file)}
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
              />
            ) : (
              <VideoPlaceholder />
            )}
          </>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-[#f2f4ef] to-[#e7e9e4]">
            <svg className="w-12 h-12 text-[#becabc]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </div>
        )}
        <div className="absolute top-2 right-2 z-10">
          <StatusBadge status={video.status} size="xs" />
        </div>
      </div>

      <div className="p-2 md:p-3 space-y-1.5 flex flex-col flex-1">
        <h3 className="font-semibold text-sm text-[#191c19] line-clamp-2 group-hover:text-[#00652c] transition-colors leading-tight">
          {video.title}
        </h3>

        <div className="flex items-center text-xs text-[#6f7a6e]">
          <svg className="w-3 h-3 mr-1 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {formatDate(video.uploaded_at, 'full', locale || 'en')}
        </div>

        {'tags' in video && video.tags && video.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-1">
            {video.tags.map((tag) => (
              <TagBadge key={tag.id} tag={tag} size="sm" />
            ))}
          </div>
        )}
      </div>
    </div>
  );

  if (showLink && 'id' in video) {
    return (
      <Link href={`/videos/${video.id}`}>
        {cardContent}
      </Link>
    );
  }

  if (onClick) {
    return (
      <div onClick={onClick}>
        {cardContent}
      </div>
    );
  }

  return cardContent;
}
