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
    beforeEach(() => {
      jest.useFakeTimers()
    })

    it('should succeed on first try', async () => {
      const apiCall = jest.fn().mockResolvedValue('success')
      const result = await retryApiCall(apiCall, 3, 1000)

      expect(result).toBe('success')
      expect(apiCall).toHaveBeenCalledTimes(1)
    })

    it('should retry on failure', async () => {
      const apiCall = jest.fn()
        .mockRejectedValueOnce(new Error('Failed'))
        .mockRejectedValueOnce(new Error('Failed'))
        .mockResolvedValue('success')

      const promise = retryApiCall(apiCall, 3, 1000)

      // Advance timers for retry delays
      jest.advanceTimersByTime(2000)
      await jest.runAllTimersAsync()
      const result = await promise

      expect(result).toBe('success')
      expect(apiCall).toHaveBeenCalledTimes(3)
    }, 10000)

    it('should throw after max retries', async () => {
      const apiCall = jest.fn()
        .mockRejectedValueOnce(new Error('Failed'))
        .mockRejectedValueOnce(new Error('Failed'))
        .mockRejectedValueOnce(new Error('Failed'))

      const promise = retryApiCall(apiCall, 2, 1000)

      jest.advanceTimersByTime(5000)
      await jest.runAllTimersAsync()

      await expect(promise).rejects.toThrow('Failed')
      expect(apiCall).toHaveBeenCalledTimes(3)
    }, 10000)

    afterEach(() => {
      jest.runOnlyPendingTimers()
      jest.useRealTimers()
    })
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
    beforeEach(() => {
      jest.useFakeTimers()
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

    it('should refresh cache after TTL', async () => {
      const apiCall = jest.fn().mockResolvedValue('data')
      const cached = cachedApiCall('key', apiCall, 5000)

      await cached()
      jest.advanceTimersByTime(6000)
      await cached()

      expect(apiCall).toHaveBeenCalledTimes(2)
    })

    afterEach(() => {
      jest.runOnlyPendingTimers()
      jest.useRealTimers()
    })
  })

  describe('debouncedApiCall', () => {
    beforeEach(() => {
      jest.useFakeTimers()
    })

    it('should debounce API calls', async () => {
      const apiCall = jest.fn().mockResolvedValue('data')
      const debounced = debouncedApiCall(apiCall, 1000)

      const promise1 = debounced()
      const promise2 = debounced()
      const promise3 = debounced()

      // Wait for debounce delay
      jest.advanceTimersByTime(1000)
      
      // Wait for all promises to resolve
      await Promise.resolve()
      await jest.runAllTimersAsync()

      const results = await Promise.all([promise1, promise2, promise3])

      expect(results).toEqual(['data', 'data', 'data'])
      expect(apiCall).toHaveBeenCalledTimes(1)
    }, 15000)

    afterEach(() => {
      jest.runOnlyPendingTimers()
      jest.useRealTimers()
    })
  })
})

