import type { Video, VideoUploadRequest, YoutubeVideoCreateRequest } from './api';

export type UploadSourceMode = 'file' | 'youtube';

export interface UploadValidationSuccess {
  isValid: true;
}

export interface UploadValidationFailure {
  isValid: false;
  error: string;
  errorParams?: Record<string, unknown>;
}

export type UploadValidationResult = UploadValidationSuccess | UploadValidationFailure;

export interface UploadWarning {
  message: string;
  params?: Record<string, unknown>;
}

export interface UploadWorkflowResult {
  video: Video;
  warning?: UploadWarning;
}

export interface UploadCommandApi {
  uploadVideo: (
    data: VideoUploadRequest,
    onProgress?: (percent: number) => void,
  ) => Promise<Video>;
  createYoutubeVideo: (data: YoutubeVideoCreateRequest) => Promise<Video>;
  addTagsToVideo: (
    videoId: number,
    tagIds: number[],
  ) => Promise<{ message: string; added_count: number; skipped_count: number }>;
}

export interface UploadCommand {
  validate: () => UploadValidationResult;
  execute: (api: UploadCommandApi) => Promise<Video>;
}

export class VideoUploadValidationError extends Error {
  readonly translationKey: string;
  readonly params: Record<string, unknown>;

  constructor(result: UploadValidationFailure) {
    super(result.error);
    this.name = 'VideoUploadValidationError';
    this.translationKey = result.error;
    this.params = result.errorParams ?? {};
  }
}

interface FileUploadCommandInput {
  file: File | null;
  title: string;
  description: string;
  maxSizeMb: number;
  onProgress?: (percent: number) => void;
}

interface YoutubeImportCommandInput {
  youtubeUrl: string;
  title: string;
  description: string;
}

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

function titleFromFile(file: File, title: string): string {
  return title.trim() || file.name.replace(/\.[^/.]+$/, '');
}

function optionalTrimmed(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed || undefined;
}

function assertValid(result: UploadValidationResult): asserts result is UploadValidationSuccess {
  if (!result.isValid) {
    throw new VideoUploadValidationError(result);
  }
}

export class FileUploadCommand implements UploadCommand {
  private readonly input: FileUploadCommandInput;

  constructor(input: FileUploadCommandInput) {
    this.input = input;
  }

  validate(): UploadValidationResult {
    const { file, title, maxSizeMb } = this.input;

    if (!file) {
      return { isValid: false, error: 'videos.upload.validation.noFile' };
    }
    if (!isLikelyVideoFile(file)) {
      return { isValid: false, error: 'videos.upload.validation.invalidFileType' };
    }
    if (file.size > maxSizeMb * 1024 * 1024) {
      return {
        isValid: false,
        error: 'videos.upload.validation.fileTooLarge',
        errorParams: { max_size_mb: maxSizeMb },
      };
    }
    if (!titleFromFile(file, title)) {
      return { isValid: false, error: 'videos.upload.validation.noTitle' };
    }

    return { isValid: true };
  }

  async execute(api: UploadCommandApi): Promise<Video> {
    const validation = this.validate();
    assertValid(validation);

    const { file, title, description, onProgress } = this.input;
    if (!file) {
      throw new VideoUploadValidationError({
        isValid: false,
        error: 'videos.upload.validation.noFile',
      });
    }

    return api.uploadVideo(
      {
        file,
        title: titleFromFile(file, title),
        description: optionalTrimmed(description),
      },
      onProgress,
    );
  }
}

export class YoutubeImportCommand implements UploadCommand {
  private readonly input: YoutubeImportCommandInput;

  constructor(input: YoutubeImportCommandInput) {
    this.input = input;
  }

  validate(): UploadValidationResult {
    const { youtubeUrl, title } = this.input;

    if (!youtubeUrl.trim()) {
      return { isValid: false, error: 'videos.upload.validation.noYoutubeUrl' };
    }
    if (!title.trim()) {
      return { isValid: false, error: 'videos.upload.validation.noTitle' };
    }

    return { isValid: true };
  }

  async execute(api: UploadCommandApi): Promise<Video> {
    const validation = this.validate();
    assertValid(validation);

    const { youtubeUrl, title, description } = this.input;
    return api.createYoutubeVideo({
      youtube_url: youtubeUrl.trim(),
      title: title.trim(),
      description: optionalTrimmed(description),
    });
  }
}

export async function assignTagsAfterUpload(
  api: UploadCommandApi,
  videoId: number,
  tagIds: number[],
): Promise<UploadWarning | undefined> {
  if (tagIds.length === 0) {
    return undefined;
  }

  try {
    await api.addTagsToVideo(videoId, tagIds);
    return undefined;
  } catch {
    return { message: 'videos.upload.warning.tagsFailed' };
  }
}

export async function runUploadWorkflow(
  command: UploadCommand,
  tagIds: number[],
  api: UploadCommandApi,
): Promise<UploadWorkflowResult> {
  const video = await command.execute(api);
  const warning = tagIds.length > 0
    ? await assignTagsAfterUpload(api, video.id, tagIds)
    : undefined;

  return warning ? { video, warning } : { video };
}
