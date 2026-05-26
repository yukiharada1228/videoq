import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useI18nNavigate, useLocale } from '@/lib/i18n';
import { useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useVideo } from '@/hooks/useVideos';
import { apiClient } from '@/lib/api';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { InlineSpinner } from '@/components/common/InlineSpinner';
import { formatDate } from '@/lib/utils/video';
import { TagSelector } from '@/components/video/TagSelector';
import { TagCreateDialog } from '@/components/video/TagCreateDialog';
import { useTags } from '@/hooks/useTags';
import { useVideoEditing } from '@/hooks/useVideoEditing';
import { useVideoDetailPageMutations } from '@/hooks/useVideoDetailPageData';
import { queryKeys } from '@/lib/queryKeys';
import { AppNav } from '@/components/layout/AppNav';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  ArrowLeft, Calendar, CheckCircle, Search,
  Trash2, Pencil, X, Save, Video as VideoIcon,
  Play, AlignLeft,
} from 'lucide-react';

// ── Transcript parser ─────────────────────────────────────────────────────────

interface TranscriptSegment {
  timestamp: string;
  seconds: number;
  text: string;
}

function buildYoutubeEmbedSrc(embedUrl: string, startSeconds: number | null): string {
  if (startSeconds === null) {
    return embedUrl;
  }
  return `${embedUrl}?autoplay=1&start=${startSeconds}`;
}

function isSRTFormat(text: string): boolean {
  return /\d{2}:\d{2}:\d{2}[,.]\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}[,.]\d{3}/.test(text);
}

function parseSRTTranscript(srt: string): TranscriptSegment[] {
  const segments: TranscriptSegment[] = [];
  const blocks = srt.trim().split(/\n\s*\n/);

  for (const block of blocks) {
    const lines = block.trim().split('\n');
    const timingLine = lines.find((l) => l.includes('-->'));
    if (!timingLine) continue;

    const match = timingLine.match(/(\d{2}):(\d{2}):(\d{2})[,.](\d{3})/);
    if (!match) continue;

    const h = parseInt(match[1], 10);
    const m = parseInt(match[2], 10);
    const s = parseInt(match[3], 10);
    const seconds = h * 3600 + m * 60 + s;
    const timestamp = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;

    const timingLineIdx = lines.indexOf(timingLine);
    const text = lines
      .slice(timingLineIdx + 1)
      .filter((l) => !/^\d+$/.test(l.trim()))
      .join(' ')
      .trim();

    if (text) segments.push({ timestamp, seconds, text });
  }
  return segments;
}

// ── Status helpers ────────────────────────────────────────────────────────────

