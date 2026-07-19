'use client';

import { useEffect, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useVideoUpload } from '@/hooks/useVideoUpload';
import { Heading, HeadingTitle } from '@/components/ui/heading';
import { VideoUploadFormFields } from './VideoUploadFormFields';
import { useTags } from '@/hooks/useTags';
import { TagSelector } from './TagSelector';
import { TagCreateDialog } from './TagCreateDialog';

interface VideoUploadProps {
  onUploadSuccess?: () => void;
}

export function VideoUpload({ onUploadSuccess }: VideoUploadProps) {
  const {
    file,
    title,
    description,
    tagIds,
    isUploading,
    error,
    errorParams,
    warning,
    warningParams,
    success,
    setTitle,
    setDescription,
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

  useEffect(() => {
    if (success && onUploadSuccess) {
      setTimeout(() => {
        reset();
        onUploadSuccess();
      }, 2000);
    }
  }, [success, onUploadSuccess, reset]);

  return (
    <section className="border-t border-solid-gray-420 pt-8">
      <Heading size="20" hasChip className="mb-2">
        <HeadingTitle level="h2">{t('videos.upload.title')}</HeadingTitle>
      </Heading>
      <p className="mb-6 text-std-16N-170 text-solid-gray-700">
        {t('videos.upload.description')}
      </p>

      <form onSubmit={(e) => handleSubmit(e, onUploadSuccess)} className="space-y-4">
        <VideoUploadFormFields
          title={title}
          description={description}
          isUploading={isUploading}
          error={error}
          errorParams={errorParams}
          warning={warning}
          warningParams={warningParams}
          success={success}
          setTitle={setTitle}
          setDescription={setDescription}
          handleFileChange={handleFileChange}
          file={file}
        />

        <TagSelector
          tags={tags}
          selectedTagIds={tagIds}
          onToggle={handleTagToggle}
          onCreateNew={() => setIsCreateDialogOpen(true)}
          disabled={isUploading}
        />
      </form>

      <TagCreateDialog
        isOpen={isCreateDialogOpen}
        onClose={() => setIsCreateDialogOpen(false)}
        onCreate={handleCreateTag}
      />
    </section>
  );
}
