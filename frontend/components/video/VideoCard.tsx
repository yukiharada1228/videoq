'use client';

import { VideoList as VideoListType, VideoInGroup } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { getStatusBadgeClassName, getStatusLabel, formatDate } from '@/lib/utils/video';
import Link from 'next/link';

interface VideoCardProps {
  video: VideoListType | VideoInGroup;
  showLink?: boolean;
  className?: string;
  onClick?: () => void;
}

export function VideoCard({ video, showLink = true, className = '', onClick }: VideoCardProps) {
  const cardContent = (
    <Card className={`h-full flex flex-col hover:shadow-md transition-all duration-200 cursor-pointer border-0 shadow-sm hover:shadow-lg overflow-hidden group ${className}`}>
      {/* サムネイル */}
      <div className="relative w-full aspect-video bg-gray-900 overflow-hidden group">
        {video.file ? (
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
            {/* ホバー時のオーバーレイ（薄い） */}
            <div className="absolute inset-0 bg-black opacity-0 group-hover:opacity-20 transition-opacity pointer-events-none"></div>
          </>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
            <svg className="w-12 h-12 text-blue-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </div>
        )}
        {/* ステータスバッジ（上に表示） */}
        <div className="absolute top-2 right-2 z-10">
          <span className={getStatusBadgeClassName(video.status, 'xs')}>
            {getStatusLabel(video.status)}
          </span>
        </div>
      </div>

      <CardContent className="p-2 md:p-3 space-y-1 flex flex-col h-full">
        {/* タイトル */}
        <div className="flex-1 min-h-0">
          <h3 className="font-medium text-sm text-gray-900 line-clamp-2 group-hover:text-blue-600 transition-colors leading-tight">
            {video.title}
          </h3>
        </div>

        {/* 日時 */}
        <div className="flex items-center text-xs text-gray-400 flex-shrink-0">
          <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {formatDate(video.uploaded_at)}
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
