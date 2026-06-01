import { useState, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient, ApiError } from '@/lib/api';
import { invalidateAfterVideoUpload } from '@/lib/cacheInvalidation';
import { useAuth } from '@/hooks/useAuth';
import {
  FileUploadCommand,
  VideoUploadValidationError,
  YoutubeImportCommand,
  runUploadWorkflow,
  type UploadCommand,
  type UploadSourceMode,
} from '@/lib/videoUploadCommands';

interface UseVideoUploadReturn {
  sourceMode: UploadSourceMode;
  file: File | null;
  youtubeUrl: string;
  title: string;
  description: string;
  tagIds: number[];
  isUploading: boolean;
  progress: number;
  error: string | null;
  errorParams: Record<string, unknown>;
  warning: string | null;
  warningParams: Record<string, unknown>;
  success: boolean;
  setTitle: (title: string) => void;
  setDescription: (description: string) => void;
  setYoutubeUrl: (url: string) => void;
  setSourceMode: (mode: UploadSourceMode) => void;
  setTagIds: React.Dispatch<React.SetStateAction<number[]>>;
  handleFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleSubmit: (e: React.FormEvent, onSuccess?: () => void) => Promise<void>;
  reset: () => void;
}

const DEFAULT_MAX_VIDEO_UPLOAD_SIZE_MB = Number(import.meta.env.VITE_MAX_VIDEO_UPLOAD_SIZE_MB || 500);

interface RunUploadMutationVariables {
  command: UploadCommand;
  tagIds: number[];
}

export function useVideoUpload(): UseVideoUploadReturn {
  const { user } = useAuth({ redirectToLogin: false });
  const maxUploadSizeMb = user?.max_video_upload_size_mb ?? DEFAULT_MAX_VIDEO_UPLOAD_SIZE_MB;
  const [sourceMode, setSourceMode] = useState<UploadSourceMode>('file');
  const [file, setFile] = useState<File | null>(null);
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tagIds, setTagIds] = useState<number[]>([]);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorParams, setErrorParams] = useState<Record<string, unknown>>({});
  const [warning, setWarning] = useState<string | null>(null);
  const [warningParams, setWarningParams] = useState<Record<string, unknown>>({});
  const [progress, setProgress] = useState(0);
  const queryClient = useQueryClient();

  const uploadMutation = useMutation({
    mutationFn: async ({ command, tagIds }: RunUploadMutationVariables) => {
      setProgress(0);
      return runUploadWorkflow(command, tagIds, apiClient);
    },
    onSuccess: async ({ warning }) => {
      setSuccess(true);
      setError(null);
      setErrorParams({});
      setWarning(warning?.message ?? null);
      setWarningParams(warning?.params ?? {});
      setProgress(100);
      await invalidateAfterVideoUpload(queryClient);
    },
    onError: (err) => {
      if (err instanceof VideoUploadValidationError) {
        setError(err.translationKey);
        setErrorParams(err.params);
      } else if (err instanceof ApiError && err.code === 'FILE_TOO_LARGE') {
        setError('videos.upload.validation.fileTooLarge');
        setErrorParams(err.params ?? {});
      } else if (err instanceof ApiError && err.code === 'STORAGE_LIMIT_EXCEEDED') {
        setError('videos.upload.validation.storageLimitExceeded');
        setErrorParams({});
      } else {
        setError(err instanceof Error ? err.message : String(err));
        setErrorParams({});
      }
      setWarning(null);
      setWarningParams({});
      setProgress(0);
    },
  });

  const createUploadCommand = useCallback((progressHandler?: (pct: number) => void): UploadCommand => {
    if (sourceMode === 'youtube') {
      return new YoutubeImportCommand({
        youtubeUrl,
        title,
        description,
      });
    }

    return new FileUploadCommand({
      file,
      title,
      description,
      maxSizeMb: maxUploadSizeMb,
      onProgress: progressHandler,
    });
  }, [description, file, maxUploadSizeMb, sourceMode, title, youtubeUrl]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (sourceMode !== 'file') {
      return;
    }
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      const validation = new FileUploadCommand({
        file: selectedFile,
        title,
        description,
        maxSizeMb: maxUploadSizeMb,
      }).validate();
      if (!validation.isValid) {
        setFile(null);
        setTitle('');
        setError(validation.error);
        setErrorParams(validation.errorParams ?? {});
        setWarning(null);
        setWarningParams({});
        return;
      }

      setError(null);
      setErrorParams({});
      setWarning(null);
      setWarningParams({});
      setFile(selectedFile);
      // Automatically set filename (without extension) as title
      const fileNameWithoutExt = selectedFile.name.replace(/\.[^/.]+$/, '');
      setTitle(fileNameWithoutExt);
    }
  }, [description, setTitle, title, maxUploadSizeMb, sourceMode]);

  const reset = useCallback(() => {
    setSourceMode('file');
    setFile(null);
    setYoutubeUrl('');
    setTitle('');
    setDescription('');
    setTagIds([]);
    setSuccess(false);
    setError(null);
    setErrorParams({});
    setWarning(null);
    setWarningParams({});
    setProgress(0);
  }, []);

  const handleSubmit = useCallback(async (e: React.FormEvent, onSuccess?: () => void) => {
    e.preventDefault();

    const command = createUploadCommand((pct) => {
      setProgress(pct);
    });
    const validation = command.validate();
    if (!validation.isValid) {
      setError(validation.error);
      setErrorParams(validation.errorParams ?? {});
      setWarning(null);
      setWarningParams({});
      return;
    }

    setError(null);
    setErrorParams({});
    setWarning(null);
    setWarningParams({});
    setSuccess(false);
    await uploadMutation.mutateAsync({ command, tagIds });

    if (onSuccess) {
      onSuccess();
    }
  }, [createUploadCommand, tagIds, uploadMutation]);

  return {
    sourceMode,
    file,
    youtubeUrl,
    title,
    description,
    tagIds,
    isUploading: uploadMutation.isPending,
    progress,
    error,
    errorParams,
    warning,
    warningParams,
    success,
    setTitle,
    setDescription,
    setYoutubeUrl,
    setSourceMode,
    setTagIds,
    handleFileChange,
    handleSubmit,
    reset,
  };
}
