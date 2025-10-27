import { useState, useEffect, useCallback } from 'react';
import { apiClient, Video, VideoList as VideoListType } from '@/lib/api';
import { useRouter } from 'next/navigation';

// データフェッチングの共通ロジック
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

interface UseVideosReturn {
  videos: VideoListType[];
  isLoading: boolean;
  error: string | null;
  loadVideos: () => Promise<void>;
}

export function useVideos(): UseVideosReturn {
  const [videos, setVideos] = useState<VideoListType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadVideos = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await fetchWithErrorHandling(
        () => apiClient.getVideos(),
        '動画の読み込みに失敗しました'
      );
      setVideos(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : '動画の読み込みに失敗しました');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadVideos();
  }, [loadVideos]);

  return {
    videos,
    isLoading,
    error,
    loadVideos,
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
  const [video, setVideo] = useState<Video | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadVideo = useCallback(async () => {
    if (!videoId) return;

    if (!apiClient.isAuthenticated()) {
      router.push('/login');
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      const data = await fetchWithErrorHandling(
        () => apiClient.getVideo(videoId),
        '動画の読み込みに失敗しました'
      );
      setVideo(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : '動画の読み込みに失敗しました');
    } finally {
      setIsLoading(false);
    }
  }, [videoId, router]);

  useEffect(() => {
    loadVideo();
  }, [loadVideo]);

  return {
    video,
    isLoading,
    error,
    loadVideo,
  };
}

