import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient, type VideoCourse } from '@/lib/api';
import { addLocalePrefix } from '@/lib/i18n';
import { type Locale } from '@/i18n/config';
import { handleAsyncError } from '@/lib/utils/errorHandling';
import { queryKeys } from '@/lib/queryKeys';
import { useConfirm, useToast } from '@/components/common/feedback';

interface UseShareLinkReturn {
  shareLink: string | null;
  isGeneratingLink: boolean;
  isCopied: boolean;
  generateShareLink: (shareSlug: string) => Promise<void>;
  deleteShareLink: () => Promise<void>;
  copyShareLink: () => Promise<void>;
}

export function useShareLink(course: VideoCourse | null): UseShareLinkReturn {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const requestConfirmation = useConfirm();
  const toast = useToast();
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [isCopied, setIsCopied] = useState(false);

  const createShareLinkMutation = useMutation({
    mutationFn: async ({ courseId, shareSlug }: { courseId: number; shareSlug: string }) =>
      await apiClient.createShareLink(courseId, shareSlug),
  });
  const deleteShareLinkMutation = useMutation({
    mutationFn: async (courseId: number) => await apiClient.deleteShareLink(courseId),
  });

  // Sync share link URL from course's share_slug
  useEffect(() => {
    if (course?.share_slug) {
      const locale = i18n.language as Locale;
      const shareUrl = `${window.location.origin}${addLocalePrefix(`/share/${course.share_slug}`, locale)}`;
      setShareLink(shareUrl);
    } else {
      setShareLink(null);
    }
    setIsCopied(false);
  }, [course?.share_slug, i18n.language]);

  const generateShareLink = useCallback(async (shareSlug: string) => {
    if (!course) return;
    try {
      const result = await createShareLinkMutation.mutateAsync({ courseId: course.id, shareSlug });
      queryClient.setQueryData<VideoCourse>(queryKeys.videoCourses.detail(course.id), (prev) =>
        prev ? { ...prev, share_slug: result.share_slug } : prev
      );
      const locale = i18n.language as Locale;
      const shareUrl = `${window.location.origin}${addLocalePrefix(`/share/${result.share_slug}`, locale)}`;
      setShareLink(shareUrl);
    } catch (err) {
      handleAsyncError(err, t('videos.courseDetail.generateShareError'), () => { });
    }
  }, [course, createShareLinkMutation, queryClient, i18n.language, t]);

  const deleteShareLink = useCallback(async () => {
    if (!course) return;
    const confirmed = await requestConfirmation({
      title: t('confirmations.disableShareLink'),
      confirmLabel: t('common.actions.disable'),
      cancelLabel: t('common.actions.cancel'),
      variant: 'danger',
    });
    if (!confirmed) return;
    try {
      await deleteShareLinkMutation.mutateAsync(course.id);
      queryClient.setQueryData<VideoCourse>(queryKeys.videoCourses.detail(course.id), (prev) =>
        prev ? { ...prev, share_slug: null } : prev
      );
      setShareLink(null);
    } catch (err) {
      handleAsyncError(err, t('videos.courseDetail.disableShareError'), () => { });
    }
  }, [requestConfirmation, course, deleteShareLinkMutation, queryClient, t]);

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
      toast({ message: t('common.messages.copyFailed'), variant: 'error' });
    }
  }, [shareLink, t, toast]);

  return {
    shareLink,
    isGeneratingLink: createShareLinkMutation.isPending,
    isCopied,
    generateShareLink,
    deleteShareLink,
    copyShareLink,
  };
}
