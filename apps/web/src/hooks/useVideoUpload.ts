import { useState, useCallback, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { getApiError } from '@/lib/api-error';
import { invalidateAfterVideoUpload } from '@/lib/cacheInvalidation';
import { useAuth } from '@/hooks/useAuth';
import { appTrpcClient } from '@/lib/trpc';
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
  handleSubmit: (e: React.FormEvent) => Promise<void>;
  reset: () => void;
}

const DEFAULT_MAX_VIDEO_UPLOAD_SIZE_MB = Number(import.meta.env.VITE_MAX_VIDEO_UPLOAD_SIZE_MB || 200);

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
  const uploadInFlight = useRef(false);
  const queryClient = useQueryClient();

  const uploadMutation = useMutation({
    mutationFn: async ({ command, tagIds }: RunUploadMutationVariables) => {
      return runUploadWorkflow(command, tagIds, {
        uploadVideo: (data, onProgress) => apiClient.uploadVideo(data, onProgress),
        createYoutubeVideo: (data) => appTrpcClient.videos.createYoutube.mutate({
          youtubeUrl: data.youtube_url,
          title: data.title,
          description: data.description,
        }),
        addTagsToVideo: (videoId, nextTagIds) => appTrpcClient.memberships.addTags.mutate({
          videoId,
          tagIds: nextTagIds,
        }),
      });
    },
    onSuccess: async ({ warning }, { tagIds }) => {
      setSuccess(true);
      setError(null);
      setErrorParams({});
      setWarning(warning?.message ?? null);
      setWarningParams(warning?.params ?? {});
      setProgress(100);
      await invalidateAfterVideoUpload(queryClient, { tagsChanged: tagIds.length > 0 });
    },
    onError: (err) => {
      const apiError = getApiError(err);
      if (err instanceof VideoUploadValidationError) {
        setError(err.translationKey);
        setErrorParams(err.params);
      } else if (apiError?.code === 'FILE_TOO_LARGE') {
        setError('videos.upload.validation.fileTooLarge');
        setErrorParams(apiError.params ?? {});
      } else if (apiError?.code === 'STORAGE_LIMIT_EXCEEDED') {
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

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (uploadInFlight.current) return;

    // Clear any progress left over from a previous submission before the
    // pending state flips, so the button never flashes a stale percentage.
    setProgress(0);

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
    // Guard before React renders the pending state, including cache refreshes.
    uploadInFlight.current = true;
    try {
      await uploadMutation.mutateAsync({ command, tagIds });
    } finally {
      uploadInFlight.current = false;
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
