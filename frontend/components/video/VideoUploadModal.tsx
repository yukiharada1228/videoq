'use client';

import { useEffect } from 'react';
import { useVideoUpload } from '@/hooks/useVideoUpload';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { VideoUploadFormFields } from './VideoUploadFormFields';

interface VideoUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUploadSuccess?: () => void;
}

export function VideoUploadModal({ isOpen, onClose, onUploadSuccess }: VideoUploadModalProps) {
  const {
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

  const handleClose = () => {
    if (!isUploading) {
      reset();
      onClose();
    }
  };

  useEffect(() => {
    if (success) {
      if (onUploadSuccess) {
        onUploadSuccess();
      }
      const timer = setTimeout(() => {
        handleClose();
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [success, onUploadSuccess]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-white/50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>動画をアップロード</CardTitle>
              <CardDescription>動画ファイルをアップロードして管理できます</CardDescription>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClose}
              disabled={isUploading}
            >
              ✕
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <form 
            onSubmit={(e) => handleSubmit(e, onUploadSuccess)} 
            className="space-y-4"
          >
            <VideoUploadFormFields
              title={title}
              description={description}
              isUploading={isUploading}
              error={error}
              success={success}
              setTitle={setTitle}
              setDescription={setDescription}
              handleFileChange={handleFileChange}
              showCancelButton={true}
              onCancel={handleClose}
              cancelButtonClassName="flex-1"
            />
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

