import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiClient, type VideoGroup } from '@/lib/api';
import { addLocalePrefix } from '@/lib/i18n';
import { type Locale } from '@/i18n/config';
import { handleAsyncError } from '@/lib/utils/errorHandling';

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
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [isGeneratingLink, setIsGeneratingLink] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

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
      setIsGeneratingLink(true);
      const result = await apiClient.createShareLink(group.id);
      const locale = i18n.language as Locale;
      const shareUrl = `${window.location.origin}${addLocalePrefix(`/share/${result.share_token}`, locale)}`;
      setShareLink(shareUrl);
    } catch (err) {
      handleAsyncError(err, t('videos.groupDetail.generateShareError'), () => { });
    } finally {
      setIsGeneratingLink(false);
    }
  }, [group, i18n.language, t]);

  const deleteShareLink = useCallback(async () => {
    if (!group || !confirm(t('confirmations.disableShareLink'))) return;
    try {
      await apiClient.deleteShareLink(group.id);
      setShareLink(null);
    } catch (err) {
      handleAsyncError(err, t('videos.groupDetail.disableShareError'), () => { });
    }
  }, [group, t]);

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
    isGeneratingLink,
    isCopied,
    generateShareLink,
    deleteShareLink,
    copyShareLink,
  };
}
