import { afterEach, describe, expect, it, vi } from 'vitest';
import i18n from '@/i18n/config';

vi.unmock('@/lib/auth-client');
import { authClient } from '../auth-client';

afterEach(() => vi.unstubAllGlobals());

describe('Better Auth response handling', () => {
  it('reports an HTML sign-in failure without replaying the login request', async () => {
    const fetchFn = vi.fn(async () => new Response('<!DOCTYPE html><title>Upstream error</title>', {
      status: 502, headers: { 'content-type': 'text/html' },
    }));
    vi.stubGlobal('fetch', fetchFn);
    await expect(authClient.signIn.social({ provider: 'google', callbackURL: '/', disableRedirect: true }))
      .rejects.toMatchObject({ status: 502, message: i18n.t('common.messages.connectionFailed') });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('preserves the Google redirect response', async () => {
    const data = { url: 'https://accounts.google.com/o/oauth2/v2/auth', redirect: false };
    vi.stubGlobal('fetch', vi.fn(async () => Response.json(data)));
    await expect(authClient.signIn.social({ provider: 'google', callbackURL: '/', disableRedirect: true }))
      .resolves.toMatchObject({ data, error: null });
  });
});
