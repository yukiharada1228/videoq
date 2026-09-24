import { useQueryClient, useMutation } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Course as VideoCourse } from '@videoq/trpc';
import { addLocalePrefix } from '@/lib/i18n';
import { type Locale } from '@/i18n/config';
import { handleAsyncError } from '@/lib/utils/errorHandling';
import { appTrpcClient, trpc } from '@/lib/trpc';
import { useConfirm, useToast } from '@/components/common/feedback';

interface UseShareLinkReturn {
  shareLink: string | null;
  isGeneratingLink: boolean;
  isDeletingLink: boolean;
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
  const shareLink = course?.share_slug
    ? `${window.location.origin}${addLocalePrefix(`/share/${course.share_slug}`, i18n.language as Locale)}`
    : null;
  const [copiedLink, setCopiedLink] = useState<{ url: string } | null>(null);

  const updating = useRef(false);
  const shareMutation = useMutation({
    mutationFn: async ({ id, shareSlug }: { id: number; shareSlug: string | null }) => {
      if (shareSlug === null) {
        await appTrpcClient.courses.deleteShare.mutate({ id });
        return null;
      }
      const result = await appTrpcClient.courses.createShare.mutate({ id, shareSlug });
      return result.share_slug;
    },
    onSuccess: async (shareSlug, { id }) => {
      await queryClient.cancelQueries(trpc.courses.get.queryFilter({ id }));
      queryClient.setQueryData(trpc.courses.get.queryKey({ id }), (prev) =>
        prev ? { ...prev, share_slug: shareSlug } : prev);
    },
  });

  useEffect(() => {
    if (!copiedLink) return;
    if (copiedLink.url !== shareLink) {
      setCopiedLink(null);
      return;
    }
    const timer = window.setTimeout(() => setCopiedLink(null), 2000);
    return () => window.clearTimeout(timer);
  }, [copiedLink, shareLink]);

  const generateShareLink = useCallback(async (shareSlug: string) => {
    if (!course || updating.current) return;
    updating.current = true;
    try {
      await shareMutation.mutateAsync({ id: course.id, shareSlug });
    } catch (err) {
      handleAsyncError(err, t('videos.courseDetail.generateShareError'), (message) => toast({ message, variant: 'error' }));
    } finally {
      updating.current = false;
    }
  }, [course, shareMutation, t, toast]);

  const deleteShareLink = useCallback(async () => {
    if (!course || updating.current) return;
    updating.current = true;
    try {
      const confirmed = await requestConfirmation({
        title: t('confirmations.disableShareLink'),
        confirmLabel: t('common.actions.disable'),
        cancelLabel: t('common.actions.cancel'),
        variant: 'danger',
      });
      if (!confirmed) return;
      await shareMutation.mutateAsync({ id: course.id, shareSlug: null });
    } catch (err) {
      handleAsyncError(err, t('videos.courseDetail.disableShareError'), (message) => toast({ message, variant: 'error' }));
    } finally {
      updating.current = false;
    }
  }, [requestConfirmation, course, shareMutation, t, toast]);

  const copyShareLink = useCallback(async () => {
    if (!shareLink) return;

    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(shareLink);
      } else {
        const previousFocus = document.activeElement instanceof HTMLElement
          ? document.activeElement : null;
        const textArea = document.createElement('textarea');
        textArea.value = shareLink;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        // Content outside a modal dialog is inert and cannot be selected for copying.
        (previousFocus?.closest('dialog[open]') ?? document.body).appendChild(textArea);
        try {
          textArea.focus({ preventScroll: true });
          textArea.select();
          if (!document.execCommand('copy')) {
            throw new Error('Copy command failed');
          }
        } finally {
          textArea.remove();
          previousFocus?.focus({ preventScroll: true });
        }
      }

      setCopiedLink({ url: shareLink });
    } catch (err) {
      console.error('Failed to copy:', err);
      toast({ message: t('common.messages.copyFailed'), variant: 'error' });
    }
  }, [shareLink, t, toast]);

  return {
    shareLink,
    isGeneratingLink: shareMutation.isPending && shareMutation.variables.shareSlug !== null,
    isDeletingLink: shareMutation.isPending && shareMutation.variables.shareSlug === null,
    isCopied: copiedLink !== null && copiedLink.url === shareLink,
    generateShareLink,
    deleteShareLink,
    copyShareLink,
  };
}
