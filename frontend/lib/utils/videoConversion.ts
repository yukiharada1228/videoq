import { VideoInGroup, VideoList } from '@/lib/api';

export interface SelectedVideo {
  id: number;
  title: string;
  description: string;
  file: string;
  status: string;
}

/**
 * VideoInGroupからSelectedVideoに変換する共通関数（DRY原則・N+1問題対策）
 */
export function convertVideoInGroupToSelectedVideo(video: VideoInGroup): SelectedVideo {
  return {
    id: video.id,
    title: video.title,
    description: video.description,
    file: video.file,
    status: video.status,
  };
}

/**
 * VideoListからSelectedVideoに変換する共通関数（DRY原則・N+1問題対策）
 */
export function convertVideoListToSelectedVideo(video: VideoList): SelectedVideo {
  return {
    id: video.id,
    title: video.title,
    description: video.description,
    file: video.file,
    status: video.status,
  };
}

/**
 * 動画IDの配列からSetを作成する共通関数（N+1問題対策）
 */
export function createVideoIdSet(videoIds: number[]): Set<number> {
  return new Set(videoIds);
}

/**
 * 動画配列からIDの配列を抽出する共通関数（N+1問題対策）
 */
export function extractVideoIds(videos: VideoInGroup[] | VideoList[]): number[] {
  return videos.map(video => video.id);
}
