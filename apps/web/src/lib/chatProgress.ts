import type { ChatStreamEvent } from '@/lib/api-types';

export interface ChatSearchStep {
  id: number;
  query: string;
  status: 'running' | 'complete' | 'interrupted';
  resultCount?: number;
}

export interface ChatProgress {
  phase: 'preparing' | 'searching' | 'reviewing' | 'answering' | 'complete' | 'error';
  searches: ChatSearchStep[];
}

export const createChatProgress = (): ChatProgress => ({ phase: 'preparing', searches: [] });

export function updateChatProgress(progress: ChatProgress, event: ChatStreamEvent): ChatProgress {
  if (progress.phase === 'error' || progress.phase === 'complete') return progress;

  if (event.type === 'searching') {
    const id = event.search_id ?? progress.searches.length + 1;
    if (progress.searches.some((search) => search.id === id)) return progress;
    return {
      phase: 'searching',
      searches: [...progress.searches, { id, query: event.query, status: 'running' }],
    };
  }
  if (event.type === 'search_completed') {
    const searches = progress.searches.map((search): ChatSearchStep => search.id === event.search_id
      ? { ...search, status: 'complete', resultCount: event.result_count }
      : search);
    return { phase: searches.some((search) => search.status === 'running') ? 'searching' : 'reviewing', searches };
  }
  if (event.type === 'error') {
    return {
      phase: 'error',
      searches: progress.searches.map((search) => search.status === 'running'
        ? { ...search, status: 'interrupted' } : search),
    };
  }
  if (event.type === 'done' || (event.type === 'content_chunk' && event.text !== '')) {
    const phase = event.type === 'done' ? 'complete' : 'answering';
    if (phase === progress.phase) return progress;
    return {
      phase,
      // Older APIs only send searching; answer content also confirms those searches ended.
      searches: progress.searches.map((search) => search.status === 'running'
        ? { ...search, status: 'complete' } : search),
    };
  }
  return progress;
}
