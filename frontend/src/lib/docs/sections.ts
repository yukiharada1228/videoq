import { listOperations, type OpenApiOperation, type OpenApiSchema } from '@/lib/docs/openapi';

export const docsSectionIds = [
  'auth',
  'videos',
  'groups',
  'tags',
  'chat',
  'openai',
  'plog',
  'evaluation',
  'admin',
] as const;

export type DocsSectionId = (typeof docsSectionIds)[number];

export function isDocsSectionId(value: string): value is DocsSectionId {
  return (docsSectionIds as readonly string[]).includes(value);
}

type SectionFilter = {
  /** OpenAPI tags declared by apps/api features. */
  tags?: string[];
  /** Used where the API does not tag the operations (account) or tags overlap (OpenAI). */
  pathPrefixes?: string[];
  excludePathPrefixes?: string[];
};

// Every integration operation in the schema belongs to exactly one section.
// /health and /ready are deliberately linked from the reference list instead.
// Membership operations are split by path because their shared OpenAPI tag
// covers both group-video and video-tag relationships.
const sectionFilters: Record<DocsSectionId, SectionFilter> = {
  auth: { pathPrefixes: ['/api/account'] },
  videos: { tags: ['Videos'] },
  groups: { tags: ['Groups'], pathPrefixes: ['/api/videos/groups/'] },
  tags: { tags: ['Tags'], pathPrefixes: ['/api/videos/{videoId}/tags'] },
  chat: { tags: ['Chat'], excludePathPrefixes: ['/api/v1/'] },
  openai: { pathPrefixes: ['/api/v1/'] },
  plog: { tags: ['Plog'] },
  evaluation: { tags: ['Evaluation'] },
  admin: { tags: ['Admin'] },
};

/** Endpoints that authenticate through neither an API key nor a session. */
const publicPathPrefixes = ['/health', '/ready', '/api/videos/groups/share/'];

export type DocsAuthMode = 'public' | 'session' | 'apiKey' | 'bearerApiKey';

/** Authentication style to show in generated request examples. */
export function getDocsAuthMode(path: string): DocsAuthMode {
  if (publicPathPrefixes.some((prefix) => path.startsWith(prefix))) return 'public';
  if (path.startsWith('/api/account/')) return 'session';
  if (path.startsWith('/api/v1/')) return 'bearerApiKey';
  return 'apiKey';
}

export function matchesDocsSection(
  section: DocsSectionId,
  path: string,
  operation: OpenApiOperation,
): boolean {
  const filter = sectionFilters[section];

  if (filter.excludePathPrefixes?.some((prefix) => path.startsWith(prefix))) {
    return false;
  }
  if (filter.pathPrefixes?.some((prefix) => path.startsWith(prefix))) {
    return true;
  }
  return Boolean(filter.tags?.some((tag) => operation.tags?.includes(tag)));
}

export function countEndpointsBySection(
  schema: OpenApiSchema | null,
): Record<DocsSectionId, number> {
  const counts = Object.fromEntries(
    docsSectionIds.map((id) => [id, 0]),
  ) as Record<DocsSectionId, number>;

  listOperations(schema).forEach(({ path, operation }) => {
    const section = docsSectionIds.find((id) => matchesDocsSection(id, path, operation));
    if (section) counts[section] += 1;
  });

  return counts;
}
