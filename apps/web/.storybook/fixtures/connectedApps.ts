import type { AuthorizedOAuthToken } from '@/lib/api';

export const consents: AuthorizedOAuthToken[] = [
  { id: 'consent-classroom', client_id: 'classroom', client_name: '授業サポート', scope: 'openid profile videoq.read', issued_at: '2026-09-01T09:00:00Z' },
  { id: 'consent-notes', client_id: 'notes', client_name: '学習ノート', scope: 'videoq.read videoq.write', issued_at: '2026-09-02T03:30:00Z' },
];

export const englishClientNames: Record<string, string> = { classroom: 'Classroom assistant', notes: 'Study notes' };
export const longClientNames: Record<string, string> = {
  classroom: '複数の講義・演習資料を横断して学習計画と復習記録を管理する共同学習アシスタント',
  notes: 'LectureNotesAndCollaborativeLearningWorkspaceWithExtendedProjectName',
};
export const longConsents = [{
  ...consents[0],
  scope: 'openid profile email offline_access video:read video:write chat:read chat:write course:read course:write',
}, consents[1]];

export const revokeConsentPath = '/api/auth/oauth2/delete-consent';
