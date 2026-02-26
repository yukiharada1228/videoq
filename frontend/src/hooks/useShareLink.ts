import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient, type VideoGroup } from '@/lib/api';
import { addLocalePrefix } from '@/lib/i18n';
import { type Locale } from '@/i18n/config';
import { handleAsyncError } from '@/lib/utils/errorHandling';
import { queryKeys } from '@/lib/queryKeys';

interface UseShareLinkReturn {
  shareLink: string | null;
  isGeneratingLink: boolean;
  isCopied: boolean;
  generateShareLink: () => Promise<void>;
  deleteShareLink: () => Promise<void>;
  copyShareLink: () => Promise<void>;
}

export function useShareLink(group: VideoGroup | null): UseShareLinkReturn {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [isCopied, setIsCopied] = useState(false);

  const createShareLinkMutation = useMutation({
    mutationFn: async (groupId: number) => await apiClient.createShareLink(groupId),
  });
  const deleteShareLinkMutation = useMutation({
    mutationFn: async (groupId: number) => await apiClient.deleteShareLink(groupId),
  });

  // Sync share link URL from group's share_token
  useEffect(() => {
    if (group?.share_token) {
      const locale = i18n.language as Locale;
      const shareUrl = `${window.location.origin}${addLocalePrefix(`/share/${group.share_token}`, locale)}`;
      setShareLink(shareUrl);
    } else {
      setShareLink(null);
    }
    setIsCopied(false);
  }, [group?.share_token, i18n.language]);

  const generateShareLink = useCallback(async () => {
    if (!group) return;
    try {
      const result = await createShareLinkMutation.mutateAsync(group.id);
      queryClient.setQueryData<VideoGroup>(queryKeys.videoGroups.detail(group.id), (prev) =>
        prev ? { ...prev, share_token: result.share_token } : prev
      );
      const locale = i18n.language as Locale;
      const shareUrl = `${window.location.origin}${addLocalePrefix(`/share/${result.share_token}`, locale)}`;
      setShareLink(shareUrl);
    } catch (err) {
      handleAsyncError(err, t('videos.groupDetail.generateShareError'), () => { });
    }
  }, [group, createShareLinkMutation, queryClient, i18n.language, t]);

  const deleteShareLink = useCallback(async () => {
    if (!group || !confirm(t('confirmations.disableShareLink'))) return;
    try {
      await deleteShareLinkMutation.mutateAsync(group.id);
      queryClient.setQueryData<VideoGroup>(queryKeys.videoGroups.detail(group.id), (prev) =>
        prev ? { ...prev, share_token: null } : prev
      );
      setShareLink(null);
    } catch (err) {
      handleAsyncError(err, t('videos.groupDetail.disableShareError'), () => { });
    }
  }, [group, deleteShareLinkMutation, queryClient, t]);

  const copyShareLink = useCallback(async () => {
    if (!shareLink) return;

    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(shareLink);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = shareLink;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        const successful = document.execCommand('copy');
        textArea.remove();
        if (!successful) {
          throw new Error('Copy command failed');
        }
      }

      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
      alert(t('common.messages.copyFailed'));
    }
  }, [shareLink, t]);

  return {
    shareLink,
    isGeneratingLink: createShareLinkMutation.isPending,
    isCopied,
    generateShareLink,
    deleteShareLink,
    copyShareLink,
  };
}
