import { useRef, useCallback } from 'react';
import { apiClient, Video, VideoList as VideoListType } from '@/lib/api';
import { useRouter } from 'next/navigation';
import { useAsyncState } from './useAsyncState';

/**
 * 動画一覧を取得するフック（DRY原則・N+1問題対策済み）
 */
interface UseVideosReturn {
  videos: VideoListType[];
  isLoading: boolean;
  error: string | null;
  loadVideos: () => Promise<void>;
}

export function useVideos(): UseVideosReturn {
  const { data: videos, isLoading, error, execute: loadVideos } = useAsyncState<VideoListType[]>({
    initialData: [],
    onError: (error) => {
      console.error('動画の読み込みに失敗しました:', error);
    },
  });

  const handleLoadVideos = useCallback(async () => {
    await loadVideos(async () => {
      return await apiClient.getVideos();
    });
  }, [loadVideos]);

  return {
    videos: videos || [],
    isLoading,
    error,
    loadVideos: handleLoadVideos,
  };
}

/**
 * 単一動画を取得するフック（DRY原則・N+1問題対策済み）
 */
interface UseVideoReturn {
  video: Video | null;
  isLoading: boolean;
  error: string | null;
  loadVideo: () => Promise<void>;
}

export function useVideo(videoId: number | null): UseVideoReturn {
  const router = useRouter();
  
  // routerをrefで保持して依存配列の問題を回避
  const routerRef = useRef(router);
  routerRef.current = router;

  // videoIdをrefで保持して最新の値を常に使用
  const videoIdRef = useRef(videoId);
  videoIdRef.current = videoId;

  const { data: video, isLoading, error, execute: loadVideo } = useAsyncState<Video>({
    initialData: null,
    onError: (error) => {
      console.error('動画の読み込みに失敗しました:', error);
    },
  });

  const handleLoadVideo = useCallback(async () => {
    if (!videoIdRef.current) return;
    
    await loadVideo(async () => {
      if (!apiClient.isAuthenticated()) {
        routerRef.current.push('/login');
        throw new Error('認証が必要です');
      }
      return await apiClient.getVideo(videoIdRef.current!);
    });
  }, [loadVideo]);

  return {
    video: video || null,
    isLoading,
    error,
    loadVideo: handleLoadVideo,
  };
}

