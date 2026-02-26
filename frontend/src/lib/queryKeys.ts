export const queryKeys = {
  auth: {
    me: ['auth', 'me'] as const,
  },
  videoGroups: {
    all: (userId: number | string | null) => ['videoGroups', userId] as const,
    detail: (groupId: number | null) => ['videoGroup', groupId] as const,
    shared: (shareToken: string) => ['sharedVideoGroup', shareToken] as const,
    addableVideos: (params: {
      groupId: number | null;
      q: string;
      status: string;
      ordering: string;
      tagIds: number[];
      currentVideoIds: number[];
    }) => ['videoGroups', 'addableVideos', params] as const,
  },
  videos: {
    all: ['videos'] as const,
    list: (params?: { tags?: number[] }) =>
      ['videos', 'list', { tags: params?.tags ?? [] }] as const,
    detail: (videoId: number | null) => ['videos', 'detail', videoId] as const,
  },
  tags: {
    all: ['tags'] as const,
  },
  chat: {
    history: (groupId: number | null, shareToken?: string) => ['chatHistory', groupId, shareToken ?? null] as const,
  },
  shorts: {
    popularScenes: (groupId: number, shareToken?: string) => ['popularScenes', groupId, shareToken ?? null] as const,
  },
} as const;
