import { afterEach, describe, expect, it, vi } from 'vitest';
import i18n from '@/i18n/config';
import { ApiResponseError, fetchJsonResponse } from '../jsonFetch';

const html = (status = 503) => new Response('<!DOCTYPE html><title>CANARY_PRIVATE_DIAGNOSTIC</title>', {
  status, headers: { 'content-type': 'text/html; charset=utf-8' },
});

afterEach(() => { vi.useRealTimers(); });

describe('JSON API transport', () => {
  it('recovers a transient HTML gateway response on a read once', async () => {
    vi.useFakeTimers();
    const response = Response.json({ ok: true });
    const fetchFn = vi.fn().mockResolvedValueOnce(html()).mockResolvedValueOnce(response);
    const controller = new AbortController();
    const init = { credentials: 'include' as const, signal: controller.signal };
    const pending = fetchJsonResponse('/api/example', init, fetchFn);
    await vi.runAllTimersAsync();
    expect(await pending).toBe(response);
    expect(fetchFn.mock.calls).toEqual([['/api/example', init], ['/api/example', init]]);
  });

  it('stops after one failed retry and reports a localized error without HTML', async () => {
    vi.useFakeTimers();
    const fetchFn = vi.fn(async () => html());
    const pending = fetchJsonResponse('/api/example', undefined, fetchFn).catch(error => error);
    await vi.runAllTimersAsync();
    const error = await pending;
    expect(error).toBeInstanceOf(ApiResponseError);
    expect(error).toMatchObject({ status: 503, code: 'INVALID_API_RESPONSE', message: i18n.t('common.messages.connectionFailed') });
    expect(error.message).not.toContain('CANARY');
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('does not replay a %s after an HTML error', async (method) => {
    const fetchFn = vi.fn(async () => html());
    await expect(fetchJsonResponse('/api/example', { method }, fetchFn)).rejects.toMatchObject({ status: 503 });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it.each([200, 401, 403, 404, 429])('does not retry an unexpected HTML response with status %s', async (status) => {
    const fetchFn = vi.fn(async () => html(status));
    await expect(fetchJsonResponse('/api/example', undefined, fetchFn)).rejects.toMatchObject({ status });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it.each([200, 400, 401, 403, 429, 503])('preserves application JSON and its status %s', async (status) => {
    const response = Response.json({ code: 'APPLICATION_RESPONSE' }, { status });
    const fetchFn = vi.fn(async () => response);
    expect(await fetchJsonResponse('/api/example', undefined, fetchFn)).toBe(response);
    expect(await response.json()).toEqual({ code: 'APPLICATION_RESPONSE' });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('honors cancellation while waiting to retry', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const fetchFn = vi.fn(async () => html());
    const pending = fetchJsonResponse('/api/example', { signal: controller.signal }, fetchFn).catch(error => error);
    await vi.advanceTimersByTimeAsync(100);
    controller.abort();
    await vi.runAllTimersAsync();
    expect(await pending).toMatchObject({ name: 'AbortError' });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('respects the method on a Request object', async () => {
    const fetchFn = vi.fn(async () => html());
    await expect(fetchJsonResponse(new Request('https://example.test/api', { method: 'POST' }), undefined, fetchFn))
      .rejects.toMatchObject({ status: 503 });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('uses the current locale at failure time', async () => {
    const original = i18n.language;
    try {
      for (const locale of ['en', 'ja']) {
        await i18n.changeLanguage(locale);
        await expect(fetchJsonResponse('/api/example', { method: 'POST' }, async () => html()))
          .rejects.toMatchObject({ message: i18n.t('common.messages.connectionFailed') });
      }
    } finally { await i18n.changeLanguage(original); }
  });
});
