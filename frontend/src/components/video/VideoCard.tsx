'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { VideoInGroup, VideoList as VideoListType } from '@/lib/api';
import { apiClient } from '@/lib/api';
import { formatDate, getStatusLabel } from '@/lib/utils/video';
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

const STATUS_COLORS: Record<string, string> = {
  completed: 'bg-[#d3ffd5] text-[#006d30]',
  processing: 'bg-[#ffdcc3] text-[#2f1500]',
  indexing: 'bg-[#ffdcc3] text-[#2f1500]',
  uploading: 'bg-[#ffdcc3] text-[#2f1500]',
  pending: 'bg-stone-100 text-stone-600',
  error: 'bg-red-100 text-red-700',
};

function StatusIcon({ status }: { status: string }) {
  if (status === 'completed') {
    return (
      <svg className="w-3.5 h-3.5 mr-1 shrink-0" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
      </svg>
    );
  }
  if (status === 'processing' || status === 'indexing' || status === 'uploading') {
    return (
      <svg className="w-3.5 h-3.5 mr-1 shrink-0" viewBox="0 0 24 24" fill="currentColor">
        <path d="M6 2v6l2.5 2.5L6 13v6l6-2 6 2v-6l-2.5-2.5L18 8V2l-6 2-6-2z"/>
      </svg>
    );
  }
  if (status === 'error') {
    return (
      <svg className="w-3.5 h-3.5 mr-1 shrink-0" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
      </svg>
    );
  }
  return (
    <svg className="w-3.5 h-3.5 mr-1 shrink-0" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
    </svg>
  );
}

function StatusBadgeWithIcon({ status, label }: { status: string; label: string }) {
  const colorClass = STATUS_COLORS[status] ?? 'bg-stone-100 text-stone-600';
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${colorClass}`}>
      <StatusIcon status={status} />
      {label}
    </span>
  );
}

export function VideoCard({ video, showLink = true, className = '', onClick }: VideoCardProps) {
  const { locale } = useParams<{ locale: string }>();
  const { t } = useTranslation();
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
    <div className={`h-full flex flex-col bg-white rounded-2xl shadow-[0_4px_20px_rgba(28,25,23,0.06)] overflow-hidden group hover:-translate-y-1 transition-transform duration-200 cursor-pointer ${className}`}>
      {/* Thumbnail */}
      <div ref={cardRef} className="relative w-full aspect-video bg-stone-200 overflow-hidden">
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
      </div>

      <div className="p-4 md:p-5 flex flex-col flex-1 gap-2">
        <div className="flex items-center gap-2">
          <StatusBadgeWithIcon status={video.status} label={t(getStatusLabel(video.status))} />
        </div>

        <h3 className="font-bold text-base text-[#191c19] truncate group-hover:text-[#00652c] transition-colors leading-tight">
          {video.title}
        </h3>

        <div className="flex items-center text-xs text-[#6f7a6e]">
          <svg className="w-3.5 h-3.5 mr-1 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          {formatDate(video.uploaded_at, 'full', locale || 'en')}
        </div>

        {'tags' in video && video.tags && video.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-0.5">
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
