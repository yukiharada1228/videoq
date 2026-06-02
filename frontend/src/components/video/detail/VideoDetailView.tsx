import type { Dispatch, RefObject, SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlignLeft,
  ArrowLeft,
  Calendar,
  CheckCircle,
  Pencil,
  Play,
  Save,
  Search,
  Trash2,
  Video as VideoIcon,
  X,
} from 'lucide-react';
import { Link, useLocale } from '@/lib/i18n';
import { apiClient, type Tag, type Video } from '@/lib/api';
import { buildYoutubeEmbedSrc } from '@/lib/video/embed';
import { formatDate } from '@/lib/utils/video';
import type { TranscriptSegment } from '@/lib/transcript/srt';
import { AppNav } from '@/components/layout/AppNav';
import { InlineSpinner } from '@/components/common/InlineSpinner';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { TagCreateDialog } from '@/components/video/TagCreateDialog';
import { TagSelector } from '@/components/video/TagSelector';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

type MobileTab = 'transcript' | 'video';

interface VideoDetailViewProps {
  video: Video | null;
  isLoading: boolean;
  error: string | null;
  videoRef: RefObject<HTMLVideoElement | null>;
  youtubeStartSeconds: number | null;
  onVideoLoaded: () => void;
  isMobile: boolean;
  mobileTab: MobileTab;
  onMobileTabChange: (tab: MobileTab) => void;
  tags: Tag[];
  isCreateDialogOpen: boolean;
  onCreateDialogOpenChange: (open: boolean) => void;
  onCreateTag: (name: string, color: string) => Promise<void>;
  isEditing: boolean;
  editedTitle: string;
  editedDescription: string;
  editedTagIds: number[];
  onEditedTitleChange: (title: string) => void;
  onEditedDescriptionChange: (description: string) => void;
  onEditedTagIdsChange: Dispatch<SetStateAction<number[]>>;
  onStartEditing: () => void;
  onCancelEdit: () => void;
  onUpdateVideo: () => void;
  isUpdating: boolean;
  updateError: string | null;
  deleteError: string | null;
  isDeleting: boolean;
  onDeleteVideo: () => void;
  transcriptSearch: string;
  onTranscriptSearchChange: (value: string) => void;
  isTranscriptEditing: boolean;
  onStartTranscriptEditing: () => void;
  onCancelTranscriptEditing: () => void;
  editedTranscript: string;
  onEditedTranscriptChange: (value: string) => void;
  onSaveTranscript: () => void;
  isTranscriptSaving: boolean;
  transcriptSaveError: string | null;
  filteredSegments: TranscriptSegment[];
  activeSegmentIdx: number | null;
  onSeek: (seconds: number, idx: number) => void;
  isPlainTextTranscript: boolean;
}

function getStatusClassName(status: Video['status']): string {
  switch (status) {
    case 'completed':
      return 'bg-[#d3ffd5] text-[#006d30]';
    case 'error':
      return 'bg-red-100 text-red-700';
    case 'indexing':
    case 'processing':
      return 'bg-[#ffdcc3] text-[#2f1500]';
    default:
      return 'bg-gray-100 text-gray-500';
  }
}

