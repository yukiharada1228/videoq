import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import type { Tag } from '@/lib/api';
import {
  ArrowLeft, Calendar, CheckCircle, Search, ChevronRight,
  Trash2, Pencil, X, Save, Video as VideoIcon, GraduationCap,
  Info, Play,
} from 'lucide-react';

// ── Transcript parser ─────────────────────────────────────────────────────────

interface TranscriptSegment {
  timestamp: string;
  seconds: number;
  text: string;
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

// ── Sidebar edit form ─────────────────────────────────────────────────────────

interface SidebarEditFormProps {
  editedTitle: string;
  editedDescription: string;
  editedTagIds: number[];
  tags: Tag[];
  isUpdating: boolean;
  onTitleChange: (v: string) => void;
  onDescriptionChange: (v: string) => void;
  onTagToggle: (id: number) => void;
  onCreateTag: () => void;
  onSave: () => void;
  onCancel: () => void;
}

function SidebarEditForm({
  editedTitle, editedDescription, editedTagIds, tags, isUpdating,
  onTitleChange, onDescriptionChange, onTagToggle, onCreateTag, onSave, onCancel,
}: SidebarEditFormProps) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-4 h-full">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-[#6f7a6e] uppercase tracking-widest">{t('videos.detail.editMode')}</span>
        <button onClick={onCancel} className="text-[#6f7a6e] hover:text-[#191c19] transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="space-y-1">
        <label className="text-xs font-bold text-[#3f493f]">{t('videos.detail.editTitleLabel')}</label>
        <input
          type="text"
          value={editedTitle}
          onChange={(e) => onTitleChange(e.target.value)}
          disabled={isUpdating}
          className="w-full px-3 py-2 bg-[#f2f4ef] border border-[#e1e3de] rounded-xl text-sm focus:ring-2 focus:ring-[#00652c]/20 focus:border-[#00652c] outline-none transition-all"
        />
      </div>

      <div className="space-y-1">
        <label className="text-xs font-bold text-[#3f493f]">{t('videos.detail.editDescriptionLabel')}</label>
        <textarea
          value={editedDescription}
          onChange={(e) => onDescriptionChange(e.target.value)}
          disabled={isUpdating}
          rows={4}
          className="w-full px-3 py-2 bg-[#f2f4ef] border border-[#e1e3de] rounded-xl text-sm focus:ring-2 focus:ring-[#00652c]/20 focus:border-[#00652c] outline-none transition-all resize-none"
        />
      </div>

      <div className="space-y-1 flex-1 min-h-0">
        <TagSelector
          tags={tags}
          selectedTagIds={editedTagIds}
          onToggle={onTagToggle}
          onCreateNew={onCreateTag}
          disabled={isUpdating}
        />
      </div>

