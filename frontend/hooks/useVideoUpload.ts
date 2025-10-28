import { useState } from 'react';
import { apiClient, VideoUploadRequest } from '@/lib/api';
import { useFormState } from './useFormState';

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
  const [success, setSuccess] = useState(false);

  const { formData, isLoading, error, updateField, handleSubmit, reset: resetForm, setError } = useFormState({
    initialData: { title: '', description: '' },
    validate: (data) => validateVideoUpload(file, data.title),
    onSubmit: async (data) => {
      const request: VideoUploadRequest = {
        file: file!,
        title: data.title.trim(),
        description: data.description.trim() || undefined,
      };

      await apiClient.uploadVideo(request);
      setSuccess(true);
    },
    onSuccess: () => {
      setSuccess(true);
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const reset = () => {
    setFile(null);
    setSuccess(false);
    resetForm();
  };

  const handleSubmitWithCallback = async (e: React.FormEvent, onSuccess?: () => void) => {
    await handleSubmit(e);
    if (onSuccess) {
      onSuccess();
    }
  };

  return {
    file,
    title: formData.title,
    description: formData.description,
    isUploading: isLoading,
    error,
    success,
    setTitle: (title: string) => updateField('title', title),
    setDescription: (description: string) => updateField('description', description),
    handleFileChange,
    handleSubmit: handleSubmitWithCallback,
    reset,
  };
}

