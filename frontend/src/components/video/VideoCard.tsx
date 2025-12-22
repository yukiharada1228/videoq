'use client';

import type { VideoInGroup, VideoList as VideoListType } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { getStatusBadgeClassName, getStatusLabel, formatDate } from '@/lib/utils/video';
import { Link } from '@/lib/i18n';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';

interface VideoCardProps {
  video: VideoListType | VideoInGroup;
  showLink?: boolean;
  className?: string;
  onClick?: () => void;
}

export function VideoCard({ video, showLink = true, className = '', onClick }: VideoCardProps) {
  const { locale } = useParams<{ locale: string }>();
  const { t } = useTranslation();

  const cardContent = (
    <Card className={`h-full flex flex-col hover:shadow-md transition-all duration-200 cursor-pointer border-0 shadow-sm hover:shadow-lg overflow-hidden group ${className}`}>
      {/* Thumbnail */}
      <div className="relative w-full aspect-video bg-gray-900 overflow-hidden group">
        {video.external_id ? (
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-gray-900 to-gray-700 px-3">
            <div className="text-center">
              <div className="text-xs text-gray-300 mb-1">external_id</div>
              <div className="text-sm font-medium text-white break-all line-clamp-3">
                {video.external_id}
              </div>
            </div>
          </div>
        ) : video.file ? (
          <>
            <video
              className="w-full h-full object-cover"
              muted
              playsInline
              preload="metadata"
              src={video.file}
              onMouseEnter={(e) => {
                const video = e.currentTarget;
                video.play().catch(() => {});
              }}
              onMouseLeave={(e) => {
                const video = e.currentTarget;
                video.pause();
                video.currentTime = 0;
              }}
            />
            {/* Overlay on hover (light) */}
            <div className="absolute inset-0 bg-black opacity-0 group-hover:opacity-20 transition-opacity pointer-events-none"></div>
          </>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
            <svg className="w-12 h-12 text-blue-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </div>
        )}
        {/* Status badge (displayed on top) */}
        <div className="absolute top-2 right-2 z-10">
          <span className={getStatusBadgeClassName(video.status, 'xs')}>
            {t(getStatusLabel(video.status))}
          </span>
        </div>
      </div>

      <CardContent className="p-2 md:p-3 space-y-1.5 flex flex-col">
        {/* Title */}
        <div>
          <h3 className="font-medium text-sm text-gray-900 line-clamp-2 group-hover:text-blue-600 transition-colors leading-tight">
            {video.title}
          </h3>
        </div>

        {/* Date and time */}
        <div className="flex items-center text-xs text-gray-500">
          <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {formatDate(video.uploaded_at, 'full', locale || 'en')}
        </div>
      </CardContent>
    </Card>
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
