'use client';

import { useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useVideoUpload } from '@/hooks/useVideoUpload';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { VideoUploadFormFields } from './VideoUploadFormFields';
import { VideoUploadButton } from './VideoUploadButton';
import { useTags } from '@/hooks/useTags';
import { TagSelector } from './TagSelector';
import { TagCreateDialog } from './TagCreateDialog';
import { useState } from 'react';

interface VideoUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUploadSuccess?: () => void;
}

/**
 * Render a modal dialog for uploading a video with title, description, external ID, file selection,
 * tag selection, and tag creation.
 *
 * The modal disables closing while an upload is in progress and automatically closes 2 seconds
 * after a successful upload. Submitting the form delegates to the upload hook and passes the
 * optional `onUploadSuccess` callback.
 *
 * @param isOpen - Whether the modal is visible
 * @param onClose - Callback invoked when the modal is closed (not called while uploading)
 * @param onUploadSuccess - Optional callback invoked after a successful upload (passed to the submit handler)
 * @returns The video upload modal element
 */
export function VideoUploadModal({ isOpen, onClose, onUploadSuccess }: VideoUploadModalProps) {
  const {
    sourceMode,
    file,
    youtubeUrl,
    title,
    description,
    tagIds,
    isUploading,
    error,
    errorParams,
    success,
    setTitle,
    setDescription,
    setYoutubeUrl,
    setSourceMode,
    setTagIds,
    handleFileChange,
    handleSubmit,
    reset,
  } = useVideoUpload();
  const { t } = useTranslation();

  // Load tags
  const { tags, createTag } = useTags();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);

  const handleTagToggle = useCallback((tagId: number) => {
    setTagIds((prev: number[]) =>
      prev.includes(tagId) ? prev.filter((id: number) => id !== tagId) : [...prev, tagId]
    );
  }, [setTagIds]);

  const handleCreateTag = useCallback(async (name: string, color: string) => {
    await createTag(name, color);
  }, [createTag]);

  const handleClose = useCallback(() => {
    if (!isUploading) {
      reset();
      onClose();
    }
  }, [isUploading, onClose, reset]);

  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => {
        handleClose();
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [success, handleClose]);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !isUploading && handleClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('videos.upload.title')}</DialogTitle>
          <DialogDescription>
            {t('videos.upload.description')}
          </DialogDescription>
        </DialogHeader>
        <div className="flex rounded-xl bg-[#f2f4ef] p-1">
          {(['file', 'youtube'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setSourceMode(mode)}
              className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                sourceMode === mode
                  ? 'bg-white text-[#00652c] shadow-sm'
                  : 'text-[#3f493f] hover:text-[#191c19]'
              }`}
            >
              {mode === 'file' ? t('videos.upload.modes.file') : t('videos.upload.modes.youtube')}
            </button>
          ))}
        </div>
        <form
          onSubmit={(e) => {
            handleSubmit(e, onUploadSuccess);
          }}
          className="space-y-4"
        >
          {sourceMode === 'file' ? (
            <VideoUploadFormFields
              title={title}
              description={description}
              isUploading={isUploading}
              disabled={false}
              error={error}
              errorParams={errorParams}
              success={success}
              setTitle={setTitle}
              setDescription={setDescription}
              handleFileChange={handleFileChange}
              file={file}
              hideButtons={true}
            />
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="youtube_url" className="text-sm font-medium">
                  {t('videos.upload.youtubeUrlLabel')}
                </label>
                <input
                  id="youtube_url"
                  type="url"
                  value={youtubeUrl}
                  onChange={(e) => setYoutubeUrl(e.target.value)}
                  disabled={isUploading}
                  placeholder={t('videos.upload.youtubeUrlPlaceholder')}
                  className="w-full rounded-xl border border-[#e1e3de] bg-white px-3 py-2 text-sm outline-none focus:border-[#00652c]"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="title" className="text-sm font-medium">
                  {t('videos.upload.titleLabel')}
                </label>
                <input
                  id="title"
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  disabled={isUploading}
                  placeholder={t('videos.upload.titleEmptyPlaceholder')}
                  className="w-full rounded-xl border border-[#e1e3de] bg-white px-3 py-2 text-sm outline-none focus:border-[#00652c]"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="description" className="text-sm font-medium">
                  {t('videos.upload.descriptionLabel')}
                </label>
                <textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  disabled={isUploading}
                  placeholder={t('videos.upload.descriptionPlaceholder')}
                  rows={4}
                  className="w-full rounded-xl border border-[#e1e3de] bg-white px-3 py-2 text-sm outline-none focus:border-[#00652c]"
                />
              </div>
              {error && <p className="text-sm text-red-500">{t(error, errorParams)}</p>}
              {success && <p className="text-sm text-[#00652c]">{t('videos.upload.success')}</p>}
            </div>
          )}

          <TagSelector
            tags={tags}
            selectedTagIds={tagIds}
            onToggle={handleTagToggle}
            onCreateNew={() => setIsCreateDialogOpen(true)}
            disabled={isUploading}
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose} disabled={isUploading}>
              {t('common.actions.cancel')}
            </Button>
            <VideoUploadButton isUploading={isUploading} disabled={false} />
          </DialogFooter>
        </form>

        <TagCreateDialog
          isOpen={isCreateDialogOpen}
          onClose={() => setIsCreateDialogOpen(false)}
          onCreate={handleCreateTag}
        />
      </DialogContent>
    </Dialog>
  );
}
