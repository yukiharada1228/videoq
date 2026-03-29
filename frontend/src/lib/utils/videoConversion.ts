import type { VideoInGroup, VideoList } from '@/lib/api';

export interface SelectedVideo {
  id: number;
  title: string;
  description: string;
  file: string | null;
  source_type: 'uploaded' | 'youtube';
  source_url?: string | null;
  youtube_video_id?: string | null;
  youtube_embed_url?: string | null;
  status: string;
}

/**
 * Common function to convert VideoInGroup to SelectedVideo
 */
export function convertVideoInGroupToSelectedVideo(video: VideoInGroup): SelectedVideo {
  return {
    id: video.id,
    title: video.title,
    description: video.description,
    file: video.file,
    source_type: video.source_type,
    source_url: video.source_url,
    youtube_video_id: video.youtube_video_id,
    youtube_embed_url: video.youtube_embed_url,
    status: video.status,
  };
}

/**
 * Common function to convert VideoList to SelectedVideo
 */
export function convertVideoListToSelectedVideo(video: VideoList): SelectedVideo {
  return {
    id: video.id,
    title: video.title,
    description: video.description,
    file: video.file,
    source_type: video.source_type,
    source_url: video.source_url,
    youtube_video_id: video.youtube_video_id,
    youtube_embed_url: video.youtube_embed_url,
    status: video.status,
  };
}

/**
 * Common function to create Set from array of video IDs
 */
export function createVideoIdSet(videoIds: number[]): Set<number> {
  return new Set(videoIds);
}

/**
 * Common function to extract array of IDs from array of videos
 */
export function extractVideoIds(videos: VideoInGroup[] | VideoList[]): number[] {
  return videos.map(video => video.id);
}
