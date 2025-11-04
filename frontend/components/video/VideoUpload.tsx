'use client';

import { useEffect } from 'react';
import { useVideoUpload } from '@/hooks/useVideoUpload';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { VideoUploadFormFields } from './VideoUploadFormFields';

interface VideoUploadProps {
  onUploadSuccess?: () => void;
}

export function VideoUpload({ onUploadSuccess }: VideoUploadProps) {
  const {
    file,
    title,
    description,
    isUploading,
    error,
    success,
    setTitle,
    setDescription,
    handleFileChange,
    handleSubmit,
    reset,
  } = useVideoUpload();

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
        <CardTitle>動画をアップロード</CardTitle>
        <CardDescription>動画ファイルをアップロードして管理できます</CardDescription>
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
          />
        </form>
      </CardContent>
    </Card>
  );
}

