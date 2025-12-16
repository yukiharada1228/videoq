'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useVideoUpload } from '@/hooks/useVideoUpload';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { VideoUploadFormFields } from './VideoUploadFormFields';
import { VideoUploadButton } from './VideoUploadButton';
import { useOpenAIApiKeyStatus } from '@/hooks/useOpenAIApiKeyStatus';
import { apiClient, VideoGroupList } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';

interface VideoUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUploadSuccess?: () => void;
}

export function VideoUploadModal({ isOpen, onClose, onUploadSuccess }: VideoUploadModalProps) {
  const { user } = useAuth();
  const { hasApiKey, isChecking: checkingApiKey } = useOpenAIApiKeyStatus();
  const apiKeyMissing = !checkingApiKey && hasApiKey === false;

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

  const [groups, setGroups] = useState<VideoGroupList[]>([]);
  const loadedUserIdRef = useRef<number | null>(null);

  const handleClose = useCallback(() => {
    if (!isUploading) {
      reset();
      onClose();
    }
  }, [isUploading, onClose, reset]);

  // Load groups when modal opens
  useEffect(() => {
    if (isOpen && user?.id && loadedUserIdRef.current !== user.id) {
      loadedUserIdRef.current = user.id;
      apiClient.getVideoGroups()
        .then((data) => setGroups(data))
        .catch(() => {
          // Silently fail - groups list will remain empty
          setGroups([]);
        });
    }
  }, [isOpen, user?.id]);

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
  }, [success, onUploadSuccess, handleClose]);

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
            if (apiKeyMissing || checkingApiKey) {
              e.preventDefault();
              return;
            }
            handleSubmit(e, onUploadSuccess);
          }} 
          className="space-y-4"
        >
          <VideoUploadFormFields
            title={title}
            description={description}
            externalId={externalId}
            groupId={groupId}
            isUploading={isUploading}
            disabled={apiKeyMissing || checkingApiKey}
            error={error}
            success={success}
            setTitle={setTitle}
            setDescription={setDescription}
            setExternalId={setExternalId}
            setGroupId={setGroupId}
            handleFileChange={handleFileChange}
            file={file}
            groups={groups}
            hideButtons={true}
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose} disabled={isUploading}>
              {t('common.actions.cancel')}
            </Button>
            <VideoUploadButton isUploading={isUploading} disabled={apiKeyMissing || checkingApiKey} />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

