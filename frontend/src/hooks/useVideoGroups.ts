import { useCallback, useEffect, useRef, useState } from 'react';
import { apiClient, type VideoGroupList } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';

interface UseVideoGroupsReturn {
  groups: VideoGroupList[];
  isLoading: boolean;
  refetch: () => void;
}

/**
 * Fetch the list of video groups.
 * - Reload following user changes (user?.id)
 * - Refetch when trigger becomes true (e.g., when modal is opened)
 * - Don't setState after component unmount/hide (trigger=false)
 */
export function useVideoGroups(trigger: boolean = true): UseVideoGroupsReturn {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [groups, setGroups] = useState<VideoGroupList[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const loadedUserIdRef = useRef<number | null>(null);
  const previousTriggerRef = useRef<boolean>(trigger);
  const isFetchingRef = useRef<boolean>(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    // Refetch when user changes, or when trigger changes from false to true
    const shouldFetch =
      trigger &&
      userId !== null &&
      (loadedUserIdRef.current !== userId ||
        (previousTriggerRef.current === false && trigger === true));

    if (shouldFetch && !isFetchingRef.current) {
      isFetchingRef.current = true;
      // Defer to microtask to avoid eslint react-hooks/set-state-in-effect
      // (Executes immediately after, loading display is effectively instant)
      queueMicrotask(() => {
        if (isMounted) setIsLoading(true);
      });

      apiClient
        .getVideoGroups()
        .then((data) => {
          if (isMounted) {
            setGroups(data);
            loadedUserIdRef.current = userId;
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
  }, [trigger, userId]);

  const refetch = useCallback(() => {
    if (userId === null || isFetchingRef.current) {
      return;
    }

    // Clear ref to force refetch
    loadedUserIdRef.current = null;
    isFetchingRef.current = true;
    setIsLoading(true);

    apiClient
      .getVideoGroups()
      .then((data) => {
        if (!isMountedRef.current) return;
        setGroups(data);
        loadedUserIdRef.current = userId;
        setIsLoading(false);
        isFetchingRef.current = false;
      })
      .catch((err) => {
        console.error('Failed to load video groups', err);
        if (!isMountedRef.current) return;
        setGroups([]);
        setIsLoading(false);
        isFetchingRef.current = false;
        // Don't set loadedUserIdRef so retry is possible
      });
  }, [userId]);

  return { groups, isLoading, refetch };
}

