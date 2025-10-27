'use client';

import { useEffect } from 'react';
import { useVideoUpload } from '@/hooks/useVideoUpload';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { VideoUploadFormFields } from './VideoUploadFormFields';
import { VideoUploadButton } from './VideoUploadButton';

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

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !isUploading && handleClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>動画をアップロード</DialogTitle>
          <DialogDescription>
            動画ファイルをアップロードして管理できます
          </DialogDescription>
        </DialogHeader>
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
            hideButtons={true}
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose} disabled={isUploading}>
              キャンセル
            </Button>
            <VideoUploadButton isUploading={isUploading} />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

