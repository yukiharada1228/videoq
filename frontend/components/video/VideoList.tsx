'use client';

import { VideoList as VideoListType } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDistanceToNow } from 'date-fns';
import { ja } from 'date-fns/locale';
import Link from 'next/link';
import { getStatusBadgeClassName, getStatusLabel } from '@/lib/utils/video';

interface VideoListProps {
  videos: VideoListType[];
}

export function VideoList({ videos }: VideoListProps) {
  if (videos.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <div className="space-y-2">
            <p className="text-gray-500">アップロードされた動画はありません</p>
            <p className="text-sm text-gray-400">上部の「動画をアップロード」ボタンから動画を追加できます</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {videos.map((video) => (
        <Link key={video.id} href={`/videos/${video.id}`}>
          <Card className="hover:shadow-md transition-shadow cursor-pointer">
            <CardHeader>
              <div className="flex items-start justify-between">
                <CardTitle className="text-lg">{video.title}</CardTitle>
                <span className={getStatusBadgeClassName(video.status, 'sm')}>
                  {getStatusLabel(video.status)}
                </span>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600 text-sm mb-2">
                {video.description || '説明なし'}
              </p>
              <p className="text-xs text-gray-400">
                {formatDistanceToNow(new Date(video.uploaded_at), { addSuffix: true, locale: ja })}
              </p>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}

