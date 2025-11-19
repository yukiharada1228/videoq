import { useState, useCallback } from 'react';
import { apiClient, VideoUploadRequest } from '@/lib/api';
import { initI18n } from '@/i18n/config';
import { useAsyncState } from './useAsyncState';

interface UseVideoUploadReturn {
  file: File | null;
  youtubeUrl: string;
  title: string;
  description: string;
  isUploading: boolean;
  error: string | null;
  success: boolean;
  setTitle: (title: string) => void;
  setDescription: (description: string) => void;
  setYoutubeUrl: (url: string) => void;
  handleFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleSubmit: (e: React.FormEvent, onSuccess?: () => void) => Promise<void>;
  reset: () => void;
}

interface ValidationResult {
  isValid: boolean;
  error?: string;
}

/**
 * バリデーションロジック
 */
const i18n = initI18n();

function validateVideoUpload(file: File | null, youtubeUrl: string, title: string): ValidationResult {
  // Either file or YouTube URL must be provided
  if (!file && !youtubeUrl.trim()) {
    return { isValid: false, error: i18n.t('videos.upload.validation.noFileOrUrl', { defaultValue: 'ファイルまたはYouTube URLを入力してください' }) };
  }

  // Cannot provide both
  if (file && youtubeUrl.trim()) {
    return { isValid: false, error: i18n.t('videos.upload.validation.bothProvided', { defaultValue: 'ファイルとYouTube URLの両方を指定することはできません' }) };
  }

  // Validate YouTube URL format if provided
  if (youtubeUrl.trim() && !file) {
    const urlPattern = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/;
    if (!urlPattern.test(youtubeUrl.trim())) {
      return { isValid: false, error: i18n.t('videos.upload.validation.invalidYoutubeUrl', { defaultValue: '有効なYouTube URLを入力してください' }) };
    }
  }

  // Title validation
  const finalTitle = title.trim() || (file ? file.name.replace(/\.[^/.]+$/, '') : '');
  if (!finalTitle) {
    return { isValid: false, error: i18n.t('videos.upload.validation.noTitle') };
  }
  return { isValid: true };
}

export function useVideoUpload(): UseVideoUploadReturn {
  const [file, setFile] = useState<File | null>(null);
  const [youtubeUrl, setYoutubeUrl] = useState('');
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
      // Clear YouTube URL when file is selected
      setYoutubeUrl('');
      // Automatically set filename (without extension) as title
      const fileNameWithoutExt = selectedFile.name.replace(/\.[^/.]+$/, '');
      setTitle(fileNameWithoutExt);
    }
  }, []);

  const reset = useCallback(() => {
    setFile(null);
    setYoutubeUrl('');
    setTitle('');
    setDescription('');
    setSuccess(false);
    setError(null);
  }, [setError]);

  const handleSubmit = useCallback(async (e: React.FormEvent, onSuccess?: () => void) => {
    e.preventDefault();
    
    const validation = validateVideoUpload(file, youtubeUrl, title);
    if (!validation.isValid) {
      setError(validation.error || i18n.t('videos.upload.validation.generic'));
      return;
    }

    await uploadVideo(async () => {
      // Use filename (without extension) if title is empty
      const finalTitle = title.trim() || (file ? file.name.replace(/\.[^/.]+$/, '') : '');
      
      const request: VideoUploadRequest = {
        file: file || undefined,
        youtube_url: youtubeUrl.trim() || undefined,
        title: finalTitle,
        description: description.trim() || undefined,
      };

      await apiClient.uploadVideo(request);
      return request;
    });

    if (onSuccess) {
      onSuccess();
    }
  }, [uploadVideo, file, youtubeUrl, title, description, setError]);

  return {
    file,
    youtubeUrl,
    title,
    description,
    isUploading: isLoading,
    error,
    success,
    setTitle,
    setDescription,
    setYoutubeUrl,
    handleFileChange,
    handleSubmit,
    reset,
  };
}

