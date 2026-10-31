import { useFilm } from '../film';

export function useVideoUpload() {
  const { upload } = useFilm();
  return {
    ...upload,
    sourceMode: 'file' as const,
    youtubeUrl: '',
    description: '',
    tagIds: [] as number[],
    isCompressing: false,
    compressionPreset: '1080p' as const,
    compressionSupported: true,
    compressedSizes: null,
    setCompressionPreset: () => {},
    cancelCompression: () => {},
    error: null,
    errorParams: {},
    warning: null,
    setTitle: () => {},
    setDescription: () => {},
    setYoutubeUrl: () => {},
    setSourceMode: () => {},
    setTagIds: () => {},
    handleFileChange: () => {},
    handleSubmit: async () => {},
    reset: () => {},
  };
}
