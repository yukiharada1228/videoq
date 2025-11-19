import { useState, useCallback } from 'react';
import { apiClient, VideoUploadRequest } from '@/lib/api';
import { initI18n } from '@/i18n/config';
import { useAsyncState } from './useAsyncState';

interface UseVideoUploadReturn {
  file: File | null;
  title: string;
  description: string;
  isUploading: boolean;
  error: string | null;
  success: boolean;
  setTitle: (title: string) => void;
  setDescription: (description: string) => void;
  handleFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleSubmit: (e: React.FormEvent, onSuccess?: () => void) => Promise<void>;
  reset: () => void;
}

interface ValidationResult {
  isValid: boolean;
  error?: string;
}

/**
 * Get video duration in seconds
 */
async function getVideoDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    
    video.onloadedmetadata = () => {
      window.URL.revokeObjectURL(video.src);
      resolve(video.duration);
    };
    
    video.onerror = () => {
      window.URL.revokeObjectURL(video.src);
      resolve(null);
    };
    
    video.src = URL.createObjectURL(file);
  });
}

/**
 * Validation logic
 */
const i18n = initI18n();

const MAX_VIDEO_DURATION_MINUTES = 120; // Must match backend settings

async function validateVideoUpload(
  file: File | null,
  title: string
): Promise<ValidationResult> {
  if (!file) {
    return { isValid: false, error: i18n.t('videos.upload.validation.noFile') };
  }
  // File is OK if title is empty since filename will be used
  const finalTitle = title.trim() || file.name.replace(/\.[^/.]+$/, '');
  if (!finalTitle) {
    return { isValid: false, error: i18n.t('videos.upload.validation.noTitle') };
  }

  // Check video duration
  const duration = await getVideoDuration(file);
  if (duration !== null) {
    const maxDurationSeconds = MAX_VIDEO_DURATION_MINUTES * 60;
    if (duration > maxDurationSeconds) {
      const durationMinutes = Math.round((duration / 60) * 10) / 10;
      return {
        isValid: false,
        error: i18n.t('videos.upload.validation.maxDurationExceeded', {
          max: MAX_VIDEO_DURATION_MINUTES,
          actual: durationMinutes,
        }),
      };
    }
  }

  return { isValid: true };
}

export function useVideoUpload(): UseVideoUploadReturn {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
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
    setSuccess(false);
    setError(null);
  }, [setError]);

  const handleSubmit = useCallback(async (e: React.FormEvent, onSuccess?: () => void) => {
    e.preventDefault();
    
    const validation = await validateVideoUpload(file, title);
    if (!validation.isValid) {
      setError(validation.error || i18n.t('videos.upload.validation.generic'));
      return;
    }

    await uploadVideo(async () => {
      // Use filename (without extension) if title is empty
      const finalTitle = title.trim() || (file ? file.name.replace(/\.[^/.]+$/, '') : '');
      
      const request: VideoUploadRequest = {
        file: file!,
        title: finalTitle,
        description: description.trim() || undefined,
      };

      await apiClient.uploadVideo(request);
      return request;
    });

    if (onSuccess) {
      onSuccess();
    }
  }, [uploadVideo, file, title, description, setError]);

  return {
    file,
    title,
    description,
    isUploading: isLoading,
    error,
    success,
    setTitle,
    setDescription,
    handleFileChange,
    handleSubmit,
    reset,
  };
}

