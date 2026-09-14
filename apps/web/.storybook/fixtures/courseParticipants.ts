import type { CourseInvitationListItem, CourseInviteRecipientResult, CourseParticipants } from '@videoq/trpc';

export const courseId = 3;
export const invitation = (id: number, email: string, overrides: Partial<CourseInvitationListItem> = {}): CourseInvitationListItem => ({
  id, email, status: 'pending', delivery_status: 'sent',
  created_at: '2026-09-01T09:00:00Z', expires_at: '2026-09-08T09:00:00Z',
  last_sent_at: '2026-09-01T09:00:00Z', send_attempts: 1, ...overrides,
});
export const participants: CourseParticipants = {
  members: [
    { user_id: 'student-1', username: '山田 花子', email: 'hanako@example.com', joined_at: '2026-09-01T09:00:00Z' },
    { user_id: 'student-2', username: '佐藤 太郎', email: 'taro@example.com', joined_at: '2026-09-02T09:00:00Z' },
  ],
  invitations: [invitation(7, 'pending@example.com'), invitation(8, 'retry@example.com', { delivery_status: 'failed' })],
};
export const emptyParticipants: CourseParticipants = { members: [], invitations: [] };
export const englishParticipants: CourseParticipants = {
  ...participants,
  members: participants.members.map((member, index) => ({ ...member, username: ['Hanako Yamada', 'Taro Sato'][index] })),
};
export const historyParticipants: CourseParticipants = {
  ...participants,
  invitations: [
    ...participants.invitations,
    invitation(9, 'queued@example.com', { delivery_status: 'queued', last_sent_at: null }),
    ...(['accepted', 'declined', 'expired', 'revoked'] as const).map((status, index) => invitation(10 + index, `${status}@example.com`, { status })),
  ],
};
export const longEmail = `${'collaborative-learning-'.repeat(2)}student@research-and-education.example.com`;
export const longParticipants: CourseParticipants = {
  members: [{ ...participants.members[0], username: '共同学習プロジェクトの講義・演習・復習を担当する非常に長い表示名の参加者', email: longEmail }],
  invitations: [invitation(7, `invited-${longEmail}`)],
};
export const manyParticipants: CourseParticipants = {
  members: Array.from({ length: 18 }, (_, index) => ({ ...participants.members[0], user_id: `student-${index}`, username: `第${index + 1}班の参加者`, email: `student${index}@example.com` })),
  invitations: Array.from({ length: 18 }, (_, index) => invitation(index + 30, `invite${index}@example.com`)),
};
export const mixedEmails = ['NEW@Example.com', 'invalid-address', 'new@example.com', 'hanako@example.com', 'pending@example.com'];
export const mixedResults: CourseInviteRecipientResult[] = [
  { email: 'new@example.com', status: 'queued', invitation_id: 90 },
  { email: 'invalid-address', status: 'invalid' },
  { email: 'new@example.com', status: 'duplicate' },
  { email: 'hanako@example.com', status: 'already_member' },
  { email: 'pending@example.com', status: 'already_invited' },
];
