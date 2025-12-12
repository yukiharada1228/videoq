import {
  parallelApiCalls,
  conditionalApiCall,
  retryApiCall,
  batchApiCall,
  cachedApiCall,
  debouncedApiCall,
} from '../apiPatterns'

describe('apiPatterns', () => {
  describe('parallelApiCalls', () => {
    it('should execute API calls in parallel', async () => {
      const calls = [
        jest.fn().mockResolvedValue(1),
        jest.fn().mockResolvedValue(2),
        jest.fn().mockResolvedValue(3),
      ]

      const results = await parallelApiCalls(calls)

      expect(results).toEqual([1, 2, 3])
      calls.forEach(call => expect(call).toHaveBeenCalled())
    })

    it('should handle errors in parallel calls', async () => {
      const calls = [
        jest.fn().mockResolvedValue(1),
        jest.fn().mockRejectedValue(new Error('Failed')),
        jest.fn().mockResolvedValue(3),
      ]

      const results = await parallelApiCalls(calls)

      expect(results).toEqual([1, null, 3])
    })
  })

  describe('conditionalApiCall', () => {
    it('should call API when condition is true', async () => {
      const apiCall = jest.fn().mockResolvedValue('result')
      const result = await conditionalApiCall(true, apiCall, 'fallback')

      expect(result).toBe('result')
      expect(apiCall).toHaveBeenCalled()
    })

    it('should return fallback when condition is false', async () => {
      const apiCall = jest.fn().mockResolvedValue('result')
      const result = await conditionalApiCall(false, apiCall, 'fallback')

      expect(result).toBe('fallback')
      expect(apiCall).not.toHaveBeenCalled()
    })

    it('should return fallback on error', async () => {
      const apiCall = jest.fn().mockRejectedValue(new Error('Failed'))
      const result = await conditionalApiCall(true, apiCall, 'fallback')

      expect(result).toBe('fallback')
    })
  })

  describe('retryApiCall', () => {
    // 各テストで完全にクリーンな状態にする
    beforeAll(() => {
      jest.useRealTimers()
    })

    afterAll(() => {
      jest.useRealTimers()
    })

    beforeEach(() => {
      jest.clearAllMocks()
      jest.clearAllTimers()
    })

    afterEach(() => {
      jest.clearAllMocks()
      jest.clearAllTimers()
      jest.useRealTimers()
    })

    it('should succeed on first try', async () => {
      const apiCall = jest.fn().mockResolvedValue('success')
      const result = await retryApiCall(apiCall, 3, 1000)

      expect(result).toBe('success')
      expect(apiCall).toHaveBeenCalledTimes(1)
    })

    it('should work with default maxRetries/delay', async () => {
      jest.useFakeTimers()

      const apiCall = jest.fn()
        .mockRejectedValueOnce(new Error('Failed'))
        .mockRejectedValueOnce(new Error('Failed'))
        .mockResolvedValue('success')

      const promise = retryApiCall(apiCall)
      await jest.runAllTimersAsync()
      const result = await promise

      expect(result).toBe('success')
      expect(apiCall).toHaveBeenCalledTimes(3)

      jest.useRealTimers()
    }, 10000)

    it('should retry on failure then succeed', async () => {
      jest.useFakeTimers()
      
      const apiCall = jest.fn()
        .mockRejectedValueOnce(new Error('Failed'))
        .mockRejectedValueOnce(new Error('Failed'))
        .mockResolvedValue('success')

      const promise = retryApiCall(apiCall, 3, 1000)
      await jest.runAllTimersAsync()
      const result = await promise

      expect(result).toBe('success')
      expect(apiCall).toHaveBeenCalledTimes(3)
      
      jest.useRealTimers()
    }, 10000)

    it('should use exponential backoff for retries', async () => {
      jest.useFakeTimers()
      
      const delays: number[] = []
      let lastCallTime: number | null = null
      
      const apiCall = jest.fn().mockImplementation(() => {
        const now = Date.now()
        if (lastCallTime !== null) {
          delays.push(now - lastCallTime)
        }
        lastCallTime = now
        
        if (apiCall.mock.calls.length < 3) {
          return Promise.reject(new Error('Failed'))
        }
        return Promise.resolve('success')
      })
      
      const promise = retryApiCall(apiCall, 3, 1000)
      await jest.runAllTimersAsync()
      const result = await promise
      
      expect(result).toBe('success')
      expect(apiCall).toHaveBeenCalledTimes(3)
      
      // 指数バックオフの確認: 1000ms, 2000ms
      expect(delays).toHaveLength(2)
      expect(delays[0]).toBe(1000)  // 1回目のリトライは1000ms後
      expect(delays[1]).toBe(2000)  // 2回目のリトライは2000ms後（指数バックオフ）
      
      jest.useRealTimers()
    }, 10000)

    it('should throw after max retries', async () => {
      // Real timersを使用し、短いdelayで実行
      // テストの目的は「maxRetries回リトライした後に失敗する」ことの確認
      const apiCall = jest.fn().mockRejectedValue(new Error('Failed'))

      await expect(retryApiCall(apiCall, 2, 10)).rejects.toThrow('Failed')
      expect(apiCall).toHaveBeenCalledTimes(3) // 初回 + 2回のリトライ
    })

    it('should wrap and throw non-Error exceptions while preserving the message', async () => {
      // This test verifies that if a non-Error value (e.g., a string) is thrown
      // during an API call, it is properly wrapped in an Error object,
      // and its original message is preserved.
      const apiCall = jest.fn().mockImplementation(() => {
        throw 'string error';
      });

      // Call with 0 retries to test the immediate catch-and-throw logic.
      // The assertion now specifically checks for the preserved error message.
      await expect(retryApiCall(apiCall, 0, 10)).rejects.toThrow('string error');
      
      // Ensure the API was called exactly once.
      expect(apiCall).toHaveBeenCalledTimes(1);
    });
  })

  describe('batchApiCall', () => {
    it('should process items in batches', async () => {
      const items = [1, 2, 3, 4, 5]
      const apiCall = jest.fn().mockImplementation((batch: number[]) => 
        Promise.resolve(batch.map(x => x * 2))
      )

      const results = await batchApiCall(items, 2, apiCall)

      expect(results).toEqual([2, 4, 6, 8, 10])
      expect(apiCall).toHaveBeenCalledTimes(3)
    })

    it('should handle empty array', async () => {
      const apiCall = jest.fn().mockResolvedValue([])
      const results = await batchApiCall([], 2, apiCall)

      expect(results).toEqual([])
      expect(apiCall).not.toHaveBeenCalled()
    })
  })

  describe('cachedApiCall', () => {
    beforeAll(() => {
      jest.useRealTimers()
    })

    afterAll(() => {
      jest.useRealTimers()
    })

    beforeEach(() => {
      jest.clearAllMocks()
      jest.clearAllTimers()
    })

    afterEach(() => {
      jest.clearAllMocks()
      jest.clearAllTimers()
      jest.useRealTimers()
    })

    it('should cache API call result', async () => {
      const apiCall = jest.fn().mockResolvedValue('data')
      const cached = cachedApiCall('key', apiCall, 5000)

      const result1 = await cached()
      const result2 = await cached()

      expect(result1).toBe('data')
      expect(result2).toBe('data')
      expect(apiCall).toHaveBeenCalledTimes(1)
    })

    it('should cache API call result with default TTL', async () => {
      const apiCall = jest.fn().mockResolvedValue('data')
      const cached = cachedApiCall('key-default-ttl', apiCall)

      const result1 = await cached()
      const result2 = await cached()

      expect(result1).toBe('data')
      expect(result2).toBe('data')
      expect(apiCall).toHaveBeenCalledTimes(1)
    })

    it('should refresh cache after TTL', async () => {
      jest.useFakeTimers()
      
      const apiCall = jest.fn().mockResolvedValue('data')
      const cached = cachedApiCall('key2', apiCall, 5000)

      await cached()
      jest.advanceTimersByTime(6000)
      await cached()

      expect(apiCall).toHaveBeenCalledTimes(2)
      
      jest.useRealTimers()
    })
  })

  describe('debouncedApiCall', () => {
    beforeAll(() => {
      jest.useRealTimers()
    })

    afterAll(() => {
      jest.useRealTimers()
    })

    beforeEach(() => {
      jest.clearAllMocks()
      jest.clearAllTimers()
    })

    afterEach(() => {
      jest.clearAllMocks()
      jest.clearAllTimers()
      jest.useRealTimers()
    })

    it('should debounce API calls', async () => {
      jest.useFakeTimers()
      
      const apiCall = jest.fn().mockResolvedValue('data')
      const debounced = debouncedApiCall(apiCall, 1000)

      const promise1 = debounced()
      const promise2 = debounced()
      const promise3 = debounced()

      await jest.runAllTimersAsync()
      const results = await Promise.all([promise1, promise2, promise3])

      expect(results).toEqual(['data', 'data', 'data'])
      expect(apiCall).toHaveBeenCalledTimes(1)
      
      jest.useRealTimers()
    }, 15000)

    it('should reuse pending promise between debounce windows', async () => {
      jest.useFakeTimers()

      // Assigned when the debounced timer triggers and apiCall runs.
      let resolveFn!: (value: string | PromiseLike<string>) => void
      const apiCall = jest.fn(() => new Promise<string>((resolve) => {
        resolveFn = resolve
      }))

      const debounced = debouncedApiCall(apiCall, 1000)

      const promise1 = debounced()
      jest.advanceTimersByTime(1000)
      expect(apiCall).toHaveBeenCalledTimes(1)

      const promise2 = debounced()
      jest.advanceTimersByTime(1000)
      expect(apiCall).toHaveBeenCalledTimes(1)

      resolveFn('data')

      await expect(Promise.all([promise1, promise2])).resolves.toEqual(['data', 'data'])

      jest.useRealTimers()
    }, 15000)

    it('should reject all pending promises on error', async () => {
      jest.useFakeTimers()
      
      let callCount = 0
      const apiCall = jest.fn(async () => {
        callCount++
        return Promise.reject(new Error('API failed'))
      })
      const debounced = debouncedApiCall(apiCall, 1000)

      const promise1 = debounced()
      const promise2 = debounced()
      const promise3 = debounced()

      // Run timers to trigger the debounced call
      const timerPromise = jest.runAllTimersAsync()
      
      // Wait for promises to settle
      const results = await Promise.allSettled([promise1, promise2, promise3, timerPromise])
      
      // All promises should reject with the same error
      expect(results[0].status).toBe('rejected')
      expect(results[1].status).toBe('rejected')
      expect(results[2].status).toBe('rejected')
      if (results[0].status === 'rejected') {
        expect(results[0].reason).toBeInstanceOf(Error)
        expect((results[0].reason as Error).message).toBe('API failed')
      }
      
      // API should only be called once
      expect(callCount).toBe(1)
      
      jest.useRealTimers()
    }, 15000)
  })
})