function VideoDetailEditDialog({
  isOpen,
  tags,
  editedTitle,
  editedDescription,
  editedTagIds,
  isUpdating,
  updateError,
  onOpenChange,
  onEditedTitleChange,
  onEditedDescriptionChange,
  onEditedTagIdsChange,
  onCreateNewTag,
  onSave,
}: {
  isOpen: boolean;
  tags: Tag[];
  editedTitle: string;
  editedDescription: string;
  editedTagIds: number[];
  isUpdating: boolean;
  updateError: string | null;
  onOpenChange: (open: boolean) => void;
  onEditedTitleChange: (title: string) => void;
  onEditedDescriptionChange: (description: string) => void;
  onEditedTagIdsChange: Dispatch<SetStateAction<number[]>>;
  onCreateNewTag: () => void;
  onSave: () => void;
}) {
  const { t } = useTranslation();

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
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
              onChange={(event) => onEditedTitleChange(event.target.value)}
              disabled={isUpdating}
              className="w-full px-3 py-2.5 bg-[#f2f4ef] border border-[#e1e3de] rounded-xl text-sm focus:ring-2 focus:ring-[#00652c]/20 focus:border-[#00652c] outline-none transition-all"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-bold text-[#3f493f]">{t('videos.detail.editDescriptionLabel')}</label>
            <textarea
              value={editedDescription}
              onChange={(event) => onEditedDescriptionChange(event.target.value)}
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
                onEditedTagIdsChange((prev) =>
                  prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId],
                )
              }
              onCreateNew={onCreateNewTag}
              disabled={isUpdating}
            />
          </div>
        </div>
        <DialogFooter>
          <button
            onClick={() => onOpenChange(false)}
            disabled={isUpdating}
            className="flex items-center gap-1.5 px-4 py-2 border border-[#e1e3de] rounded-xl text-sm font-bold hover:bg-[#f2f4ef] transition-colors disabled:opacity-50"
          >
            <X className="w-3.5 h-3.5" />
            {t('common.actions.cancel')}
          </button>
          <button
            onClick={onSave}
            disabled={isUpdating || !editedTitle.trim()}
            className="flex items-center gap-1.5 px-4 py-2 bg-[#00652c] text-white rounded-xl text-sm font-bold hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {isUpdating ? <InlineSpinner className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
            {isUpdating ? t('common.actions.saving') : t('common.actions.save')}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function VideoDetailMobileTabs({
  activeTab,
  onChange,
}: {
  activeTab: MobileTab;
  onChange: (tab: MobileTab) => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="mt-16 flex border-b border-stone-200 bg-white shrink-0">
      <button
        onClick={() => onChange('video')}
        className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-semibold transition-colors ${
          activeTab === 'video'
            ? 'text-[#00652c] border-b-2 border-[#00652c]'
            : 'text-stone-500 hover:text-stone-700'
        }`}
      >
        <Play className="w-4 h-4" />
        {t('videos.detail.video')}
      </button>
      <button
        onClick={() => onChange('transcript')}
        className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-semibold transition-colors ${
          activeTab === 'transcript'
            ? 'text-[#00652c] border-b-2 border-[#00652c]'
            : 'text-stone-500 hover:text-stone-700'
        }`}
      >
        <AlignLeft className="w-4 h-4" />
        {t('videos.detail.transcriptSection')}
      </button>
    </div>
  );
}

function VideoPlayerPanel({
  video,
  videoRef,
  youtubeStartSeconds,
  onVideoLoaded,
}: {
  video: Video;
  videoRef: RefObject<HTMLVideoElement | null>;
  youtubeStartSeconds: number | null;
  onVideoLoaded: () => void;
}) {
  const { t } = useTranslation();

  return (
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
          onLoadedMetadata={onVideoLoaded}
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
  );
}

