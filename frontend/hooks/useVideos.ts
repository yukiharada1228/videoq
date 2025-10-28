import { useRef } from 'react';
import { apiClient, Video, VideoList as VideoListType } from '@/lib/api';
import { useRouter } from 'next/navigation';
import { useApiCall } from './useCommonHooks';

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
  const { data, isLoading, error, refetch } = useApiCall<VideoListType[]>({
    fetchFn: () => apiClient.getVideos(),
    errorMessage: '動画の読み込みに失敗しました',
    shouldFetch: true,
  });

  return {
    videos: data || [],
    isLoading,
    error,
    loadVideos: refetch,
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

  const shouldFetch = !!videoId;
  
  const { data, isLoading, error, refetch } = useApiCall<Video>({
    fetchFn: () => apiClient.getVideo(videoIdRef.current!),
    errorMessage: '動画の読み込みに失敗しました',
    shouldFetch,
    onFetchStart: () => {
      if (!apiClient.isAuthenticated()) {
        routerRef.current.push('/login');
      }
    },
  });

  return {
    video: data || null,
    isLoading,
    error,
    loadVideo: refetch,
  };
}