      <div className="flex gap-2 pt-2">
        <button
          onClick={onSave}
          disabled={isUpdating || !editedTitle.trim()}
          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-[#00652c] text-white text-sm font-bold rounded-xl hover:bg-[#005323] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isUpdating ? <InlineSpinner className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
          {isUpdating ? t('videos.detail.saving') : t('videos.detail.save')}
        </button>
        <button
          onClick={onCancel}
          disabled={isUpdating}
          className="px-4 py-2.5 border border-[#e1e3de] text-[#3f493f] text-sm font-bold rounded-xl hover:bg-[#f2f4ef] transition-colors disabled:opacity-50"
        >
          {t('videos.detail.cancel')}
        </button>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function VideoDetailPage() {
  const params = useParams<{ id: string }>();
  const navigate = useI18nNavigate();
  const [searchParams] = useSearchParams();
  const videoId = params?.id ? Number.parseInt(params.id, 10) : null;
  const videoRef = useRef<HTMLVideoElement>(null);
  const startTime = searchParams.get('t');
  const [youtubeStartSeconds, setYoutubeStartSeconds] = useState<number | null>(null);
  const { t } = useTranslation();
  const locale = useLocale();

  const [transcriptSearch, setTranscriptSearch] = useState('');
  const [activeSegmentIdx, setActiveSegmentIdx] = useState<number | null>(null);
  const [mobileTab, setMobileTab] = useState<'info' | 'video'>('video');
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

  useEffect(() => {
    if (!startTime) return;
    const seconds = Number.parseInt(startTime, 10);
    if (!Number.isNaN(seconds)) {
      setYoutubeStartSeconds(seconds);
    }
  }, [startTime]);

  const { deleteMutation, updateMutation } = useVideoDetailPageMutations({
    videoId,
    onDeleteSuccess: () => navigate('/videos'),
    onUpdate: handleUpdateVideo,
    onUpdateSuccess: cancelEditing,
  });

  const isDeleting = deleteMutation.isPending;
  const isUpdating = updateMutation.isPending;

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
      setYoutubeStartSeconds(seconds);
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

  return (
    <div
      className="bg-[#f8faf5] h-screen flex flex-col overflow-hidden"
      style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
    >
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <header className="fixed top-0 w-full bg-white/80 backdrop-blur-xl border-b border-stone-200/60 z-50">
        <div className="max-w-screen-xl px-6 lg:px-8 mx-auto w-full flex justify-between items-center py-4">
        <div className="flex items-center gap-6 min-w-0">
          <Link href="/" className="flex items-center gap-2 text-xl font-bold text-stone-900 shrink-0" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
            <GraduationCap className="text-[#00652c] w-6 h-6" />
            <span>VideoQ</span>
          </Link>
          <div className="hidden md:flex items-center gap-1 text-sm text-[#6f7a6e] font-medium min-w-0">
            <Link href="/videos" className="text-stone-400 hover:text-[#00652c] transition-colors shrink-0">
              {t('videos.detail.videosBreadcrumb')}
            </Link>
            <ChevronRight className="w-3.5 h-3.5 text-stone-300 shrink-0" />
            <span className="text-[#00652c] font-bold border-b-2 border-[#00652c] truncate max-w-[200px]">
              {video.title}
            </span>
          </div>
        </div>

        </div>
      </header>

      {/* ── Mobile tabs ──────────────────────────────────────────────────── */}
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
            onClick={() => setMobileTab('info')}
            className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-semibold transition-colors ${
              mobileTab === 'info'
                ? 'text-[#00652c] border-b-2 border-[#00652c]'
                : 'text-stone-500 hover:text-stone-700'
            }`}
          >
            <Info className="w-4 h-4" />
            {t('videos.detail.info')}
          </button>
        </div>
      )}

      {/* ── Main grid ────────────────────────────────────────────────────── */}
      <main
        className={`flex-1 overflow-hidden ${isMobile ? 'flex flex-col' : 'mt-16 grid grid-cols-[280px_1fr]'}`}
      >
        {/* ── Left sidebar ─────────────────────────────────────────────── */}
        <aside className={`bg-white border-r border-stone-100 overflow-y-auto p-6 flex flex-col gap-6 ${isMobile ? 'flex-1' : ''} ${isMobile && mobileTab !== 'info' ? 'hidden' : ''}`}>
          {isEditing ? (
            <SidebarEditForm
              editedTitle={editedTitle}
              editedDescription={editedDescription}
              editedTagIds={editedTagIds}
              tags={tags}
              isUpdating={isUpdating}
              onTitleChange={setEditedTitle}
              onDescriptionChange={setEditedDescription}
              onTagToggle={(tagId) =>
                setEditedTagIds((prev) =>
                  prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId],
                )
              }
              onCreateTag={() => setIsCreateDialogOpen(true)}
              onSave={() => void updateMutation.mutateAsync()}
              onCancel={cancelEditing}
            />
          ) : (
            <>
              {/* Title & status */}
              <section>
                <h1 className="font-bold text-lg text-[#191c19] leading-tight mb-3">
                  {video.title}
                </h1>
                <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold ${statusClassName}`}>
                  {video.status === 'completed' && <CheckCircle className="w-3 h-3" />}
                  {t(`common.status.${video.status}`, video.status)}
                </span>
              </section>

              {/* Metadata */}
              <section className="space-y-3">
                <div className="flex items-center gap-3 text-sm text-[#6f7a6e]">
                  <Calendar className="w-4 h-4 text-[#6f7a6e] shrink-0" />
                  <span>{formatDate(video.uploaded_at, 'full', locale)}</span>
                </div>
                {video.description && (
                  <p className="text-sm text-[#3f493f] leading-relaxed">{video.description}</p>
                )}
              </section>

              {/* Tags */}
              {video.tags && video.tags.length > 0 && (
                <section className="flex flex-wrap gap-2">
                  {video.tags.map((tag) => (
                    <span
                      key={tag.id}
                      className="px-3 py-1 rounded-full text-[11px] font-bold uppercase"
                      style={{ backgroundColor: `${tag.color}20`, color: tag.color }}
                    >
                      {tag.name}
                    </span>
                  ))}
                </section>
              )}

              {/* Status pipeline */}
              <section>
                <h3 className="text-xs font-bold text-[#6f7a6e] uppercase tracking-widest mb-4">
                  {t('videos.detail.statusSection')}
                </h3>
                <div className="relative space-y-5">
                  <div className="absolute left-3 top-2 bottom-2 w-0.5 bg-[#d3ffd5]" />
                  {([
                    { key: 'upload', label: t('videos.detail.pipeline.upload'), doneStatuses: ['processing', 'indexing', 'completed', 'error'] },
                    { key: 'transcript', label: t('videos.detail.pipeline.transcript'), doneStatuses: ['indexing', 'completed'] },
                    { key: 'aiAnalysis', label: t('videos.detail.pipeline.aiAnalysis'), doneStatuses: ['completed'] },
                  ] as { key: string; label: string; doneStatuses: string[] }[]).map(({ key, label, doneStatuses }) => {
                    const done = doneStatuses.includes(video.status);
                    return (
                      <div key={key} className="flex items-center gap-4 relative z-10">
                        <div
                          className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
                            done ? 'bg-[#15803d]' : 'bg-[#e1e3de]'
                          }`}
                        >
                          {done ? (
                            <CheckCircle className="w-3.5 h-3.5 text-white" />
                          ) : (
                            <div className="w-2 h-2 rounded-full bg-[#becabc]" />
                          )}
                        </div>
                        <span className={`text-sm font-medium ${done ? 'text-[#191c19]' : 'text-[#becabc]'}`}>
                          {label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </section>

              {/* Error message */}
              {video.error_message && (
                <section className="p-3 bg-red-50 border border-red-200 rounded-xl">
                  <p className="text-xs text-red-700 leading-relaxed">{video.error_message}</p>
                </section>
              )}

              {/* Actions */}
              <section className="mt-auto pt-4 space-y-2">
                <button
                  onClick={startEditing}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 border border-[#e1e3de] text-[#3f493f] font-bold text-sm rounded-xl hover:bg-[#f2f4ef] transition-all"
                >
                  <Pencil className="w-4 h-4" />
                  {t('videos.detail.editButton')}
                </button>
                <button
                  onClick={() => {
                    if (!window.confirm(t('confirmations.deleteVideo'))) return;
                    void deleteMutation.mutateAsync();
                  }}
                  disabled={isDeleting}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-red-600 font-bold text-sm rounded-xl hover:bg-red-50 transition-all disabled:opacity-50"
                >
                  {isDeleting ? <InlineSpinner className="w-4 h-4" /> : <Trash2 className="w-4 h-4" />}
                  {isDeleting ? t('common.actions.deleting') : t('videos.detail.deleteButton')}
                </button>
              </section>
            </>
          )}
        </aside>

        {/* ── Right: video + transcript ─────────────────────────────────── */}
        <section className={`flex flex-col overflow-hidden bg-[#f8faf5] ${isMobile ? 'flex-1' : ''} ${isMobile && mobileTab !== 'video' ? 'hidden' : ''}`}>
          {/* Video player */}
          <div className="shrink-0 bg-[#1a1c1c] flex items-center justify-center" style={{ maxHeight: '55vh' }}>
            {video.source_type === 'youtube' && video.youtube_embed_url ? (
              <iframe
                key={`${video.id}-${youtubeStartSeconds ?? 0}`}
                className="w-full aspect-video"
                style={{ maxHeight: '55vh' }}
                src={`${video.youtube_embed_url}?autoplay=1&start=${youtubeStartSeconds ?? 0}`}
                title={video.title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            ) : video.file ? (
              <video
                ref={videoRef}
                controls
                className="w-full h-full object-contain"
                style={{ maxHeight: '55vh' }}
                src={apiClient.getVideoUrl(video.file)}
                onLoadedMetadata={handleVideoLoaded}
              >
                {t('common.messages.browserNoVideoSupport')}
              </video>
            ) : (
              <div className="aspect-video w-full flex flex-col items-center justify-center gap-3 text-gray-500">
                <VideoIcon className="w-16 h-16 text-gray-600" />
                <p className="text-sm">{t('common.messages.videoFileMissing')}</p>
              </div>
            )}
          </div>

          {/* Transcript */}
          <div className="flex-1 overflow-hidden flex flex-col p-6 gap-4 bg-[#f2f4ef]/40">
            <div className="flex items-center justify-between gap-4 shrink-0">
              <h2 className="text-base font-bold text-[#191c19] shrink-0">{t('videos.detail.transcriptSection')}</h2>
              <div className="relative w-full max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6f7a6e] w-3.5 h-3.5" />
                <input
                  type="text"
                  value={transcriptSearch}
                  onChange={(e) => setTranscriptSearch(e.target.value)}
                  placeholder={t('videos.detail.transcriptSearchPlaceholder')}
                  className="w-full pl-9 pr-4 py-2 bg-white border border-[#e1e3de] rounded-xl text-sm focus:ring-2 focus:ring-[#00652c]/20 focus:border-[#00652c] outline-none transition-all shadow-sm"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {filteredSegments.length > 0 ? (
                filteredSegments.map((seg, idx) => (
                  <div
                    key={idx}
                    onClick={() => handleSeek(seg.seconds, idx)}
                    className={`flex gap-4 p-4 rounded-xl cursor-pointer transition-all group ${
                      activeSegmentIdx === idx
                        ? 'bg-white border-l-4 border-[#00652c] shadow-sm'
                        : 'hover:bg-white'
                    }`}
                  >
                    <span className="text-[#00652c] font-mono text-[11px] mt-0.5 shrink-0 bg-[#00652c]/8 px-2.5 py-1 rounded h-fit whitespace-nowrap">
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
                  <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mb-4 shadow-sm">
                    <Search className="w-8 h-8 text-[#becabc]" />
                  </div>
                  <p className="text-sm font-medium">
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
          </div>
        </section>
      </main>

      <TagCreateDialog
        isOpen={isCreateDialogOpen}
        onClose={() => setIsCreateDialogOpen(false)}
        onCreate={handleCreateTag}
      />
    </div>
  );
}
