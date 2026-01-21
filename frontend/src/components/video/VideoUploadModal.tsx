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
    file,
    title,
    description,
    externalId,
    tagIds,
    isUploading,
    error,
    success,
    setTitle,
    setDescription,
    setExternalId,
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
        <form
          onSubmit={(e) => {
            handleSubmit(e, onUploadSuccess);
          }}
          className="space-y-4"
        >
          <VideoUploadFormFields
            title={title}
            description={description}
            externalId={externalId}
            isUploading={isUploading}
            disabled={false}
            error={error}
            success={success}
            setTitle={setTitle}
            setDescription={setDescription}
            setExternalId={setExternalId}
            handleFileChange={handleFileChange}
            file={file}
            hideButtons={true}
          />

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
