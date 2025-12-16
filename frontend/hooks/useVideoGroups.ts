import { useCallback, useEffect, useRef, useState } from 'react';
import { apiClient, VideoGroupList } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';

interface UseVideoGroupsReturn {
  groups: VideoGroupList[];
  isLoading: boolean;
  refetch: () => void;
}

/**
 * 動画グループ一覧を取得する。
 * - user の変更（user?.id）に追従して読み込む
 * - triggerがtrueになったときに再取得する（モーダルが開かれたときなど）
 * - コンポーネントのアンマウント/非表示（trigger=false）後に setState しない
 */
export function useVideoGroups(trigger: boolean = true): UseVideoGroupsReturn {
  const { user } = useAuth();
  const [groups, setGroups] = useState<VideoGroupList[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const loadedUserIdRef = useRef<number | null>(null);
  const previousTriggerRef = useRef<boolean>(trigger);
  const isFetchingRef = useRef<boolean>(false);

  useEffect(() => {
    let isMounted = true;

    // ユーザーが変更された場合、またはtriggerがfalse→trueに変わった場合に再取得
    const shouldFetch =
      trigger &&
      user?.id &&
      (loadedUserIdRef.current !== user.id ||
        (previousTriggerRef.current === false && trigger === true));

    if (shouldFetch && !isFetchingRef.current) {
      isFetchingRef.current = true;
      setIsLoading(true);

      apiClient
        .getVideoGroups()
        .then((data) => {
          if (isMounted) {
            setGroups(data);
            loadedUserIdRef.current = user.id;
            setIsLoading(false);
            isFetchingRef.current = false;
          }
        })
        .catch((err) => {
          // Silently fail - groups list will remain empty
          console.error('Failed to load video groups', err);
          if (isMounted) {
            setGroups([]);
            setIsLoading(false);
            isFetchingRef.current = false;
            // Don't set loadedUserIdRef so retry is possible
          }
        });
    }

    previousTriggerRef.current = trigger;

    return () => {
      isMounted = false;
    };
  }, [trigger, user?.id]);

  const refetch = useCallback(() => {
    if (!user?.id || isFetchingRef.current) {
      return;
    }

    // 強制的に再取得するためにrefをクリア
    loadedUserIdRef.current = null;
    isFetchingRef.current = true;
    setIsLoading(true);

    apiClient
      .getVideoGroups()
      .then((data) => {
        setGroups(data);
        loadedUserIdRef.current = user.id;
        setIsLoading(false);
        isFetchingRef.current = false;
      })
      .catch((err) => {
        console.error('Failed to load video groups', err);
        setGroups([]);
        setIsLoading(false);
        isFetchingRef.current = false;
        // Don't set loadedUserIdRef so retry is possible
      });
  }, [user?.id]);

  return { groups, isLoading, refetch };
}

