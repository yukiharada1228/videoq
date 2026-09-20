import { getSafeNextPath } from '../authRedirect';

describe('getSafeNextPath', () => {
  it.each([
    null, '', 'settings', 'https://evil.example', '//evil.example',
    '/\\evil.example', '/\t/evil.example', '/\n/evil.example', '/\r/evil.example',
    '/\t\\evil.example', 'javascript:alert(1)',
  ])('rejects an unsafe redirect: %j', (next) => {
    expect(getSafeNextPath(next)).toBeNull();
  });

  it.each([
    '/', '/settings', '/ja/settings#account', '/course-invitations/invite-token',
    '/api/auth/oauth2/authorize?client_id=app&redirect_uri=https%3A%2F%2Fclient.example%2Fcb',
    '/.//evil.example', '/%2Fexample',
  ])('preserves safe paths and their same-origin interpretation: %s', (next) => {
    const safePath = getSafeNextPath(next);
    expect(safePath).toBe(next);
    expect(new URL(safePath!, 'https://videoq.jp').origin).toBe('https://videoq.jp');
  });
});
