import { VideoInGroup, VideoList } from '@/lib/api';

export interface SelectedVideo {
  id: number;
  title: string;
  description: string;
  file: string;
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
