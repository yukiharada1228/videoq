import { useState, useCallback } from 'react';
import { apiClient, type VideoUploadRequest } from '@/lib/api';
import { useAsyncState } from './useAsyncState';

interface UseVideoUploadReturn {
  file: File | null;
  title: string;
  description: string;
  externalId: string;
  tagIds: number[];
  isUploading: boolean;
  error: string | null;
  success: boolean;
  setTitle: (title: string) => void;
  setDescription: (description: string) => void;
  setExternalId: (externalId: string) => void;
  setTagIds: React.Dispatch<React.SetStateAction<number[]>>;
  handleFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleSubmit: (e: React.FormEvent, onSuccess?: () => void) => Promise<void>;
  reset: () => void;
}

interface ValidationResult {
  isValid: boolean;
  error?: string;
}

/**
 * Validation logic
 * Returns translation keys for errors
 */
function validateVideoUpload(file: File | null, title: string): ValidationResult {
  if (!file) {
    return { isValid: false, error: 'videos.upload.validation.noFile' };
  }
  // File is OK if title is empty since filename will be used
  const finalTitle = title.trim() || file.name.replace(/\.[^/.]+$/, '');
  if (!finalTitle) {
    return { isValid: false, error: 'videos.upload.validation.noTitle' };
  }
  return { isValid: true };
}

export function useVideoUpload(): UseVideoUploadReturn {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [externalId, setExternalId] = useState('');
  const [tagIds, setTagIds] = useState<number[]>([]);
  const [success, setSuccess] = useState(false);

  const { isLoading, error, execute: uploadVideo, setError } = useAsyncState({
    onSuccess: () => {
      setSuccess(true);
    },
  });

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      setFile(selectedFile);
      // Automatically set filename (without extension) as title
      const fileNameWithoutExt = selectedFile.name.replace(/\.[^/.]+$/, '');
      setTitle(fileNameWithoutExt);
    }
  }, [setTitle]);

  const reset = useCallback(() => {
    setFile(null);
    setTitle('');
    setDescription('');
    setExternalId('');
    setTagIds([]);
    setSuccess(false);
    setError(null);
  }, [setError]);

  const handleSubmit = useCallback(async (e: React.FormEvent, onSuccess?: () => void) => {
    e.preventDefault();

    const validation = validateVideoUpload(file, title);
    if (!validation.isValid) {
      setError(validation.error || 'videos.upload.validation.generic');
      return;
    }

    await uploadVideo(async () => {
      // Use filename (without extension) if title is empty
      const finalTitle = title.trim() || (file ? file.name.replace(/\.[^/.]+$/, '') : '');

      const request: VideoUploadRequest = {
        file: file!,
        title: finalTitle,
        description: description.trim() || undefined,
        external_id: externalId.trim() || undefined,
      };

      const uploadedVideo = await apiClient.uploadVideo(request);

      // Add tags if selected
      if (tagIds.length > 0) {
        try {
          await apiClient.addTagsToVideo(uploadedVideo.id, tagIds);
        } catch {
          // Silently fail if tag addition fails
          // The video upload itself was successful
        }
      }

      return uploadedVideo;
    });

    if (onSuccess) {
      onSuccess();
    }
  }, [uploadVideo, file, title, description, externalId, tagIds, setError]);

  return {
    file,
    title,
    description,
    externalId,
    tagIds,
    isUploading: isLoading,
    error,
    success,
    setTitle,
    setDescription,
    setExternalId,
    setTagIds,
    handleFileChange,
    handleSubmit,
    reset,
  };
}

