import { render, screen } from '@testing-library/react';
import { useNavigate } from 'react-router-dom';
import SignupCompletePage from '../SignupCompletePage';
import { completeSignupTracking } from '@/lib/landingAnalytics';
import * as authSession from '@/lib/authSession';

vi.mock('@/lib/landingAnalytics', () => ({ completeSignupTracking: vi.fn() }));

describe('Google signup completion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.__setMockLanguage('ja');
    globalThis.__setMockSearchParams('next=%2Fvideos');
  });
  afterEach(() => vi.restoreAllMocks());

  it('waits for a confirmed session before recording signup and returning to the requested page', () => {
    globalThis.__setMockAuthSession(null, true);
    const { rerender } = render(<SignupCompletePage method="google" />);
    expect(completeSignupTracking).not.toHaveBeenCalled();
    expect(useNavigate()).not.toHaveBeenCalled();
    globalThis.__setMockAuthSession({ user: { id: 'new-google-user' } });
    rerender(<SignupCompletePage method="google" />);
    expect(completeSignupTracking).toHaveBeenCalledOnce();
    expect(useNavigate()).toHaveBeenCalledWith('/videos', { replace: true });
  });

  it('does not count a failed or unauthenticated callback', () => {
    globalThis.__setMockAuthSession(null);
    render(<SignupCompletePage method="google" />);
    expect(screen.getByRole('alert')).toHaveTextContent('auth.login.oauthCallbackFailed');
    expect(completeSignupTracking).not.toHaveBeenCalled();
    expect(useNavigate()).not.toHaveBeenCalled();
  });

  it('requires a verified email session before completing the email signup', () => {
    globalThis.__setMockAuthSession({ user: { id: 'email-user', emailVerified: false } });
    const { rerender } = render(<SignupCompletePage method="email" />);
    expect(completeSignupTracking).not.toHaveBeenCalled();
    expect(useNavigate()).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('auth.verifyEmail.error');
    globalThis.__setMockAuthSession({ user: { id: 'email-user', emailVerified: true } });
    rerender(<SignupCompletePage method="email" />);
    expect(completeSignupTracking).toHaveBeenCalledWith('email');
    expect(useNavigate()).toHaveBeenCalledWith('/videos', { replace: true });
  });

  it('does not count a stale session during an authentication outage', () => {
    const state = authSession.useAuthSession();
    vi.spyOn(authSession, 'useAuthSession').mockReturnValue({
      ...state, error: { status: 503, statusText: 'Unavailable', message: 'Unavailable' },
    });
    render(<SignupCompletePage method="google" />);
    expect(completeSignupTracking).not.toHaveBeenCalled();
    expect(useNavigate()).not.toHaveBeenCalled();
  });

  it.each(['email', 'google'] as const)('does not count a rejected %s callback even with a verified session', method => {
    globalThis.__setMockAuthSession({ user: { id: 'signed-in-user', emailVerified: true } });
    globalThis.__setMockSearchParams('next=%2Fvideos&error=TOKEN_EXPIRED');
    render(<SignupCompletePage method={method} />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(completeSignupTracking).not.toHaveBeenCalled();
    expect(useNavigate()).not.toHaveBeenCalled();
  });

  it.each(['https://other.example', '//other.example', '/signup/complete', '/en/signup/complete?next=/', '/signup/verified']) (
    'rejects unsafe or recursive next paths: %s', next => {
      globalThis.__setMockLanguage('en');
      globalThis.__setMockSearchParams(`next=${encodeURIComponent(next)}`);
      render(<SignupCompletePage method="google" />);
      expect(useNavigate()).toHaveBeenCalledWith('/en/', { replace: true });
    },
  );
});
