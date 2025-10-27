'use client';

import { VideoList as VideoListType } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
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
        <CardContent className="py-16 text-center">
          <div className="space-y-3">
            <div className="mx-auto w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center">
              <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </div>
            <p className="text-gray-500 text-lg font-medium">動画がありません</p>
            <p className="text-sm text-gray-400">上部の「動画をアップロード」ボタンから動画を追加できます</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {videos.map((video) => (
        <Link key={video.id} href={`/videos/${video.id}`}>
          <Card className="hover:shadow-lg transition-all duration-300 cursor-pointer border border-gray-200 hover:border-blue-300 overflow-hidden group">
            {/* サムネイル */}
            <div className="relative w-full h-48 bg-gradient-to-br from-blue-50 to-indigo-100 overflow-hidden">
              <div className="absolute inset-0 flex items-center justify-center">
                <svg className="w-20 h-20 text-blue-300 group-hover:text-blue-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </div>
              {/* ステータスバッジ（上に表示） */}
              <div className="absolute top-3 right-3">
                <span className={getStatusBadgeClassName(video.status, 'sm')}>
                  {getStatusLabel(video.status)}
                </span>
              </div>
            </div>

            <CardContent className="p-4 space-y-3">
              {/* タイトル */}
              <div>
                <h3 className="font-semibold text-gray-900 line-clamp-2 group-hover:text-blue-600 transition-colors">
                  {video.title}
                </h3>
              </div>

              {/* 説明 */}
              <p className="text-sm text-gray-600 line-clamp-2">
                {video.description || '説明なし'}
              </p>

              {/* 日時 */}
              <div className="flex items-center text-xs text-gray-400 pt-2 border-t border-gray-100">
                <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {formatDistanceToNow(new Date(video.uploaded_at), { addSuffix: true, locale: ja })}
              </div>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}

