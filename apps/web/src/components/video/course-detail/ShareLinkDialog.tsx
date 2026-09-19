import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { InlineSpinner } from '@/components/common/InlineSpinner';
import { useState } from 'react';
import { Copy, Plus } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { SupportText } from '@/components/ui/support-text';
import { Dialog, DialogActions, DialogBody, DialogContent, DialogHeader, DialogHeading, DialogScrollArea, useDialog } from '@/components/ui/dialog';
import { CourseSharingNotice } from './CourseSharingNotice';

export function ShareLinkDialog({
  isOpen,
  shareSlug,
  shareLink,
  isGeneratingLink,
  isCopied,
  onOpenChange,
  onGenerate,
  onDelete,
  onCopy,
}: {
  isOpen: boolean;
  shareSlug: string;
  shareLink: string | null;
  isGeneratingLink: boolean;
  isCopied: boolean;
  onOpenChange: (open: boolean) => void;
  onGenerate: (shareSlug: string) => Promise<void> | void;
  onDelete: () => void;
  onCopy: () => void;
}) {
  const { t } = useTranslation();
  const [inputValue, setInputValue] = useState(shareSlug);

  const dialog = useDialog({
    open: isOpen,
    onOpenChange,
    onRequestClose: (event) => {
      if (isGeneratingLink) event.preventDefault();
    },
  });

  return (
    <Dialog {...dialog.dialogProps} scroll="inner" width="min(42rem, 92vw)">
      <DialogContent>
        <DialogHeader>
          <DialogHeading {...dialog.headingProps}>
            {t('videos.courseDetail.share.title')}
          </DialogHeading>
        </DialogHeader>
        <DialogScrollArea>
          <DialogBody>
            <p className="mb-6 text-std-16N-170 text-solid-gray-700">
              {shareLink
                ? t('videos.courseDetail.share.enabled')
                : t('videos.courseDetail.share.disabled')}
            </p>

            <div className="space-y-8">
              <CourseSharingNotice method="link" />
              <div className="flex flex-col gap-3">
                <Label htmlFor="course-share-slug">
                  {t('videos.courseDetail.shareSlugPlaceholder')}
                </Label>
                <Input
                  id="course-share-slug"
                  type="text"
                  blockSize="lg"
                  value={inputValue}
                  onChange={(event) => setInputValue(event.target.value)}
                  disabled={isGeneratingLink}
                />
                <SupportText>{t('videos.courseDetail.shareSlugHelp')}</SupportText>
                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <Button
                    type="button"
                    variant="solid"
                    size="md"
                    onClick={() => {
                      void onGenerate(inputValue);
                    }}
                    disabled={isGeneratingLink || !inputValue.trim()}
                  >
                    {isGeneratingLink ? (
                      <InlineSpinner className="mr-1.5 h-4 w-4" />
                    ) : (
                      <Plus className="mr-1.5 h-4 w-4" />
                    )}
                    {isGeneratingLink
                      ? t('videos.courseDetail.generating')
                      : t('common.actions.save')}
                  </Button>
                  {shareLink ? (
                    <Button
                      type="button"
                      variant="text"
                      size="md"
                      onClick={onDelete}
                      disabled={isGeneratingLink}
                      className="text-error-1 hover:bg-red-50"
                    >
                      {t('videos.courseDetail.disable')}
                    </Button>
                  ) : null}
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <Label id="course-share-link-label">
                  {t('videos.courseDetail.shareLinkLabel')}
                </Label>
                {shareLink ? (
                  <div className="flex flex-col gap-4">
                    <div
                      aria-labelledby="course-share-link-label"
                      className="min-h-16 break-all rounded-8 border border-solid-gray-420 bg-solid-gray-50 px-5 py-4 font-mono text-std-16N-170 text-solid-gray-800"
                    >
                      {shareLink}
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="md"
                      onClick={onCopy}
                      className="self-start"
                    >
                      <Copy className="mr-1.5 h-4 w-4" />
                      {isCopied
                        ? t('videos.courseDetail.copied')
                        : t('videos.courseDetail.copyButton')}
                    </Button>
                  </div>
                ) : (
                  <SupportText>{t('videos.courseDetail.share.disabled')}</SupportText>
                )}
              </div>
            </div>
          </DialogBody>
        </DialogScrollArea>
        <DialogActions>
          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isGeneratingLink}
            >
              {t('common.actions.close')}
            </Button>
          </div>
        </DialogActions>
      </DialogContent>
    </Dialog>
  );
}
