import { describe, expect, it, vi } from 'vitest';

vi.unmock('@/lib/authSession');
const { sessionState } = vi.hoisted(() => ({
  sessionState: {
    data: { user: { id: 'current-user' } },
    isPending: false,
    isRefetching: false,
    refetch: vi.fn(),
    error: null as { status: number; message: string } | null,
  },
}));
vi.mock('@/lib/auth-client', () => ({
  authClient: { useSession: () => sessionState },
}));

import { useAuthSession } from '../authSession';

describe('useAuthSession', () => {
  it.each([401, 403])('hides cached user data after session endpoint rejection: %s', (status) => {
    sessionState.error = { status, message: 'Session rejected' };
    const session = useAuthSession();
    expect(session.data).toBeNull();
    expect(session.error).toEqual({ status, message: 'Session rejected' });
    expect(session.refetch).toBe(sessionState.refetch);
  });

  it('retains the previous session on a transient server error', () => {
    sessionState.error = { status: 503, message: 'Temporarily unavailable' };
    expect(useAuthSession().data?.user.id).toBe('current-user');
  });

  it('returns the session again after a successful revalidation', () => {
    sessionState.error = { status: 403, message: 'User is inactive' };
    expect(useAuthSession().data).toBeNull();
    sessionState.error = null;
    expect(useAuthSession().data?.user.id).toBe('current-user');
  });
});
