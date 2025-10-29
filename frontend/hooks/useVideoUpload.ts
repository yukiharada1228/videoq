import { useState, useCallback } from 'react';
import { apiClient, VideoUploadRequest } from '@/lib/api';
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
 * バリデーションロジック（DRY原則）
 */
function validateVideoUpload(file: File | null, title: string): ValidationResult {
  if (!file) {
    return { isValid: false, error: 'ファイルを選択してください' };
  }
  if (!title.trim()) {
    return { isValid: false, error: 'タイトルを入力してください' };
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
      setFile(e.target.files[0]);
    }
  }, []);

  const reset = useCallback(() => {
    setFile(null);
    setTitle('');
    setDescription('');
    setSuccess(false);
    setError(null);
  }, [setError]);

  const handleSubmit = useCallback(async (e: React.FormEvent, onSuccess?: () => void) => {
    e.preventDefault();
    
    const validation = validateVideoUpload(file, title);
    if (!validation.isValid) {
      setError(validation.error || 'バリデーションエラー');
      return;
    }

    await uploadVideo(async () => {
      const request: VideoUploadRequest = {
        file: file!,
        title: title.trim(),
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

