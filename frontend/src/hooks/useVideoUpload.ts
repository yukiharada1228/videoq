import { useState, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient, ApiError, type VideoUploadRequest } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import { useAuth } from '@/hooks/useAuth';

interface UseVideoUploadReturn {
  file: File | null;
  title: string;
  description: string;
  tagIds: number[];
  isUploading: boolean;
  progress: number;
  error: string | null;
  errorParams: Record<string, unknown>;
  success: boolean;
  setTitle: (title: string) => void;
  setDescription: (description: string) => void;
  setTagIds: React.Dispatch<React.SetStateAction<number[]>>;
  handleFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleSubmit: (e: React.FormEvent, onSuccess?: () => void) => Promise<void>;
  reset: () => void;
}

interface ValidationResult {
  isValid: boolean;
  error?: string;
}

const DEFAULT_MAX_VIDEO_UPLOAD_SIZE_MB = Number(import.meta.env.VITE_MAX_VIDEO_UPLOAD_SIZE_MB || 500);
const ALLOWED_VIDEO_EXTENSIONS = [
  '.mp4',
  '.mov',
  '.avi',
  '.mkv',
  '.webm',
  '.m4v',
  '.mpeg',
  '.mpg',
  '.3gp',
];

function isLikelyVideoFile(file: File): boolean {
  if (file.type.startsWith('video/')) {
    return true;
  }

  const lowerName = file.name.toLowerCase();
  return ALLOWED_VIDEO_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
}

/**
 * Validation logic
 * Returns translation keys for errors
 */
function validateVideoUpload(file: File | null, title: string, maxSizeMb: number): ValidationResult {
  if (!file) {
    return { isValid: false, error: 'videos.upload.validation.noFile' };
  }
  if (!isLikelyVideoFile(file)) {
    return { isValid: false, error: 'videos.upload.validation.invalidFileType' };
  }
  if (file.size > maxSizeMb * 1024 * 1024) {
    return { isValid: false, error: 'videos.upload.validation.fileTooLarge' };
  }
  // File is OK if title is empty since filename will be used
  const finalTitle = title.trim() || file.name.replace(/\.[^/.]+$/, '');
  if (!finalTitle) {
    return { isValid: false, error: 'videos.upload.validation.noTitle' };
  }
  return { isValid: true };
}

export function useVideoUpload(): UseVideoUploadReturn {
  const { user } = useAuth({ redirectToLogin: false });
  const maxUploadSizeMb = user?.max_video_upload_size_mb ?? DEFAULT_MAX_VIDEO_UPLOAD_SIZE_MB;
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tagIds, setTagIds] = useState<number[]>([]);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorParams, setErrorParams] = useState<Record<string, unknown>>({});
  const [progress, setProgress] = useState(0);
  const queryClient = useQueryClient();

  const uploadMutation = useMutation({
    mutationFn: async () => {
      setProgress(0);
      // Use filename (without extension) if title is empty
      const finalTitle = title.trim() || (file ? file.name.replace(/\.[^/.]+$/, '') : '');

      const request: VideoUploadRequest = {
        file: file!,
        title: finalTitle,
        description: description.trim() || undefined,
      };

      const uploadedVideo = await apiClient.uploadVideo(request, (pct) => {
        setProgress(pct);
      });

      if (tagIds.length > 0) {
        try {
          await apiClient.addTagsToVideo(uploadedVideo.id, tagIds);
        } catch {
          // Silently fail if tag addition fails; upload itself succeeded.
        }
      }

      return uploadedVideo;
    },
    onSuccess: async () => {
      setSuccess(true);
      setError(null);
      setErrorParams({});
      setProgress(100);
      await queryClient.invalidateQueries({ queryKey: queryKeys.videos.all });
    },
    onError: (err) => {
      if (err instanceof ApiError && err.code === 'FILE_TOO_LARGE') {
        setError('videos.upload.validation.fileTooLarge');
        setErrorParams(err.params ?? {});
      } else {
        setError(err instanceof Error ? err.message : String(err));
        setErrorParams({});
      }
      setProgress(0);
    },
  });

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      const validation = validateVideoUpload(selectedFile, title, maxUploadSizeMb);
      if (!validation.isValid) {
        setFile(null);
        setTitle('');
        setError(validation.error || 'videos.upload.validation.generic');
        setErrorParams(validation.error === 'videos.upload.validation.fileTooLarge'
          ? { max_size_mb: maxUploadSizeMb }
          : {});
        return;
      }

      setError(null);
      setErrorParams({});
      setFile(selectedFile);
      // Automatically set filename (without extension) as title
      const fileNameWithoutExt = selectedFile.name.replace(/\.[^/.]+$/, '');
      setTitle(fileNameWithoutExt);
    }
  }, [setTitle, title, maxUploadSizeMb]);

  const reset = useCallback(() => {
    setFile(null);
    setTitle('');
    setDescription('');
    setTagIds([]);
    setSuccess(false);
    setError(null);
    setErrorParams({});
    setProgress(0);
  }, []);

  const handleSubmit = useCallback(async (e: React.FormEvent, onSuccess?: () => void) => {
    e.preventDefault();

    const validation = validateVideoUpload(file, title, maxUploadSizeMb);
    if (!validation.isValid) {
      setError(validation.error || 'videos.upload.validation.generic');
      setErrorParams(validation.error === 'videos.upload.validation.fileTooLarge'
        ? { max_size_mb: maxUploadSizeMb }
        : {});
      return;
    }

    setError(null);
    setErrorParams({});
    setSuccess(false);
    await uploadMutation.mutateAsync();

    if (onSuccess) {
      onSuccess();
    }
  }, [uploadMutation, file, title, setError, maxUploadSizeMb]);

  return {
    file,
    title,
    description,
    tagIds,
    isUploading: uploadMutation.isPending,
    progress,
    error,
    errorParams,
    success,
    setTitle,
    setDescription,
    setTagIds,
    handleFileChange,
    handleSubmit,
    reset,
  };
}
