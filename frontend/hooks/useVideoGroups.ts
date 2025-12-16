import { useEffect, useRef, useState } from 'react';
import { apiClient, VideoGroupList } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';

/**
 * 動画グループ一覧を取得する。
 * - user の変更（user?.id）に追従して読み込む
 * - コンポーネントのアンマウント/非表示（trigger=false）後に setState しない
 */
export function useVideoGroups(trigger: boolean = true) {
  const { user } = useAuth();
  const [groups, setGroups] = useState<VideoGroupList[]>([]);
  const loadedUserIdRef = useRef<number | null>(null);

  useEffect(() => {
    let isMounted = true;

    if (trigger && user?.id && loadedUserIdRef.current !== user.id) {
      loadedUserIdRef.current = user.id;
      apiClient
        .getVideoGroups()
        .then((data) => {
          if (isMounted) setGroups(data);
        })
        .catch((err) => {
          // Silently fail - groups list will remain empty
          console.error('Failed to load video groups', err);
          if (isMounted) setGroups([]);
        });
    }

    return () => {
      isMounted = false;
    };
  }, [trigger, user?.id]);

  return groups;
}

