import { http, HttpResponse } from 'msw';
import type { VideoList } from '@/lib/api';
import type { VideoStatus } from '@videoq/trpc';
import { englishTags, longTag, tags } from './tags';
import previewUrl from './media/preview.webm?url&no-inline';
import thumbnail from './media/thumbnail.svg?raw';

// An absolute same-origin URL bypasses the application's backend URL resolver.
export const localVideoUrl = new URL(previewUrl, window.location.href).href;
export const youtubeFixtureId = 'storybook01';
export const youtubeThumbnailUrl = `https://img.youtube.com/vi/${youtubeFixtureId}/hqdefault.jpg`;
export const mediaHandlers = [
  http.get(youtubeThumbnailUrl, () => new HttpResponse(thumbnail, {
    headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-store' },
  })),
];

export const videoStatuses: VideoStatus[] = ['uploading', 'pending', 'processing', 'indexing', 'completed', 'error'];

export const uploadedVideo: VideoList = {
  id: 7,
  title: '線形代数 第3回：回転行列',
  description: '回転行列と座標変換の関係を解説する講義です。',
  uploaded_at: '2026-09-01T09:00:00Z',
  status: 'completed',
  source_type: 'uploaded',
  file: localVideoUrl,
  tags,
};

export const youtubeVideo: VideoList = {
  ...uploadedVideo,
  id: 8,
  title: '座標変換の具体例',
  source_type: 'youtube',
  youtube_video_id: youtubeFixtureId,
  file: null,
};

export const longVideo: VideoList = {
  ...uploadedVideo,
  id: 9,
  title: '線形代数の基礎から学ぶ回転行列と座標変換：具体的な計算例と演習問題を通じて理解を深める特別講義',
  tags: [...tags, longTag],
};

export const englishVideo: VideoList = {
  ...uploadedVideo,
  title: 'Linear algebra: rotation matrices and coordinate transformations',
  tags: englishTags,
};

export const mixedVideos: VideoList[] = videoStatuses.map((status, index) => ({
  ...(index % 2 === 0 ? uploadedVideo : youtubeVideo),
  id: index + 20,
  title: `第${index + 1}回：${uploadedVideo.title}`,
  status,
}));
