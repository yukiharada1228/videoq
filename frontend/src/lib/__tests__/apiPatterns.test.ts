import { describe, it, expect, vi, afterEach } from 'vitest';
import {
    parallelApiCalls,
    conditionalApiCall,
    retryApiCall,
    batchApiCall,
    cachedApiCall,
    debouncedApiCall,
} from '../apiPatterns';

describe('apiPatterns', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        vi.useRealTimers();
    });

    describe('parallelApiCalls', () => {
        it('should execute API calls in parallel and return results', async () => {
            const call1 = vi.fn().mockResolvedValue(1);
            const call2 = vi.fn().mockResolvedValue(2);
            const results = await parallelApiCalls([call1, call2]);
            expect(results).toEqual([1, 2]);
            expect(call1).toHaveBeenCalled();
            expect(call2).toHaveBeenCalled();
        });

        it('should handle errors by returning null for failed calls', async () => {
            const call1 = vi.fn().mockResolvedValue(1);
            const call2 = vi.fn().mockRejectedValue(new Error('Failed'));
            const results = await parallelApiCalls([call1, call2]);
            expect(results).toEqual([1, null]);
        });
    });

    describe('conditionalApiCall', () => {
        it('should execute API call if condition is true', async () => {
            const apiCall = vi.fn().mockResolvedValue('success');
            const result = await conditionalApiCall(true, apiCall, 'fallback');
            expect(result).toBe('success');
            expect(apiCall).toHaveBeenCalled();
        });

        it('should return fallback if condition is false', async () => {
            const apiCall = vi.fn();
            const result = await conditionalApiCall(false, apiCall, 'fallback');
            expect(result).toBe('fallback');
            expect(apiCall).not.toHaveBeenCalled();
        });

        it('should return fallback if API call fails', async () => {
            const apiCall = vi.fn().mockRejectedValue(new Error('Failed'));
            const result = await conditionalApiCall(true, apiCall, 'fallback');
            expect(result).toBe('fallback');
        });
    });

    describe('retryApiCall', () => {
        it('should return result if successful on first try', async () => {
            const apiCall = vi.fn().mockResolvedValue('success');
            const result = await retryApiCall(apiCall);
            expect(result).toBe('success');
            expect(apiCall).toHaveBeenCalledTimes(1);
        });

        it('should retry if API call fails', async () => {
            const apiCall = vi.fn()
                .mockRejectedValueOnce(new Error('Fail 1'))
                .mockRejectedValueOnce(new Error('Fail 2'))
                .mockResolvedValue('success');

            const result = await retryApiCall(apiCall, 3, 10);
            expect(result).toBe('success');
            expect(apiCall).toHaveBeenCalledTimes(3);
        });

        it('should throw error if max retries reached', async () => {
            const apiCall = vi.fn().mockRejectedValue(new Error('Always fail'));
            await expect(retryApiCall(apiCall, 2, 10)).rejects.toThrow('Always fail');
            expect(apiCall).toHaveBeenCalledTimes(3); // Initial + 2 retries
        });

        it('should handle non-Error objects thrown', async () => {
            const apiCall = vi.fn().mockRejectedValue('String error');
            await expect(retryApiCall(apiCall, 1, 10)).rejects.toThrow('String error');
        });
    });

    describe('batchApiCall', () => {
        it('should process items in batches', async () => {
            const items = [1, 2, 3, 4, 5];
            const batchSize = 2;
            const apiCall = vi.fn().mockImplementation(async (batch) => batch.map((x: number) => x * 2));

            const results = await batchApiCall(items, batchSize, apiCall);

            expect(results).toEqual([2, 4, 6, 8, 10]);
            expect(apiCall).toHaveBeenCalledTimes(3); // [1,2], [3,4], [5]
            expect(apiCall).toHaveBeenNthCalledWith(1, [1, 2]);
            expect(apiCall).toHaveBeenNthCalledWith(2, [3, 4]);
            expect(apiCall).toHaveBeenNthCalledWith(3, [5]);
        });
    });

    describe('cachedApiCall', () => {
        it('should return cached value if within TTL', async () => {
            const apiCall = vi.fn().mockResolvedValue('data');
            const cachedCall = cachedApiCall('key', apiCall, 1000);

            // First call
            const result1 = await cachedCall();
            expect(result1).toBe('data');
            expect(apiCall).toHaveBeenCalledTimes(1);

            // Second call (should be cached)
            const result2 = await cachedCall();
            expect(result2).toBe('data');
            expect(apiCall).toHaveBeenCalledTimes(1);
        });

        it('should make new call if cache expired', async () => {
            vi.useFakeTimers();
            const apiCall = vi.fn().mockResolvedValue('data');
            const cachedCall = cachedApiCall('key', apiCall, 1000);

            // First call
            await cachedCall();

            // Advance time beyond TTL
            vi.advanceTimersByTime(1100);

            // Second call (should fetch again)
            await cachedCall();
            expect(apiCall).toHaveBeenCalledTimes(2);
        });
    });

    describe('debouncedApiCall', () => {
        it('should debounce calls', async () => {
            vi.useFakeTimers();
            const apiCall = vi.fn().mockResolvedValue('success');
            const debounced = debouncedApiCall(apiCall, 500);

            const p1 = debounced();
            const p2 = debounced();
            const p3 = debounced();

            vi.advanceTimersByTime(500);

            const validResults = await Promise.all([p1, p2, p3]);
            expect(validResults).toEqual(['success', 'success', 'success']);
            expect(apiCall).toHaveBeenCalledTimes(1);
        });

        it('should handle errors in debounced calls', async () => {
            vi.useFakeTimers();
            const apiCall = vi.fn().mockRejectedValue(new Error('Failed'));
            const debounced = debouncedApiCall(apiCall, 500);

            const p1 = debounced();
            const p2 = debounced();

            vi.advanceTimersByTime(500);

            await expect(p1).rejects.toThrow('Failed');
            await expect(p2).rejects.toThrow('Failed');
            expect(apiCall).toHaveBeenCalledTimes(1);
        });
    });
});
