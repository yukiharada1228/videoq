import { useState, useCallback, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { getApiError } from '@/lib/api-error';
import { invalidateAfterVideoUpload } from '@/lib/cacheInvalidation';
import { useAuth } from '@/hooks/useAuth';
import { appTrpcClient } from '@/lib/trpc';
import { trackLandingEvent } from '@/lib/landingAnalytics';
import {
  prepareVideoUpload,
  runUploadWorkflow,
  type PreparedUpload,
  type UploadSourceMode,
} from '@/lib/videoUpload';

interface UseVideoUploadReturn {
  sourceMode: UploadSourceMode;
  youtubeUrl: string;
  title: string;
  description: string;
  tagIds: number[];
  isUploading: boolean;
  progress: number;
  error: string | null;
  errorParams: Record<string, unknown>;
  warning: string | null;
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
  upload: PreparedUpload;
  tagIds: number[];
}

export function useVideoUpload(): UseVideoUploadReturn {
  const { user } = useAuth();
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
  const [progress, setProgress] = useState(0);
  const uploadInFlight = useRef(false);
  const queryClient = useQueryClient();

  const uploadMutation = useMutation({
    mutationFn: ({ upload, tagIds }: RunUploadMutationVariables) =>
      runUploadWorkflow(upload, tagIds, {
        uploadVideo: (data, onProgress) => apiClient.uploadVideo(data, onProgress),
        createYoutubeVideo: appTrpcClient.videos.createYoutube.mutate,
        addTagsToVideo: appTrpcClient.memberships.addTags.mutate,
      }, setProgress),
    onSuccess: async (warning, { tagIds }) => {
      // Acceptance is distinct from completion of transcription/indexing.
      trackLandingEvent('video_upload_accepted');
      setSuccess(true);
      setError(null);
      setErrorParams({});
      setWarning(warning);
      setProgress(100);
      await invalidateAfterVideoUpload(queryClient, { tagsChanged: tagIds.length > 0 });
    },
    onError: (err) => {
      trackLandingEvent('video_upload_failed');
      const apiError = getApiError(err);
      if (apiError?.code === 'FILE_TOO_LARGE') {
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
      setProgress(0);
    },
  });

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (sourceMode !== 'file') {
      return;
    }
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      const validation = prepareVideoUpload({
        source: 'file',
        file: selectedFile,
        title: '',
        description: '',
        maxSizeMb: maxUploadSizeMb,
      });
      if (!validation.isValid) {
        setFile(null);
        setTitle('');
        setError(validation.error);
        setErrorParams(validation.errorParams ?? {});
        setWarning(null);
        return;
      }

      setError(null);
      setErrorParams({});
      setWarning(null);
      setFile(selectedFile);
      // Automatically set filename (without extension) as title
      setTitle(validation.upload.data.title);
    }
  }, [maxUploadSizeMb, sourceMode]);

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
    setProgress(0);
  }, []);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (uploadInFlight.current) return;

    // Clear any progress left over from a previous submission before the
    // pending state flips, so the button never flashes a stale percentage.
    setProgress(0);

    const validation = prepareVideoUpload(sourceMode === 'youtube'
      ? { source: 'youtube', youtubeUrl, title, description }
      : { source: 'file', file, title, description, maxSizeMb: maxUploadSizeMb });
    if (!validation.isValid) {
      setError(validation.error);
      setErrorParams(validation.errorParams ?? {});
      setWarning(null);
      return;
    }

    setError(null);
    setErrorParams({});
    setWarning(null);
    setSuccess(false);
    // Guard before React renders the pending state, including cache refreshes.
    uploadInFlight.current = true;
    trackLandingEvent('video_upload_started');
    try {
      await uploadMutation.mutateAsync({ upload: validation.upload, tagIds });
    } finally {
      uploadInFlight.current = false;
    }
  }, [sourceMode, youtubeUrl, title, description, file, maxUploadSizeMb, tagIds, uploadMutation]);

  return {
    sourceMode,
    youtubeUrl,
    title,
    description,
    tagIds,
    isUploading: uploadMutation.isPending,
    progress,
    error,
    errorParams,
    warning,
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
