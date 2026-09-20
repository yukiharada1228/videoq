import type { TagPage } from '@videoq/trpc';
import { tags } from './tags';

export const tagPage: TagPage = { data: tags, meta: { total: tags.length, limit: 100, offset: 0 } };
export const emptyTagPage: TagPage = { ...tagPage, data: [], meta: { ...tagPage.meta, total: 0 } };

// Better Auth's REST shape, before apiClient maps it into IntegrationApiKey[].
export const apiKeysResponse = { apiKeys: [{
  id: 'storybook-key',
  name: '授業資料の連携',
  start: 'vq_demo',
  configId: 'default',
  permissions: { videoq: ['read'] },
  lastRequest: null,
  createdAt: '2026-09-01T00:00:00Z',
}] };
