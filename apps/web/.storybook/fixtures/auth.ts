import type { User } from '@/lib/api';
import type { useAuthSession } from '@/lib/authSession';

type SessionData = ReturnType<typeof useAuthSession>['data'];
export interface AuthFixture {
  profile: User | null;
  session: SessionData;
}

export const regularUser: User = {
  id: 'storybook-user',
  username: '山田 太郎',
  email: 'learner@example.test',
  is_superuser: false,
  video_count: 3,
  max_video_upload_size_mb: 100,
  plan_code: 'free',
};

export function authFixture(profile: User | null): AuthFixture {
  if (!profile) return { profile: null, session: null };
  const createdAt = new Date('2026-09-01T00:00:00Z');
  return {
    profile,
    session: {
      user: {
        id: profile.id,
        name: profile.username,
        username: profile.username,
        displayUsername: profile.username,
        email: profile.email,
        emailVerified: true,
        image: null,
        createdAt,
        updatedAt: createdAt,
      },
      session: {
        id: `session-${profile.id}`,
        userId: profile.id,
        token: 'storybook-fixture-only',
        expiresAt: new Date('2099-01-01T00:00:00Z'),
        createdAt,
        updatedAt: createdAt,
        ipAddress: null,
        userAgent: null,
      },
    },
  };
}

export const authFixtures = {
  loggedOut: authFixture(null),
  user: authFixture(regularUser),
  admin: authFixture({ ...regularUser, id: 'storybook-admin', username: '管理者', is_superuser: true }),
  english: authFixture({ ...regularUser, username: 'Alex Morgan' }),
  longName: authFixture({ ...regularUser, username: '教材制作と授業運営を担当する共同学習プロジェクトの管理者' }),
};
