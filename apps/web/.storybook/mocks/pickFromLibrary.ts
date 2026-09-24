import { fn } from 'storybook/test';
import type { VideoList } from '@/lib/api';
import { libraryVideos } from '../fixtures/detail';
import { tagPage } from '../fixtures/api';
import { failure, pending, success, trpcHandler, trpcMutation, trpcQuery } from './network';

export const listRequest = fn();
export const addRequest = fn();
export const loadError = '動画一覧を取得できませんでした / Could not load videos.';
export const addError = '動画を追加できませんでした / Could not add videos.';
export interface LibraryScenario { videos?: VideoList[]; load?: 'pending' | 'error'; add?: 'pending' | 'error' | 'retry'; skipped?: number }
export function libraryHandler(scenario: LibraryScenario = {}) {
  listRequest.mockClear(); addRequest.mockClear();
  let attempts = 0;
  return trpcHandler([
    trpcQuery('tags.list', success(tagPage)),
    trpcQuery('videos.list', input => {
      listRequest(input);
      if (scenario.load === 'pending') return pending();
      if (scenario.load === 'error') return failure(loadError);
      const data = (scenario.videos ?? libraryVideos).filter(video => (!input?.q || `${video.title} ${video.description}`.toLowerCase().includes(input.q.toLowerCase())) && (!input?.status || video.status === input.status) && (!input?.tags?.length || input.tags.every(id => video.tags?.some(tag => tag.id === id))));
      data.sort((a, b) => input?.ordering?.startsWith('title') ? a.title.localeCompare(b.title, 'ja') * (input.ordering === 'title_desc' ? -1 : 1) : a.uploaded_at.localeCompare(b.uploaded_at) * (input?.ordering === 'uploaded_at_asc' ? 1 : -1));
      const limit = input?.limit ?? 24;
      const offset = input?.cursor ?? 0;
      return success({ data: data.slice(offset, offset + limit), meta: { total: data.length, limit, offset } });
    }),
    trpcMutation('memberships.addVideos', input => {
      addRequest(input); attempts++;
      if (scenario.add === 'pending') return pending();
      if (scenario.add === 'error' || (scenario.add === 'retry' && attempts === 1)) return failure(addError);
      const skipped = Math.min(scenario.skipped ?? 0, input.videoIds.length);
      return success({ message: 'Added (fixture)', added_count: input.videoIds.length - skipped, skipped_count: skipped });
    }),
  ]);
}