function getStatusClassName(status: string): string {
  switch (status) {
    case 'completed': return 'bg-[#d3ffd5] text-[#006d30]';
    case 'error':     return 'bg-red-100 text-red-700';
    case 'indexing':
    case 'processing':return 'bg-[#ffdcc3] text-[#2f1500]';
    default:          return 'bg-gray-100 text-gray-500';
  }
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function VideoDetailPage() {
  const params = useParams<{ id: string }>();
  const navigate = useI18nNavigate();
  const [searchParams] = useSearchParams();
  const videoId = params?.id ? Number.parseInt(params.id, 10) : null;
  const videoRef = useRef<HTMLVideoElement>(null);
  const startTime = searchParams.get('t');
  const [manualYoutubeStartSeconds, setManualYoutubeStartSeconds] = useState<number | null>(null);
  const { t } = useTranslation();
  const locale = useLocale();
  const queryClient = useQueryClient();

  const [transcriptSearch, setTranscriptSearch] = useState('');
  const [isTranscriptEditing, setIsTranscriptEditing] = useState(false);
  const [editedTranscript, setEditedTranscript] = useState('');
  const [transcriptSaveError, setTranscriptSaveError] = useState<string | null>(null);
  const [activeSegmentIdx, setActiveSegmentIdx] = useState<number | null>(null);
  const [mobileTab, setMobileTab] = useState<'transcript' | 'video'>('video');
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 1024);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const { video, isLoading, error } = useVideo(videoId);
  const { tags, createTag } = useTags();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);

  const {
    isEditing,
    editedTitle,
    editedDescription,
    editedTagIds,
    setEditedTitle,
    setEditedDescription,
    setEditedTagIds,
    startEditing,
    cancelEditing,
    handleUpdateVideo,
  } = useVideoEditing({ video, videoId });

  const handleCreateTag = useCallback(async (name: string, color: string) => {
    const newTag = await createTag(name, color);
    setEditedTagIds((prev) => (prev.includes(newTag.id) ? prev : [...prev, newTag.id]));
  }, [createTag, setEditedTagIds]);

  const handleVideoLoaded = () => {
    if (videoRef.current && startTime) {
      const seconds = Number.parseInt(startTime, 10);
      if (!Number.isNaN(seconds)) {
        videoRef.current.currentTime = seconds;
        void videoRef.current.play();
      }
    }
  };

  const queryYoutubeStartSeconds = (() => {
    if (!startTime) {
      return null;
    }
    const seconds = Number.parseInt(startTime, 10);
    return Number.isNaN(seconds) ? null : seconds;
  })();

  const youtubeStartSeconds = manualYoutubeStartSeconds ?? queryYoutubeStartSeconds;

  const [deleteError, setDeleteError] = useState<string | null>(null);

  const { deleteMutation, updateMutation } = useVideoDetailPageMutations({
    videoId,
    onDeleteSuccess: () => navigate('/videos'),
    onUpdate: handleUpdateVideo,
    onUpdateSuccess: cancelEditing,
    onDeleteError: (err) => setDeleteError(err instanceof Error ? err.message : String(err)),
  });

  const isDeleting = deleteMutation.isPending;
  const isUpdating = updateMutation.isPending;
  const updateError = updateMutation.error instanceof Error ? updateMutation.error.message : null;

  const transcriptUpdateMutation = useMutation({
    mutationFn: async () => {
      if (!videoId) return;
      await apiClient.updateVideo(videoId, { transcript: editedTranscript });
    },
    onSuccess: async () => {
      if (videoId) {
        await queryClient.invalidateQueries({ queryKey: queryKeys.videos.detail(videoId) });
        await queryClient.invalidateQueries({ queryKey: ['videoGroup'] });
        await queryClient.invalidateQueries({ queryKey: ['sharedVideoGroup'] });
        await queryClient.invalidateQueries({ queryKey: ['popularScenes'] });
      }
      setIsTranscriptEditing(false);
      setTranscriptSearch('');
      setTranscriptSaveError(null);
    },
    onError: (err: unknown) => {
      setTranscriptSaveError(err instanceof Error ? err.message : String(err));
    },
  });

  const startTranscriptEditing = () => {
    setEditedTranscript(video?.transcript ?? '');
    setTranscriptSaveError(null);
    setIsTranscriptEditing(true);
  };

  const cancelTranscriptEditing = () => {
    setEditedTranscript(video?.transcript ?? '');
    setTranscriptSaveError(null);
    setIsTranscriptEditing(false);
  };

  // Transcript parsing
  const transcript = video?.transcript ?? null;
  const transcriptSegments = useMemo<TranscriptSegment[]>(() => {
    if (!transcript || !isSRTFormat(transcript)) return [];
    return parseSRTTranscript(transcript);
  }, [transcript]);

  const filteredSegments = useMemo(() => {
    const q = transcriptSearch.trim().toLowerCase();
    if (!q) return transcriptSegments;
    return transcriptSegments.filter((s) => s.text.toLowerCase().includes(q));
  }, [transcriptSegments, transcriptSearch]);

  const handleSeek = (seconds: number, idx: number) => {
    if (video?.source_type === 'youtube') {
      setManualYoutubeStartSeconds(seconds);
    } else if (videoRef.current) {
      videoRef.current.currentTime = seconds;
      void videoRef.current.play();
    }
    setActiveSegmentIdx(idx);
  };

  // ── Loading / error states ───────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f8faf5]">
        <LoadingSpinner />
      </div>
    );
  }

  if (error && !video) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#f8faf5] gap-4">
        <p className="text-red-500">{error}</p>
        <Link href="/videos" className="text-[#00652c] font-bold hover:underline flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" />
          {t('common.actions.backToList')}
        </Link>
      </div>
    );
  }

  if (!video) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f8faf5]">
        <p className="text-[#3f493f]">{t('common.messages.videoNotFound')}</p>
      </div>
    );
  }

  const statusClassName = getStatusClassName(video.status);
  const isPlainTextTranscript = video.transcript?.trim() && !isSRTFormat(video.transcript);

  const pipelineSteps = [
    { key: 'upload',     label: t('videos.detail.pipeline.upload'),     doneStatuses: ['processing', 'indexing', 'completed', 'error'] },
    { key: 'transcript', label: t('videos.detail.pipeline.transcript'), doneStatuses: ['indexing', 'completed'] },
    { key: 'aiAnalysis', label: t('videos.detail.pipeline.aiAnalysis'), doneStatuses: ['completed'] },
  ] as { key: string; label: string; doneStatuses: string[] }[];

  return (
    <>
      <div
        className="bg-[#f8faf5] flex flex-col min-h-screen"
        style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
      >
        {/* ── Header ───────────────────────────────────────────────────────── */}
        <AppNav activePage="videos" />

        {/* ── Edit Modal ───────────────────────────────────────────────────── */}
        <Dialog open={isEditing} onOpenChange={(open) => !open && cancelEditing()}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{t('videos.detail.editButton')}</DialogTitle>
              <DialogDescription>
                {t('videos.detail.editDescriptionLabel')}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              {updateError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">{updateError}</div>
              )}
              <div className="space-y-1">
                <label className="text-xs font-bold text-[#3f493f]">{t('videos.detail.editTitleLabel')}</label>
                <input
                  type="text"
                  value={editedTitle}
                  onChange={(e) => setEditedTitle(e.target.value)}
                  disabled={isUpdating}
                  className="w-full px-3 py-2.5 bg-[#f2f4ef] border border-[#e1e3de] rounded-xl text-sm focus:ring-2 focus:ring-[#00652c]/20 focus:border-[#00652c] outline-none transition-all"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-[#3f493f]">{t('videos.detail.editDescriptionLabel')}</label>
                <textarea
                  value={editedDescription}
                  onChange={(e) => setEditedDescription(e.target.value)}
                  disabled={isUpdating}
                  rows={4}
                  className="w-full px-3 py-2 bg-[#f2f4ef] border border-[#e1e3de] rounded-xl text-sm focus:ring-2 focus:ring-[#00652c]/20 focus:border-[#00652c] outline-none transition-all resize-none"
                />
              </div>
              <div className="space-y-1">
                <TagSelector
                  tags={tags}
                  selectedTagIds={editedTagIds}
                  onToggle={(tagId) =>
                    setEditedTagIds((prev) =>
                      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId],
                    )
                  }
                  onCreateNew={() => setIsCreateDialogOpen(true)}
                  disabled={isUpdating}
                />
              </div>
            </div>
            <DialogFooter>
              <button
                onClick={cancelEditing}
                disabled={isUpdating}
                className="flex items-center gap-1.5 px-4 py-2 border border-[#e1e3de] rounded-xl text-sm font-bold hover:bg-[#f2f4ef] transition-colors disabled:opacity-50"
              >
                <X className="w-3.5 h-3.5" />
                {t('common.actions.cancel')}
              </button>
              <button
                onClick={() => updateMutation.mutate()}
                disabled={isUpdating || !editedTitle.trim()}
                className="flex items-center gap-1.5 px-4 py-2 bg-[#00652c] text-white rounded-xl text-sm font-bold hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {isUpdating ? <InlineSpinner className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
                {isUpdating ? t('common.actions.saving') : t('common.actions.save')}
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Mobile tabs ───────────────────────────────────────────────────── */}
        {isMobile && (
          <div className="mt-16 flex border-b border-stone-200 bg-white shrink-0">
            <button
              onClick={() => setMobileTab('video')}
              className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-semibold transition-colors ${
                mobileTab === 'video'
                  ? 'text-[#00652c] border-b-2 border-[#00652c]'
                  : 'text-stone-500 hover:text-stone-700'
              }`}
            >
              <Play className="w-4 h-4" />
              {t('videos.detail.video')}
            </button>
            <button
              onClick={() => setMobileTab('transcript')}
              className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-semibold transition-colors ${
                mobileTab === 'transcript'
                  ? 'text-[#00652c] border-b-2 border-[#00652c]'
                  : 'text-stone-500 hover:text-stone-700'
              }`}
            >
              <AlignLeft className="w-4 h-4" />
              {t('videos.detail.transcriptSection')}
            </button>
          </div>
        )}

        {/* ── Main Content ──────────────────────────────────────────────────── */}
        <main
          className={`flex-grow max-w-screen-xl mx-auto w-full px-6 lg:px-8 py-6 flex flex-col gap-6 ${
            isMobile ? 'mt-0' : 'mt-16'
          }`}
        >
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* ── Left Column: Video + Info ──────────────────────────────────── */}
          <div
            className={`lg:col-span-8 flex flex-col gap-4 ${
              isMobile && mobileTab !== 'video' ? 'hidden' : ''
            }`}
          >
            {/* Video Player */}
            <div className="w-full aspect-video bg-[#1a1c1c] rounded-xl overflow-hidden shadow-[0_8px_30px_rgba(28,25,23,0.08)]">
              {video.source_type === 'youtube' && video.youtube_embed_url ? (
                <iframe
                  key={`${video.id}-${youtubeStartSeconds ?? 0}`}
                  className="w-full h-full"
                  src={buildYoutubeEmbedSrc(video.youtube_embed_url, youtubeStartSeconds)}
                  title={video.title}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              ) : video.file ? (
                <video
                  ref={videoRef}
                  controls
                  className="w-full h-full object-contain"
                  src={apiClient.getVideoUrl(video.file)}
                  onLoadedMetadata={handleVideoLoaded}
                >
                  {t('common.messages.browserNoVideoSupport')}
                </video>
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center gap-3 text-gray-500">
                  <VideoIcon className="w-16 h-16 text-gray-600" />
                  <p className="text-sm">{t('common.messages.videoFileMissing')}</p>
                </div>
              )}
            </div>

            {/* Info Card */}
            <div className="bg-white rounded-xl shadow-[0_4px_20px_rgba(28,25,23,0.04)] p-6 flex flex-col gap-4">
              {/* Title + Status */}
              <div className="flex justify-between items-start gap-4">
                <div>
                  <h1 className="font-bold text-xl text-[#191c19] leading-tight mb-1">
                    {video.title}
                  </h1>
                  <div className="flex items-center gap-2 text-sm text-[#6f7a6e]">
                    <Calendar className="w-3.5 h-3.5 shrink-0" />
                    <span>{formatDate(video.uploaded_at, 'full', locale)}</span>
                  </div>
                </div>
                <span className={`shrink-0 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold ${statusClassName}`}>
                  {video.status === 'completed' && <CheckCircle className="w-3 h-3" />}
                  {t(`common.status.${video.status}`, video.status)}
                </span>
              </div>

              {/* Tags */}
              {video.tags && video.tags.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {video.tags.map((tag) => (
                    <span
                      key={tag.id}
                      className="px-3 py-1 rounded-full text-[11px] font-bold uppercase"
                      style={{ backgroundColor: `${tag.color}20`, color: tag.color }}
                    >
                      {tag.name}
                    </span>
                  ))}
                </div>
              )}

              {/* Status Pipeline (horizontal) */}
              <div className="border-t border-[#e1e3de]/50 pt-4 flex items-center gap-3 flex-wrap">
                <span className="text-xs font-bold text-[#6f7a6e] uppercase tracking-widest shrink-0">
                  {t('videos.detail.statusSection')}
                </span>
                {pipelineSteps.map(({ key, label, doneStatuses }, idx) => {
                  const done = doneStatuses.includes(video.status);
                  return (
                    <div key={key} className="flex items-center gap-2">
                      {idx > 0 && <div className="w-6 h-px bg-[#e1e3de]" />}
                      <div className="flex items-center gap-1.5">
                        <div
                          className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
                            done ? 'bg-[#15803d]' : 'bg-[#e1e3de]'
                          }`}
                        >
                          {done ? (
                            <CheckCircle className="w-3 h-3 text-white" />
                          ) : (
                            <div className="w-1.5 h-1.5 rounded-full bg-[#becabc]" />
                          )}
                        </div>
                        <span className={`text-xs font-semibold ${done ? 'text-[#191c19]' : 'text-[#becabc]'}`}>
                          {label}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Video error message */}
              {video.error_message && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl">
                  <p className="text-xs text-red-700 leading-relaxed">{video.error_message}</p>
                </div>
              )}

              {/* Description */}
              {video.description && (
                <div className="border-t border-[#e1e3de]/50 pt-4">
                  <p className="text-sm text-[#3f493f] leading-relaxed">{video.description}</p>
                </div>
              )}

              {/* Delete error */}
              {deleteError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl">
                  <p className="text-xs text-red-700 leading-relaxed">{deleteError}</p>
                </div>
              )}

              {/* Actions */}
              <div className="border-t border-[#e1e3de]/50 pt-4 flex items-center gap-2">
                <button
                  onClick={startEditing}
                  className="flex items-center gap-1.5 px-4 py-2 border border-[#e1e3de] text-[#3f493f] text-sm font-bold rounded-xl hover:bg-[#f2f4ef] transition-colors"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  {t('videos.detail.editButton')}
                </button>
                <button
                  onClick={() => {
                    if (!window.confirm(t('confirmations.deleteVideo'))) return;
                    setDeleteError(null);
                    deleteMutation.mutate();
                  }}
                  disabled={isDeleting}
                  className="flex items-center gap-1.5 px-4 py-2 text-red-600 text-sm font-bold rounded-xl hover:bg-red-50 transition-colors disabled:opacity-50"
                >
                  {isDeleting ? <InlineSpinner className="w-3.5 h-3.5" /> : <Trash2 className="w-3.5 h-3.5" />}
                  {isDeleting ? t('common.actions.deleting') : t('videos.detail.deleteButton')}
                </button>
              </div>
            </div>
          </div>

          {/* ── Right Column: Transcript ───────────────────────────────────── */}
          <div
            className={`lg:col-span-4 flex flex-col bg-white rounded-xl shadow-[0_4px_20px_rgba(28,25,23,0.04)] ${
              isMobile ? 'min-h-[500px]' : 'h-[calc(100vh-64px)] sticky top-16'
            } ${isMobile && mobileTab !== 'transcript' ? 'hidden' : ''}`}
          >
            {/* Transcript Header */}
            <div className="p-4 border-b border-stone-100 flex flex-col gap-3 shrink-0">
              <div className="flex justify-between items-center">
                <h2 className="font-extrabold text-[#191c19]">{t('videos.detail.transcriptSection')}</h2>
                {!isTranscriptEditing && (
                  <button
                    type="button"
                    onClick={startTranscriptEditing}
                    disabled={!video.transcript}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-[#e1e3de] bg-white px-3 py-1.5 text-xs font-bold text-[#3f493f] shadow-sm transition-colors hover:bg-[#f8faf5] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    {t('videos.detail.editTranscriptButton')}
                  </button>
                )}
              </div>
              {/* Search Bar */}
              {!isTranscriptEditing && (
                <div className="relative w-full">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6f7a6e] w-3.5 h-3.5" />
                  <input
                    type="text"
                    value={transcriptSearch}
                    onChange={(e) => setTranscriptSearch(e.target.value)}
                    placeholder={t('videos.detail.transcriptSearchPlaceholder')}
                    className="w-full h-9 pl-9 pr-3 bg-[#f2f4ef] border border-[#e1e3de] rounded-xl text-sm focus:outline-none focus:border-[#00652c] focus:ring-2 focus:ring-[#00652c]/20 transition-all placeholder:text-[#3f493f]/60"
                  />
                </div>
              )}
            </div>

            {/* Transcript Body */}
            {isTranscriptEditing ? (
              <div className="flex-1 overflow-hidden flex flex-col">
                <div className="flex shrink-0 flex-col gap-3 border-b border-stone-100 bg-[#f8faf5] p-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      onClick={cancelTranscriptEditing}
                      disabled={transcriptUpdateMutation.isPending}
                      className="rounded-xl border border-[#e1e3de] bg-white px-3 py-1.5 text-xs font-bold text-[#3f493f] transition-colors hover:bg-[#f8faf5] disabled:opacity-50"
                    >
                      {t('videos.detail.cancel')}
                    </button>
                    <button
                      type="button"
                      onClick={() => transcriptUpdateMutation.mutate()}
                      disabled={transcriptUpdateMutation.isPending}
                      className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#00652c] px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-[#005323] disabled:opacity-50"
                    >
                      {transcriptUpdateMutation.isPending ? <InlineSpinner className="h-3 w-3" /> : <Save className="h-3 w-3" />}
                      {transcriptUpdateMutation.isPending ? t('videos.detail.saving') : t('videos.detail.saveTranscriptButton')}
                    </button>
                  </div>
                </div>
                {transcriptSaveError && (
                  <p className="shrink-0 px-3 py-2 text-xs text-red-700 bg-red-50 border-b border-red-200">
                    {transcriptSaveError}
                  </p>
                )}
                <textarea
                  value={editedTranscript}
                  onChange={(event) => setEditedTranscript(event.target.value)}
                  disabled={transcriptUpdateMutation.isPending}
                  spellCheck={false}
                  className="min-h-0 flex-1 resize-none border-0 bg-white p-4 font-mono text-xs leading-relaxed text-[#191c19] outline-none focus:ring-2 focus:ring-inset focus:ring-[#00652c]/20 disabled:opacity-60"
                />
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-1">
                {filteredSegments.length > 0 ? (
                  filteredSegments.map((seg, idx) => (
                    <div
                      key={idx}
                      onClick={() => handleSeek(seg.seconds, idx)}
                      className={`flex gap-4 p-3 rounded-xl cursor-pointer transition-all group ${
                        activeSegmentIdx === idx
                          ? 'bg-[#f0fdf4] border-l-4 border-[#00652c]'
                          : 'hover:bg-stone-50'
                      }`}
                    >
                      <span className="text-[#00652c] font-mono text-[11px] mt-0.5 shrink-0 bg-[#00652c]/8 px-2 py-0.5 rounded-lg h-fit whitespace-nowrap font-semibold">
                        {seg.timestamp}
                      </span>
                      <p
                        className={`text-sm leading-relaxed ${
                          activeSegmentIdx === idx
                            ? 'text-[#191c19] font-medium'
                            : 'text-[#3f493f] group-hover:text-[#191c19]'
                        }`}
                      >
                        {seg.text}
                      </p>
                    </div>
                  ))
                ) : isPlainTextTranscript ? (
                  <div className="p-4 bg-white rounded-xl">
                    <p className="text-sm text-[#3f493f] whitespace-pre-wrap leading-relaxed">
                      {video.transcript}
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-16 text-[#6f7a6e]">
                    <div className="w-16 h-16 bg-[#f2f4ef] rounded-full flex items-center justify-center mb-4">
                      <Search className="w-8 h-8 text-[#becabc]" />
                    </div>
                    <p className="text-sm font-medium text-center px-4">
                      {transcriptSearch
                        ? t('videos.detail.transcriptNotFound')
                        : (() => {
                            const statusMsgs: Record<string, string> = {
                              pending: t('videos.detail.transcriptStatus.pending'),
                              processing: t('videos.detail.transcriptStatus.processing'),
                              indexing: t('videos.detail.transcriptStatus.indexing'),
                              error: t('videos.detail.transcriptStatus.error'),
                            };
                            return statusMsgs[video.status] ?? t('videos.detail.transcriptStatus.unavailable');
                          })()}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
          </div>
        </main>

        <TagCreateDialog
          isOpen={isCreateDialogOpen}
          onClose={() => setIsCreateDialogOpen(false)}
          onCreate={handleCreateTag}
        />
      </div>
    </>
  );
}
