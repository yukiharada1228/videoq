'use client';

import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useVideoUpload } from '@/hooks/useVideoUpload';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { VideoUploadFormFields } from './VideoUploadFormFields';

interface VideoUploadProps {
  onUploadSuccess?: () => void;
}

export function VideoUpload({ onUploadSuccess }: VideoUploadProps) {
  const {
    file,
    youtubeUrl,
    title,
    description,
    isUploading,
    error,
    success,
    setTitle,
    setDescription,
    setYoutubeUrl,
    handleFileChange,
    handleSubmit,
    reset,
  } = useVideoUpload();
  const { t } = useTranslation();

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
            isUploading={isUploading}
            error={error}
            success={success}
            setTitle={setTitle}
            setDescription={setDescription}
            handleFileChange={handleFileChange}
            file={file}
            youtubeUrl={youtubeUrl}
            setYoutubeUrl={setYoutubeUrl}
          />
        </form>
      </CardContent>
    </Card>
  );
}

