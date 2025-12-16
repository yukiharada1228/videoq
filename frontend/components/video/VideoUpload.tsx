'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useVideoUpload } from '@/hooks/useVideoUpload';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { VideoUploadFormFields } from './VideoUploadFormFields';
import { useVideoGroups } from '@/hooks/useVideoGroups';

interface VideoUploadProps {
  onUploadSuccess?: () => void;
}

export function VideoUpload({ onUploadSuccess }: VideoUploadProps) {
  const {
    file,
    title,
    description,
    externalId,
    groupId,
    isUploading,
    error,
    success,
    setTitle,
    setDescription,
    setExternalId,
    setGroupId,
    handleFileChange,
    handleSubmit,
    reset,
  } = useVideoUpload();
  const t = useTranslations();

  // Load groups when user changes
  const groups = useVideoGroups();

  useEffect(() => {
    if (success && onUploadSuccess) {
      setTimeout(() => {
        reset();
        onUploadSuccess();
      }, 2000);
    }
  }, [success, onUploadSuccess, reset]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('videos.upload.title')}</CardTitle>
        <CardDescription>{t('videos.upload.description')}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={(e) => handleSubmit(e, onUploadSuccess)} className="space-y-4">
          <VideoUploadFormFields
            title={title}
            description={description}
            externalId={externalId}
            groupId={groupId}
            isUploading={isUploading}
            error={error}
            success={success}
            setTitle={setTitle}
            setDescription={setDescription}
            setExternalId={setExternalId}
            setGroupId={setGroupId}
            handleFileChange={handleFileChange}
            file={file}
            groups={groups}
          />
        </form>
      </CardContent>
    </Card>
  );
}

