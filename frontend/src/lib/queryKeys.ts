export const queryKeys = {
  auth: {
    me: ['auth', 'me'] as const,
    apiKeys: ['auth', 'apiKeys'] as const,
    searchApiKey: ['auth', 'searchApiKey'] as const,
    oauthTokens: ['auth', 'oauthTokens'] as const,
  },
  videoCourses: {
    prefix: ['videoCourses'] as const,
    all: (userId: number | string | null) => ['videoCourses', userId] as const,
    count: (userId: number | string | null) => ['videoCourses', userId, 'count'] as const,
    infinite: (userId: number | string | null) => ['videoCourses', 'infinite', userId] as const,
    allDetail: ['videoCourse'] as const,
    detail: (courseId: number | null) => ['videoCourse', courseId] as const,
    allShared: ['sharedVideoCourse'] as const,
    shared: (shareToken: string) => ['sharedVideoCourse', shareToken] as const,
    invitation: (token: string) => ['courseInvitation', token] as const,
    participants: (courseId: number | null) => ['courseParticipants', courseId] as const,
    addableVideos: (params: {
      courseId: number | null;
      q: string;
      status: string;
      ordering: string;
      tagIds: number[];
      currentVideoIds: number[];
    }) => ['videoCourses', 'addableVideos', params] as const,
  },
  videos: {
    all: ['videos'] as const,
    stats: ['videos', 'stats'] as const,
    recent: ['videos', 'list', { tags: [], limit: 5, ordering: 'uploaded_at_desc' }] as const,
    list: (params?: { tags?: number[] }) =>
      ['videos', 'list', { tags: params?.tags ?? [] }] as const,
    infinite: (params?: { tags?: number[]; q?: string; status?: string; ordering?: string }) =>
      ['videos', 'infinite', { tags: params?.tags ?? [], q: params?.q ?? '', status: params?.status ?? '', ordering: params?.ordering ?? '' }] as const,
    detail: (videoId: number | null) => ['videos', 'detail', videoId] as const,
  },
  popularScenes: {
    all: ['popularScenes'] as const,
    byCourse: (courseId: number) => ['popularScenes', courseId] as const,
  },
  tags: {
    all: ['tags'] as const,
  },
  chat: {
    history: (courseId: number | null, shareToken?: string) => ['chatHistory', courseId, shareToken ?? null] as const,
    analytics: (courseId: number) => ['chatAnalytics', courseId] as const,
    evaluations: (courseId: number | null) => ['chatEvaluations', courseId] as const,
    evaluationSummary: (courseId: number | null) => ['evaluationSummary', courseId] as const,
  },
  billing: {
    plans: ['billing', 'plans'] as const,
  },
  admin: {
    prefix: ['admin'] as const,
    users: (params: { q: string; limit: number; offset: number }) =>
      ['admin', 'users', params] as const,
  },
} as const;
