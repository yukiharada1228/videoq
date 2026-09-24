import { act, renderHook, waitFor } from '@testing-library/react';
import { onlineManager, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { useVerifyEmailQuery } from '../useVerifyEmailData';

vi.mock('@/lib/api', () => ({ apiClient: { verifyEmail: vi.fn() } }));

describe('email verification requests', () => {
  afterEach(() => onlineManager.setOnline(true));

  it('reuses a successful verification across reconnects and remounts', async () => {
    const verify = vi.mocked(apiClient.verifyEmail).mockResolvedValue({ detail: 'Verified' });
    const reconnectProbe = vi.fn(async () => 'connected');
    const { result: probe } = renderHook(() => {
      const client = useQueryClient();
      useQuery({ queryKey: ['reconnectProbe'], queryFn: reconnectProbe });
      return client;
    });
    const first = renderHook(() => useVerifyEmailQuery({ token: 'one-time-token' }));
    await waitFor(() => expect(first.result.current.verifyQuery.isSuccess).toBe(true));

    act(() => onlineManager.setOnline(false));
    await act(async () => onlineManager.setOnline(true));
    await waitFor(() => expect(reconnectProbe).toHaveBeenCalledTimes(2));
    expect(verify).toHaveBeenCalledTimes(1);

    first.unmount();
    const remounted = renderHook(({ token }) => useVerifyEmailQuery({ token }), {
      initialProps: { token: 'one-time-token' },
    });
    await waitFor(() => expect(probe.current.isFetching()).toBe(0));
    expect(remounted.result.current.verifyQuery.data?.detail).toBe('Verified');
    expect(verify).toHaveBeenCalledTimes(1);

    remounted.rerender({ token: 'different-token' });
    await waitFor(() => expect(verify).toHaveBeenCalledTimes(2));
    expect(verify).toHaveBeenLastCalledWith({ token: 'different-token' });
  });
});
