import { useState } from 'react';
import { apiClient, VideoUploadRequest } from '@/lib/api';

interface UseVideoUploadReturn {
  file: File | null;
  title: string;
  description: string;
  isUploading: boolean;
  error: string | null;
  success: boolean;
  setFile: (file: File | null) => void;
  setTitle: (title: string) => void;
  setDescription: (description: string) => void;
  handleFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleSubmit: (e: React.FormEvent, onSuccess?: () => void, onComplete?: () => void) => Promise<void>;
  reset: () => void;
}

export function useVideoUpload(): UseVideoUploadReturn {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const reset = () => {
    setFile(null);
    setTitle('');
    setDescription('');
    setError(null);
    setSuccess(false);
  };

  const handleSubmit = async (
    e: React.FormEvent,
    onSuccess?: () => void
  ) => {
    e.preventDefault();
    
    if (!file) {
      setError('ファイルを選択してください');
      return;
    }

    if (!title.trim()) {
      setError('タイトルを入力してください');
      return;
    }

    setIsUploading(true);
    setError(null);
    setSuccess(false);

    try {
      const request: VideoUploadRequest = {
        file,
        title: title.trim(),
        description: description.trim() || undefined,
      };

      await apiClient.uploadVideo(request);
      setSuccess(true);

      if (onSuccess) {
        onSuccess();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'アップロードに失敗しました');
    } finally {
      setIsUploading(false);
    }
  };

  return {
    file,
    title,
    description,
    isUploading,
    error,
    success,
    setFile,
    setTitle,
    setDescription,
    handleFileChange,
    handleSubmit,
    reset,
  };
}

