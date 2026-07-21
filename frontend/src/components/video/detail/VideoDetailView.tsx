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
import { StatusBadge } from '@/components/common/StatusBadge';
import { ErrorMessage } from '@/components/auth/ErrorMessage';
import { TagCreateDialog } from '@/components/video/TagCreateDialog';
import { TagSelector } from '@/components/video/TagSelector';
import { TagBadge } from '@/components/video/TagBadge';
import { PlogPanel } from '@/components/video/detail/PlogPanel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  Breadcrumbs,
  BreadcrumbsLabel,
} from '@/components/ui/breadcrumbs';
import { Heading, HeadingTitle } from '@/components/ui/heading';
import { UtilityLink } from '@/components/ui/utility-link';
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogHeading,
  useDialog,
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

  const dialog = useDialog({
    open: isOpen,
    onOpenChange,
    onRequestClose: (event) => {
      if (isUpdating) event.preventDefault();
    },
  });

  if (!isOpen) return null;

  return (
    <Dialog {...dialog.dialogProps} width="min(32rem, 92vw)">
      <DialogContent>
        <DialogHeader>
          <DialogHeading {...dialog.headingProps}>{t('videos.detail.editButton')}</DialogHeading>
        </DialogHeader>
        <DialogBody>
          <p className="mb-4 text-std-16N-170 text-solid-gray-700">
            {t('videos.detail.editDescriptionLabel')}
          </p>
          <div className="space-y-4">
            {updateError && <ErrorMessage message={updateError} />}
            <div className="flex flex-col gap-2">
              <Label htmlFor="video-edit-title">{t('videos.detail.editTitleLabel')}</Label>
              <Input
                id="video-edit-title"
                type="text"
                value={editedTitle}
                onChange={(event) => onEditedTitleChange(event.target.value)}
                disabled={isUpdating}
                blockSize="md"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="video-edit-description">{t('videos.detail.editDescriptionLabel')}</Label>
              <Textarea
                id="video-edit-description"
                value={editedDescription}
                onChange={(event) => onEditedDescriptionChange(event.target.value)}
                disabled={isUpdating}
                rows={4}
                className="resize-none"
              />
            </div>
            <div className="flex flex-col gap-2">
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
        </DialogBody>
        <DialogActions>
          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isUpdating}
            >
              <X className="w-3.5 h-3.5" />
              {t('common.actions.cancel')}
            </Button>
            <Button
              type="button"
              onClick={onSave}
              disabled={isUpdating || !editedTitle.trim()}
            >
              {isUpdating ? <InlineSpinner className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
              {isUpdating ? t('common.actions.saving') : t('common.actions.save')}
            </Button>
          </div>
        </DialogActions>
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
    <div className="flex shrink-0 border-b border-solid-gray-200 bg-white">
      <button
        type="button"
        onClick={() => onChange('video')}
        className={`flex-1 flex items-center justify-center gap-2 py-3 text-oln-16B-100 transition-colors ${
          activeTab === 'video'
            ? 'text-key-900 border-b-2 border-key-900'
            : 'text-solid-gray-536 hover:text-solid-gray-800'
        }`}
      >
        <Play className="w-4 h-4" />
        {t('videos.detail.video')}
      </button>
      <button
        type="button"
        onClick={() => onChange('transcript')}
        className={`flex-1 flex items-center justify-center gap-2 py-3 text-oln-16B-100 transition-colors ${
          activeTab === 'transcript'
            ? 'text-key-900 border-b-2 border-key-900'
            : 'text-solid-gray-536 hover:text-solid-gray-800'
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
    <div className="w-full aspect-video overflow-hidden border border-solid-gray-420 bg-solid-gray-800">
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
        <div className="w-full h-full flex flex-col items-center justify-center gap-3 text-solid-gray-420">
          <VideoIcon className="w-16 h-16 text-solid-gray-536" />
          <p className="text-std-16N-170">{t('common.messages.videoFileMissing')}</p>
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
  const pipelineSteps = [
    { key: 'upload', label: t('videos.detail.pipeline.upload'), doneStatuses: ['processing', 'indexing', 'completed', 'error'] },
    { key: 'transcript', label: t('videos.detail.pipeline.transcript'), doneStatuses: ['indexing', 'completed'] },
    { key: 'aiAnalysis', label: t('videos.detail.pipeline.aiAnalysis'), doneStatuses: ['completed'] },
  ] as { key: string; label: string; doneStatuses: Video['status'][] }[];

  return (
    <div className="flex flex-col gap-4 border border-solid-gray-420 bg-white p-6">
      <div className="flex justify-between items-start gap-4">
        <div>
          <Heading size="20" className="mb-1">
            <HeadingTitle level="h1">{video.title}</HeadingTitle>
          </Heading>
          <div className="flex items-center gap-2 text-std-16N-170 text-solid-gray-600">
            <Calendar className="w-3.5 h-3.5 shrink-0" />
            <span>{formatDate(video.uploaded_at, 'full', locale)}</span>
          </div>
        </div>
        <StatusBadge status={video.status} size="sm" className="ml-0 shrink-0" />
      </div>

      {video.tags && video.tags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {video.tags.map((tag) => (
            <TagBadge key={tag.id} tag={tag} size="sm" />
          ))}
        </div>
      )}

      <div className="border-t border-solid-gray-200 pt-4 flex items-center gap-3 flex-wrap">
        <span className="text-dns-14B-120 text-solid-gray-600 uppercase tracking-widest shrink-0">
          {t('videos.detail.statusSection')}
        </span>
        {pipelineSteps.map(({ key, label, doneStatuses }, index) => {
          const done = doneStatuses.includes(video.status);
          return (
            <div key={key} className="flex items-center gap-2">
              {index > 0 && <div className="w-6 h-px bg-solid-gray-300" />}
              <div className="flex items-center gap-1.5">
                <div
                  className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
                    done ? 'bg-key-900' : 'bg-solid-gray-300'
                  }`}
                >
                  {done ? (
                    <CheckCircle className="w-3 h-3 text-white" />
                  ) : (
                    <div className="w-1.5 h-1.5 rounded-full bg-solid-gray-420" />
                  )}
                </div>
                <span className={`text-dns-14B-120 ${done ? 'text-solid-gray-800' : 'text-solid-gray-420'}`}>
                  {label}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {video.error_message && <ErrorMessage message={video.error_message} />}

      {video.description && (
        <div className="border-t border-solid-gray-200 pt-4">
          <p className="text-std-16N-170 text-solid-gray-700 leading-relaxed">{video.description}</p>
        </div>
      )}

      {deleteError && <ErrorMessage message={deleteError} />}

      <div className="border-t border-solid-gray-200 pt-4 flex items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onEdit}>
          <Pencil className="w-3.5 h-3.5 mr-1.5" />
          {t('videos.detail.editButton')}
        </Button>
        <Button
          type="button"
          variant="text"
          size="sm"
          onClick={onDelete}
          disabled={isDeleting}
          className="text-error-1 hover:bg-red-50"
        >
          {isDeleting ? <InlineSpinner className="w-3.5 h-3.5 mr-1.5" /> : <Trash2 className="w-3.5 h-3.5 mr-1.5" />}
          {isDeleting ? t('common.actions.deleting') : t('videos.detail.deleteButton')}
        </Button>
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
      className={`lg:col-span-4 flex flex-col border border-solid-gray-420 bg-white ${
        isMobile
          ? 'min-h-[500px]'
          : 'sticky top-[var(--app-header-offset,8.5rem)] h-[calc(100vh-var(--app-header-offset,8.5rem))]'
      } ${isMobile && mobileTab !== 'transcript' ? 'hidden' : ''}`}
    >
      <div className="p-4 border-b border-solid-gray-200 flex flex-col gap-3 shrink-0">
        <div className="flex justify-between items-center">
          <Heading size="18">
            <HeadingTitle level="h2">{t('videos.detail.transcriptSection')}</HeadingTitle>
          </Heading>
          {!isTranscriptEditing && (
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={onStartTranscriptEditing}
              disabled={!video.transcript}
            >
              <Pencil className="h-3.5 w-3.5 mr-1.5" />
              {t('videos.detail.editTranscriptButton')}
            </Button>
          )}
        </div>
        {!isTranscriptEditing && (
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-solid-gray-600 w-3.5 h-3.5 z-10" />
            <Input
              type="search"
              blockSize="sm"
              value={transcriptSearch}
              onChange={(event) => onTranscriptSearchChange(event.target.value)}
              placeholder={t('videos.detail.transcriptSearchPlaceholder')}
              className="pl-9"
            />
          </div>
        )}
      </div>

      {isTranscriptEditing ? (
        <div className="flex-1 overflow-hidden flex flex-col">
          <div className="flex shrink-0 flex-col gap-3 border-b border-solid-gray-200 bg-solid-gray-50 p-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex shrink-0 gap-2">
              <Button
                type="button"
                variant="outline"
                size="xs"
                onClick={onCancelTranscriptEditing}
                disabled={isTranscriptSaving}
              >
                {t('videos.detail.cancel')}
              </Button>
              <Button
                type="button"
                variant="solid"
                size="xs"
                onClick={onSaveTranscript}
                disabled={isTranscriptSaving}
              >
                {isTranscriptSaving ? <InlineSpinner className="h-3 w-3 mr-1.5" /> : <Save className="h-3 w-3 mr-1.5" />}
                {isTranscriptSaving ? t('videos.detail.saving') : t('videos.detail.saveTranscriptButton')}
              </Button>
            </div>
          </div>
          {transcriptSaveError && (
            <div className="shrink-0 p-3 border-b border-solid-gray-200">
              <ErrorMessage message={transcriptSaveError} />
            </div>
          )}
          <Textarea
            value={editedTranscript}
            onChange={(event) => onEditedTranscriptChange(event.target.value)}
            disabled={isTranscriptSaving}
            spellCheck={false}
            className="min-h-0 flex-1 resize-none rounded-none border-0 font-mono text-dns-14N-130 leading-relaxed focus:outline-none focus:ring-0"
          />
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-1">
          {filteredSegments.length > 0 ? (
            filteredSegments.map((segment, index) => (
              <div
                key={index}
                onClick={() => onSeek(segment.seconds, index)}
                className={`flex cursor-pointer gap-4 rounded-8 p-3 transition-colors group ${
                  activeSegmentIdx === index
                    ? 'border-l-4 border-key-900 bg-blue-50'
                    : 'hover:bg-solid-gray-50'
                }`}
              >
                <span className="mt-0.5 h-fit shrink-0 whitespace-nowrap rounded-8 bg-blue-50 px-2 py-0.5 font-mono text-dns-14B-120 text-key-900">
                  {segment.timestamp}
                </span>
                <p
                  className={`text-std-16N-170 leading-relaxed ${
                    activeSegmentIdx === index
                      ? 'text-solid-gray-800 font-medium'
                      : 'text-solid-gray-700 group-hover:text-solid-gray-800'
                  }`}
                >
                  {segment.text}
                </p>
              </div>
            ))
          ) : isPlainTextTranscript ? (
            <div className="p-4 bg-white rounded-8">
              <p className="text-std-16N-170 text-solid-gray-700 whitespace-pre-wrap leading-relaxed">
                {video.transcript}
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-solid-gray-600">
              <div className="w-16 h-16 bg-solid-gray-50 border border-solid-gray-200 rounded-full flex items-center justify-center mb-4">
                <Search className="w-8 h-8 text-solid-gray-420" />
              </div>
              <p className="text-std-16N-170 font-medium text-center px-4">
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
    <div className="bg-solid-gray-50 flex flex-col min-h-screen text-solid-gray-800">
      <AppNav activePage="videos" />

      {isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <LoadingSpinner />
        </div>
      ) : error && !video ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <ErrorMessage message={error} />
          <UtilityLink asChild>
            <Link href="/videos" className="inline-flex items-center gap-1">
              <ArrowLeft className="w-4 h-4" />
              {t('common.actions.backToList')}
            </Link>
          </UtilityLink>
        </div>
      ) : !video ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-solid-gray-700">{t('common.messages.videoNotFound')}</p>
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

          <main className="mx-auto flex w-full max-w-screen-xl flex-grow flex-col gap-6 px-6 py-6 lg:px-8">
            <Breadcrumbs aria-label={t('common.actions.backToList')}>
              <BreadcrumbsLabel className="sr-only">
                {t('common.actions.backToList')}
              </BreadcrumbsLabel>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbLink asChild>
                    <Link href="/videos">{t('navigation.videosNav')}</Link>
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbItem isCurrent>{video.title}</BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumbs>

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

            {video.status === 'completed' && (
              <PlogPanel videoId={video.id} />
            )}
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
