import type { TagPage } from '@videoq/trpc';
import { tags } from './tags';

export const tagPage: TagPage = { data: tags, meta: { total: tags.length, limit: 100, offset: 0 } };
export const emptyTagPage: TagPage = { ...tagPage, data: [], meta: { ...tagPage.meta, total: 0 } };

export const integrationApiKeys: import('@/lib/api').IntegrationApiKey[] = [{
  id: 'storybook-key', name: '授業資料の連携', prefix: 'vq_demo',
  config_id: 'default', access_level: 'read_only', last_used_at: null,
  created_at: '2026-09-01T00:00:00.000Z',
}];
