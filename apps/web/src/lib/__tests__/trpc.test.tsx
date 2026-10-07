import { describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { QueryClientProvider, useMutation, useQuery } from '@tanstack/react-query';
import { createTRPCOptionsProxy } from '@trpc/tanstack-react-query';
import { TRPCClientError } from '@trpc/client';
import { ApiError, getApiError } from '../api-error';
import { createAppQueryClient } from '../queryClient';
import { createAppTrpcClient } from '../trpc';
import i18n from '@/i18n/config';

// Exercise our actual Provider and transport, without the suite's mock tRPC wrapper.
const { act, renderHook, waitFor } = await vi.importActual<typeof import('@testing-library/react')>('@testing-library/react');

function failure(code: 'UNAUTHORIZED' | 'FORBIDDEN', applicationCode: string = code) {
  return {
    error: {
      message: 'Request denied',
      code: code === 'UNAUTHORIZED' ? -32001 : -32003,
      data: {
        code,
        httpStatus: code === 'UNAUTHORIZED' ? 401 : 403,
        applicationCode,
        details: { title: ['Check this value'] },
      },
    },
  };
}

function batchResponse(results: unknown[], status: number): Response {
  return new Response(JSON.stringify(results), { status, headers: { 'content-type': 'application/json' } });
}

describe('tRPC error handling', () => {
  it('uses the current UI language even after the client has been created', async () => {
    const fetchFn = vi.fn<typeof fetch>(async () =>
      batchResponse([{ result: { data: [] } }], 200),
    );
    const client = createAppTrpcClient({ baseUrl: 'https://example.test/api', fetchFn });
    const originalLanguage = i18n.language;
    try {
      for (const language of ['en', 'ja']) {
        await i18n.changeLanguage(language);
        await client.chat.send.mutate({ messages: [{ role: 'user', content: 'hello' }] });
        const request = fetchFn.mock.calls.at(-1)?.[1];
        expect(new Headers(request?.headers).get('Accept-Language')).toBe(language);
        expect(new Headers(request?.headers).get('Content-Type')).toBe('application/json');
      }
    } finally {
      await i18n.changeLanguage(originalLanguage);
    }
  });

  it('handles unauthorized procedures in a mixed batch once per response', async () => {
    const onUnauthorized = vi.fn();
    const fetchFn = vi.fn(async () => batchResponse([
      { result: { data: [] } }, failure('UNAUTHORIZED'), failure('UNAUTHORIZED'),
    ], 207));
    const client = createAppTrpcClient({ baseUrl: 'https://example.test/api', fetchFn, onUnauthorized });

    const results = await Promise.allSettled([
      client.billing.plans.query(), client.account.me.query(), client.videos.statusCounts.query(),
    ]);

    expect(results[0]).toEqual({ status: 'fulfilled', value: [] });
    expect(results.slice(1)).toEqual([
      expect.objectContaining({ status: 'rejected', reason: expect.any(TRPCClientError) }),
      expect.objectContaining({ status: 'rejected', reason: expect.any(TRPCClientError) }),
    ]);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(onUnauthorized).toHaveBeenCalledTimes(1);

    fetchFn.mockResolvedValueOnce(batchResponse([failure('UNAUTHORIZED')], 401));
    await expect(client.account.me.query()).rejects.toBeInstanceOf(TRPCClientError);
    expect(onUnauthorized).toHaveBeenCalledTimes(2);
  });

  it('keeps the original mutation error when the unauthorized callback fails', async () => {
    const onUnauthorized = vi.fn(async () => { throw new Error('Logout failed'); });
    const client = createAppTrpcClient({
      baseUrl: 'https://example.test/api', onUnauthorized,
      fetchFn: async () => batchResponse([failure('UNAUTHORIZED')], 401),
    });
    await expect(client.tags.create.mutate({ name: 'Lecture' })).rejects.toMatchObject({
      message: 'Request denied', data: { code: 'UNAUTHORIZED' },
    });
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it('still handles a non-tRPC HTTP 401 response', async () => {
    const onUnauthorized = vi.fn();
    const client = createAppTrpcClient({
      baseUrl: 'https://example.test/api', onUnauthorized,
      fetchFn: async () => new Response('Unauthorized', { status: 401 }),
    });
    await expect(client.account.me.query()).rejects.toBeInstanceOf(TRPCClientError);
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it('does not log out for forbidden or network errors', async () => {
    const onUnauthorized = vi.fn();
    const fetchFn = vi.fn(async () => batchResponse([failure('FORBIDDEN')], 403));
    const client = createAppTrpcClient({ baseUrl: 'https://example.test/api', onUnauthorized, fetchFn });
    await expect(client.account.me.query()).rejects.toMatchObject({ data: { code: 'FORBIDDEN' } });
    fetchFn.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(client.account.me.query()).rejects.toBeInstanceOf(TRPCClientError);
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it('recovers a course read after a transient HTML response', async () => {
    const onUnauthorized = vi.fn();
    const fetchFn = vi.fn()
      .mockResolvedValueOnce(new Response('<!DOCTYPE html>', { status: 502, headers: { 'content-type': 'text/html' } }))
      .mockResolvedValueOnce(batchResponse([{ result: { data: { id: 9, name: 'Course' } } }], 200));
    const client = createAppTrpcClient({ baseUrl: 'https://example.test/api', fetchFn, onUnauthorized });
    await expect(client.courses.get.query({ id: 9 })).resolves.toEqual({ id: 9, name: 'Course' });
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it('shows a useful error for an HTML mutation failure without replay or logout', async () => {
    const onUnauthorized = vi.fn();
    const fetchFn = vi.fn(async () => new Response('<!DOCTYPE html>', { status: 502, headers: { 'content-type': 'text/html' } }));
    const client = createAppTrpcClient({ baseUrl: 'https://example.test/api', fetchFn, onUnauthorized });
    await expect(client.tags.create.mutate({ name: 'Lecture' })).rejects.toMatchObject({
      message: i18n.t('common.messages.connectionFailed'),
    });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it('preserves native query and mutation errors and reads their application details', async () => {
    const client = createAppTrpcClient({
      baseUrl: 'https://example.test/api',
      fetchFn: async () => batchResponse([failure('FORBIDDEN', 'STORAGE_LIMIT_EXCEEDED')], 403),
    });
    const queryClient = createAppQueryClient();
    const trpc = createTRPCOptionsProxy({ client, queryClient });
    const onError = vi.fn();
    const { result, unmount } = renderHook(() => ({
      query: useQuery(trpc.account.me.queryOptions()),
      mutation: useMutation(trpc.videos.createYoutube.mutationOptions({ onError })),
    }), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      ),
    });
    try {
      await waitFor(() => expect(result.current.query.isError).toBe(true));
      let mutationError: unknown;
      await act(async () => {
        try {
          await result.current.mutation.mutateAsync({ youtubeUrl: 'https://youtu.be/example', title: 'Lecture' });
        } catch (error) { mutationError = error; }
      });
      expect(onError.mock.calls[0][0]).toBe(mutationError);
      for (const error of [result.current.query.error, mutationError]) {
        expect(error).toBeInstanceOf(TRPCClientError);
        expect(getApiError(error)).toMatchObject({
          message: 'Request denied', code: 'STORAGE_LIMIT_EXCEEDED',
          details: { title: ['Check this value'] },
        });
      }
    } finally { unmount(); queryClient.clear(); }
  });

  it('retains raw HTTP errors and leaves unrelated errors alone', () => {
    const error = new ApiError('Too large', 'FILE_TOO_LARGE', { maxMb: 200 });
    expect(getApiError(error)).toBe(error);
    expect(getApiError(new Error('Unexpected error'))).toBeUndefined();
  });

  it('preserves upload limits for translated error messages', async () => {
    const client = createAppTrpcClient({
      baseUrl: 'https://example.test/api',
      fetchFn: async () => batchResponse([{ error: {
        message: 'File size exceeds the limit of 50 MB.', code: -32013,
        data: { code: 'PAYLOAD_TOO_LARGE', httpStatus: 413,
          applicationCode: 'FILE_TOO_LARGE', params: { max_size_mb: 50 } },
      } }], 413),
    });
    try {
      await client.videos.requestUpload.mutate({ filename: 'clip.mp4', contentType: 'video/mp4', fileSize: 1024, title: 'Clip' });
      expect.unreachable('The upload should fail');
    } catch (error) {
      expect(getApiError(error)).toMatchObject({ code: 'FILE_TOO_LARGE', params: { max_size_mb: 50 } });
    }
  });
});