function VideoMetaPanel({
  video,
  deleteError,
  isDeleting,
  onEdit,
  onDelete,
}: {
  video: Video;
  deleteError: string | null;
  isDeleting: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const locale = useLocale();
  const statusClassName = getStatusClassName(video.status);
  const pipelineSteps = [
    { key: 'upload', label: t('videos.detail.pipeline.upload'), doneStatuses: ['processing', 'indexing', 'completed', 'error'] },
    { key: 'transcript', label: t('videos.detail.pipeline.transcript'), doneStatuses: ['indexing', 'completed'] },
    { key: 'aiAnalysis', label: t('videos.detail.pipeline.aiAnalysis'), doneStatuses: ['completed'] },
  ] as { key: string; label: string; doneStatuses: Video['status'][] }[];

  return (
    <div className="bg-white rounded-xl shadow-[0_4px_20px_rgba(28,25,23,0.04)] p-6 flex flex-col gap-4">
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

      <div className="border-t border-[#e1e3de]/50 pt-4 flex items-center gap-3 flex-wrap">
        <span className="text-xs font-bold text-[#6f7a6e] uppercase tracking-widest shrink-0">
          {t('videos.detail.statusSection')}
        </span>
        {pipelineSteps.map(({ key, label, doneStatuses }, index) => {
          const done = doneStatuses.includes(video.status);
          return (
            <div key={key} className="flex items-center gap-2">
              {index > 0 && <div className="w-6 h-px bg-[#e1e3de]" />}
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

      {video.error_message && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl">
          <p className="text-xs text-red-700 leading-relaxed">{video.error_message}</p>
        </div>
      )}

      {video.description && (
        <div className="border-t border-[#e1e3de]/50 pt-4">
          <p className="text-sm text-[#3f493f] leading-relaxed">{video.description}</p>
        </div>
      )}

      {deleteError && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl">
          <p className="text-xs text-red-700 leading-relaxed">{deleteError}</p>
        </div>
      )}

      <div className="border-t border-[#e1e3de]/50 pt-4 flex items-center gap-2">
        <button
          onClick={onEdit}
          className="flex items-center gap-1.5 px-4 py-2 border border-[#e1e3de] text-[#3f493f] text-sm font-bold rounded-xl hover:bg-[#f2f4ef] transition-colors"
        >
          <Pencil className="w-3.5 h-3.5" />
          {t('videos.detail.editButton')}
        </button>
        <button
          onClick={onDelete}
          disabled={isDeleting}
          className="flex items-center gap-1.5 px-4 py-2 text-red-600 text-sm font-bold rounded-xl hover:bg-red-50 transition-colors disabled:opacity-50"
        >
          {isDeleting ? <InlineSpinner className="w-3.5 h-3.5" /> : <Trash2 className="w-3.5 h-3.5" />}
          {isDeleting ? t('common.actions.deleting') : t('videos.detail.deleteButton')}
        </button>
      </div>
    </div>
  );
}

function TranscriptPanel({
  video,
  isMobile,
  mobileTab,
  transcriptSearch,
  onTranscriptSearchChange,
  isTranscriptEditing,
  onStartTranscriptEditing,
  onCancelTranscriptEditing,
  editedTranscript,
  onEditedTranscriptChange,
  onSaveTranscript,
  isTranscriptSaving,
  transcriptSaveError,
  filteredSegments,
  activeSegmentIdx,
  onSeek,
  isPlainTextTranscript,
}: {
  video: Video;
  isMobile: boolean;
  mobileTab: MobileTab;
  transcriptSearch: string;
  onTranscriptSearchChange: (value: string) => void;
  isTranscriptEditing: boolean;
  onStartTranscriptEditing: () => void;
  onCancelTranscriptEditing: () => void;
  editedTranscript: string;
  onEditedTranscriptChange: (value: string) => void;
  onSaveTranscript: () => void;
  isTranscriptSaving: boolean;
  transcriptSaveError: string | null;
  filteredSegments: TranscriptSegment[];
  activeSegmentIdx: number | null;
  onSeek: (seconds: number, idx: number) => void;
  isPlainTextTranscript: boolean;
}) {
  const { t } = useTranslation();

  return (
    <div
      className={`lg:col-span-4 flex flex-col bg-white rounded-xl shadow-[0_4px_20px_rgba(28,25,23,0.04)] ${
        isMobile ? 'min-h-[500px]' : 'h-[calc(100vh-64px)] sticky top-16'
      } ${isMobile && mobileTab !== 'transcript' ? 'hidden' : ''}`}
    >
      <div className="p-4 border-b border-stone-100 flex flex-col gap-3 shrink-0">
        <div className="flex justify-between items-center">
          <h2 className="font-extrabold text-[#191c19]">{t('videos.detail.transcriptSection')}</h2>
          {!isTranscriptEditing && (
            <button
              type="button"
              onClick={onStartTranscriptEditing}
              disabled={!video.transcript}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#e1e3de] bg-white px-3 py-1.5 text-xs font-bold text-[#3f493f] shadow-sm transition-colors hover:bg-[#f8faf5] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Pencil className="h-3.5 w-3.5" />
              {t('videos.detail.editTranscriptButton')}
            </button>
          )}
        </div>
        {!isTranscriptEditing && (
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6f7a6e] w-3.5 h-3.5" />
            <input
              type="text"
              value={transcriptSearch}
              onChange={(event) => onTranscriptSearchChange(event.target.value)}
              placeholder={t('videos.detail.transcriptSearchPlaceholder')}
              className="w-full h-9 pl-9 pr-3 bg-[#f2f4ef] border border-[#e1e3de] rounded-xl text-sm focus:outline-none focus:border-[#00652c] focus:ring-2 focus:ring-[#00652c]/20 transition-all placeholder:text-[#3f493f]/60"
            />
          </div>
        )}
      </div>

      {isTranscriptEditing ? (
        <div className="flex-1 overflow-hidden flex flex-col">
          <div className="flex shrink-0 flex-col gap-3 border-b border-stone-100 bg-[#f8faf5] p-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                onClick={onCancelTranscriptEditing}
                disabled={isTranscriptSaving}
                className="rounded-xl border border-[#e1e3de] bg-white px-3 py-1.5 text-xs font-bold text-[#3f493f] transition-colors hover:bg-[#f8faf5] disabled:opacity-50"
              >
                {t('videos.detail.cancel')}
              </button>
              <button
                type="button"
                onClick={onSaveTranscript}
                disabled={isTranscriptSaving}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#00652c] px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-[#005323] disabled:opacity-50"
              >
                {isTranscriptSaving ? <InlineSpinner className="h-3 w-3" /> : <Save className="h-3 w-3" />}
                {isTranscriptSaving ? t('videos.detail.saving') : t('videos.detail.saveTranscriptButton')}
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
            onChange={(event) => onEditedTranscriptChange(event.target.value)}
            disabled={isTranscriptSaving}
            spellCheck={false}
            className="min-h-0 flex-1 resize-none border-0 bg-white p-4 font-mono text-xs leading-relaxed text-[#191c19] outline-none focus:ring-2 focus:ring-inset focus:ring-[#00652c]/20 disabled:opacity-60"
          />
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-1">
          {filteredSegments.length > 0 ? (
            filteredSegments.map((segment, index) => (
              <div
                key={index}
                onClick={() => onSeek(segment.seconds, index)}
                className={`flex gap-4 p-3 rounded-xl cursor-pointer transition-all group ${
                  activeSegmentIdx === index
                    ? 'bg-[#f0fdf4] border-l-4 border-[#00652c]'
                    : 'hover:bg-stone-50'
                }`}
              >
                <span className="text-[#00652c] font-mono text-[11px] mt-0.5 shrink-0 bg-[#00652c]/8 px-2 py-0.5 rounded-lg h-fit whitespace-nowrap font-semibold">
                  {segment.timestamp}
                </span>
                <p
                  className={`text-sm leading-relaxed ${
                    activeSegmentIdx === index
                      ? 'text-[#191c19] font-medium'
                      : 'text-[#3f493f] group-hover:text-[#191c19]'
                  }`}
                >
                  {segment.text}
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
                      const statusMsgs: Partial<Record<Video['status'], string>> = {
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
  );
}

export function VideoDetailView({
  video,
  isLoading,
  error,
  videoRef,
  youtubeStartSeconds,
  onVideoLoaded,
  isMobile,
  mobileTab,
  onMobileTabChange,
  tags,
  isCreateDialogOpen,
  onCreateDialogOpenChange,
  onCreateTag,
  isEditing,
  editedTitle,
  editedDescription,
  editedTagIds,
  onEditedTitleChange,
  onEditedDescriptionChange,
  onEditedTagIdsChange,
  onStartEditing,
  onCancelEdit,
  onUpdateVideo,
  isUpdating,
  updateError,
  deleteError,
  isDeleting,
  onDeleteVideo,
  transcriptSearch,
  onTranscriptSearchChange,
  isTranscriptEditing,
  onStartTranscriptEditing,
  onCancelTranscriptEditing,
  editedTranscript,
  onEditedTranscriptChange,
  onSaveTranscript,
  isTranscriptSaving,
  transcriptSaveError,
  filteredSegments,
  activeSegmentIdx,
  onSeek,
  isPlainTextTranscript,
}: VideoDetailViewProps) {
  const { t } = useTranslation();

  return (
    <div
      className="bg-[#f8faf5] flex flex-col min-h-screen"
      style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
    >
      <AppNav activePage="videos" />

      {isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <LoadingSpinner />
        </div>
      ) : error && !video ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <p className="text-red-500">{error}</p>
          <Link href="/videos" className="text-[#00652c] font-bold hover:underline flex items-center gap-1">
            <ArrowLeft className="w-4 h-4" />
            {t('common.actions.backToList')}
          </Link>
        </div>
      ) : !video ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-[#3f493f]">{t('common.messages.videoNotFound')}</p>
        </div>
      ) : (
        <>
          <VideoDetailEditDialog
            isOpen={isEditing}
            tags={tags}
            editedTitle={editedTitle}
            editedDescription={editedDescription}
            editedTagIds={editedTagIds}
            isUpdating={isUpdating}
            updateError={updateError}
            onOpenChange={(open) => !open && onCancelEdit()}
            onEditedTitleChange={onEditedTitleChange}
            onEditedDescriptionChange={onEditedDescriptionChange}
            onEditedTagIdsChange={onEditedTagIdsChange}
            onCreateNewTag={() => onCreateDialogOpenChange(true)}
            onSave={onUpdateVideo}
          />

          {isMobile && (
            <VideoDetailMobileTabs activeTab={mobileTab} onChange={onMobileTabChange} />
          )}

          <main
            className={`flex-grow max-w-screen-xl mx-auto w-full px-6 lg:px-8 py-6 flex flex-col gap-6 ${
              isMobile ? 'mt-0' : 'mt-16'
            }`}
          >
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div
                className={`lg:col-span-8 flex flex-col gap-4 ${
                  isMobile && mobileTab !== 'video' ? 'hidden' : ''
                }`}
              >
                <VideoPlayerPanel
                  video={video}
                  videoRef={videoRef}
                  youtubeStartSeconds={youtubeStartSeconds}
                  onVideoLoaded={onVideoLoaded}
                />
                <VideoMetaPanel
                  video={video}
                  deleteError={deleteError}
                  isDeleting={isDeleting}
                  onEdit={onStartEditing}
                  onDelete={onDeleteVideo}
                />
              </div>

              <TranscriptPanel
                video={video}
                isMobile={isMobile}
                mobileTab={mobileTab}
                transcriptSearch={transcriptSearch}
                onTranscriptSearchChange={onTranscriptSearchChange}
                isTranscriptEditing={isTranscriptEditing}
                onStartTranscriptEditing={onStartTranscriptEditing}
                onCancelTranscriptEditing={onCancelTranscriptEditing}
                editedTranscript={editedTranscript}
                onEditedTranscriptChange={onEditedTranscriptChange}
                onSaveTranscript={onSaveTranscript}
                isTranscriptSaving={isTranscriptSaving}
                transcriptSaveError={transcriptSaveError}
                filteredSegments={filteredSegments}
                activeSegmentIdx={activeSegmentIdx}
                onSeek={onSeek}
                isPlainTextTranscript={isPlainTextTranscript}
              />
            </div>
          </main>

          <TagCreateDialog
            isOpen={isCreateDialogOpen}
            onClose={() => onCreateDialogOpenChange(false)}
            onCreate={onCreateTag}
          />
        </>
      )}
    </div>
  );
}
