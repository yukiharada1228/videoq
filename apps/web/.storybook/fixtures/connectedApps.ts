import { http, HttpResponse } from 'msw';

export const consents = [
  { id: 'consent-classroom', clientId: 'classroom', scopes: ['openid', 'profile', 'video:read'], createdAt: '2026-09-01T09:00:00Z' },
  { id: 'consent-notes', clientId: 'notes', scopes: ['video:read', 'chat:write'], createdAt: '2026-09-02T03:30:00Z' },
];

export const clientNames: Record<string, string> = {
  classroom: '授業サポート',
  notes: '学習ノート',
};
export const englishClientNames: Record<string, string> = { classroom: 'Classroom assistant', notes: 'Study notes' };
export const longClientNames: Record<string, string> = {
  classroom: '複数の講義・演習資料を横断して学習計画と復習記録を管理する共同学習アシスタント',
  notes: 'LectureNotesAndCollaborativeLearningWorkspaceWithExtendedProjectName',
};
export const longConsents = [{
  ...consents[0],
  scopes: ['openid', 'profile', 'email', 'offline_access', 'video:read', 'video:write', 'chat:read', 'chat:write', 'course:read', 'course:write'],
}, consents[1]];

export const consentListPath = '/api/auth/oauth2/get-consents';
export const revokeConsentPath = '/api/auth/oauth2/delete-consent';

export function publicClientHandler(names = clientNames) {
  return http.get('/api/auth/oauth2/public-client', ({ request }) => {
    const id = new URL(request.url).searchParams.get('client_id') ?? '';
    return HttpResponse.json({ client_id: id, client_name: names[id] ?? id });
  });
}
