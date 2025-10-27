import { useState, useEffect, useCallback, useRef } from 'react';
import { apiClient, Video, VideoList as VideoListType } from '@/lib/api';
import { useRouter } from 'next/navigation';

/**
 * データフェッチングの共通ロジック（DRY原則）
 * エラーハンドリングを統一
 */
async function fetchWithErrorHandling<T>(
  fetchFn: () => Promise<T>,
  errorMessage: string
): Promise<T> {
  try {
    return await fetchFn();
  } catch (err) {
    throw new Error(err instanceof Error ? err.message : errorMessage);
  }
}

/**
 * カスタムフックの共通パターン（DRY原則）
 * @template T データの型
 */
interface UseDataHookConfig<T> {
  fetchFn: () => Promise<T>;
  errorMessage: string;
  shouldFetch: boolean;
  onFetchStart?: () => void;
}

function useDataHook<T>(config: UseDataHookConfig<T>) {
  const { fetchFn, errorMessage, shouldFetch, onFetchStart } = config;
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // useRefで関数インスタンスを保持し、無限ループを防ぐ
  const fetchFnRef = useRef(fetchFn);
  const onFetchStartRef = useRef(onFetchStart);
  const errorMessageRef = useRef(errorMessage);

  // 最新の値を常に保持
  fetchFnRef.current = fetchFn;
  onFetchStartRef.current = onFetchStart;
  errorMessageRef.current = errorMessage;

  const loadData = useCallback(async () => {
    if (!shouldFetch) return;

    try {
      setIsLoading(true);
      setError(null);
      onFetchStartRef.current?.();
      
      const result = await fetchWithErrorHandling(fetchFnRef.current, errorMessageRef.current);
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : errorMessageRef.current);
    } finally {
      setIsLoading(false);
    }
  }, [shouldFetch]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  return {
    data,
    isLoading,
    error,
    loadData,
  };
}

interface UseVideosReturn {
  videos: VideoListType[];
  isLoading: boolean;
  error: string | null;
  loadVideos: () => Promise<void>;
}

export function useVideos(): UseVideosReturn {
  const { data, isLoading, error, loadData } = useDataHook<VideoListType[]>({
    fetchFn: () => apiClient.getVideos(),
    errorMessage: '動画の読み込みに失敗しました',
    shouldFetch: true,
  });

  return {
    videos: data || [],
    isLoading,
    error,
    loadVideos: loadData,
  };
}

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
  
  const { data, isLoading, error, loadData } = useDataHook<Video>({
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
    loadVideo: loadData,
  };
}

