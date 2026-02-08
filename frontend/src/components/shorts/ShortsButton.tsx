import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { apiClient, type PopularScene, type VideoInGroup } from '@/lib/api';
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
  const [isOpen, setIsOpen] = useState(false);
  const [scenes, setScenes] = useState<PopularScene[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const cacheRef = useRef<{ data: PopularScene[]; fetchedAt: number } | null>(null);

  const handleOpen = async () => {
    const cached = cacheRef.current;
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
      setScenes(cached.data);
      setIsOpen(true);
      return;
    }

    setIsLoading(true);
    try {
      const popularScenes = await apiClient.getPopularScenes(groupId, shareToken);
      cacheRef.current = { data: popularScenes, fetchedAt: Date.now() };
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
