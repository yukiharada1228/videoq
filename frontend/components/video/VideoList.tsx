'use client';

import { VideoList as VideoListType } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { VideoCard } from './VideoCard';
import { useTranslation } from 'react-i18next';

interface VideoListProps {
  videos: VideoListType[];
}

export function VideoList({ videos }: VideoListProps) {
  const { t } = useTranslation();

  if (videos.length === 0) {
    return (
      <Card>
        <CardContent className="py-16 text-center">
          <div className="space-y-3">
            <div className="mx-auto w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center">
              <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </div>
            <p className="text-gray-500 text-lg font-medium">{t('videos.list.noVideos')}</p>
            <p className="text-sm text-gray-400">{t('videos.list.noVideosHint')}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-5 items-stretch">
      {videos.map((video) => (
        <VideoCard key={video.id} video={video} />
      ))}
    </div>
  );
}

