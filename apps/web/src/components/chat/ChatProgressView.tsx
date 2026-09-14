import { useId, useState } from 'react';
import { ChevronDown, LoaderCircle, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ChatProgress } from '@/lib/chatProgress';

export function ChatProgressView({ progress, waitingForAnswer }: {
  progress: ChatProgress;
  waitingForAnswer: boolean;
}) {
  const { t } = useTranslation();
  const detailsId = useId();
  const [expanded, setExpanded] = useState(false);
  const { phase, searches } = progress;
  // Network completion can precede the first typewriter tick. Keep the waiting
  // state until answer text is actually on screen, and group the search loop.
  const pending = waitingForAnswer && phase !== 'error';
  if (!pending && searches.length === 0) return null;

  const queries = [...new Set(searches.map((search) => search.query))];
  const label = pending
    ? searches.length > 0 ? t('chat.progress.checkingVideos') : t('chat.progress.preparing')
    : phase === 'error' ? t('chat.progress.interrupted') : t('chat.progress.searched');
  const ActivityIcon = pending ? LoaderCircle : Search;
  const summary = <>
    <ActivityIcon aria-hidden="true" className={`h-4 w-4 shrink-0 ${pending ? 'animate-spin motion-reduce:animate-none' : ''}`} />
    <span className="min-w-0 line-clamp-2 text-left">{label}</span>
  </>;

  return (
    <div className="min-w-0 space-y-2 text-dns-14N-130 text-solid-gray-600">
      <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {label}
      </p>
      {/* Keep the collapsed row the same height through every search phase. */}
      <button
        type="button"
        disabled={searches.length === 0}
        aria-label={`${label}。${t('chat.progress.details')}`}
        aria-expanded={expanded}
        aria-controls={detailsId}
        onClick={() => setExpanded((value) => !value)}
        className="flex h-10 w-full items-center gap-2 rounded-4 enabled:hover:text-key-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-key-900"
      >
        {summary}
        <ChevronDown aria-hidden="true" className={`ml-auto h-4 w-4 shrink-0 ${searches.length === 0 ? 'invisible' : ''} ${expanded ? 'rotate-180' : ''}`} />
      </button>
      {searches.length > 0 && (
        <ul id={detailsId} hidden={!expanded} className="space-y-2 border-l border-solid-gray-200 pl-3 text-solid-gray-800">
          {queries.map((query) => (
            <li key={query} className="[overflow-wrap:anywhere]">
              {query}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
