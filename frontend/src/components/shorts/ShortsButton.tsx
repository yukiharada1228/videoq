import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { apiClient, type PopularScene, type VideoInGroup } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import { ShortsPlayer } from './ShortsPlayer';

interface ShortsButtonProps {
  groupId: number;
  videos: VideoInGroup[];
  shareToken?: string;
  size?: 'sm' | 'default';
}

const CACHE_TTL = 5 * 60 * 1000;

export function ShortsButton({ groupId, videos, shareToken, size = 'default' }: ShortsButtonProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [scenes, setScenes] = useState<PopularScene[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Prefetch popular scenes data on mount
  useEffect(() => {
    if (!videos || videos.length === 0) return;
    void queryClient.prefetchQuery({
      queryKey: queryKeys.shorts.popularScenes(groupId, shareToken),
      queryFn: async () => await apiClient.getPopularScenes(groupId, shareToken),
      staleTime: CACHE_TTL,
    }).catch(() => {});
  }, [groupId, videos, shareToken, queryClient]);

  const handleOpen = async () => {
    setIsLoading(true);
    try {
      const popularScenes = await queryClient.fetchQuery({
        queryKey: queryKeys.shorts.popularScenes(groupId, shareToken),
        queryFn: async () => await apiClient.getPopularScenes(groupId, shareToken),
        staleTime: CACHE_TTL,
      });
      setScenes(popularScenes);
      setIsOpen(true);
    } catch (error) {
      console.error('Failed to load popular scenes:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (!videos || videos.length === 0) {
    return null;
  }

  return (
    <>
      <Button variant="outline" size={size} onClick={handleOpen} disabled={isLoading} className="gap-2">
        <Play className="h-4 w-4" />
        {isLoading ? t('common.loading') : t('shorts.button')}
      </Button>

      {isOpen && (
        <ShortsPlayer scenes={scenes} shareToken={shareToken} onClose={() => setIsOpen(false)} />
      )}
    </>
  );
}
