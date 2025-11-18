import {
  memoize,
  lazyLoad,
  batchProcess,
  parallelProcess,
  withCache,
  withRetry,
  withDebounce,
  withThrottle,
  withPerformanceMeasurement,
  withAsyncPerformanceMeasurement,
} from '../performanceUtils'

describe('performanceUtils', () => {
  describe('memoize', () => {
    it('should memoize function results', () => {
      const fn = jest.fn((x: number) => x * 2)
      const memoized = memoize(fn as (...args: unknown[]) => unknown)

      const result1 = memoized(5)
      const result2 = memoized(5)

      expect(result1).toBe(10)
      expect(result2).toBe(10)
      expect(fn).toHaveBeenCalledTimes(1)
    })

    it('should use custom key selector', () => {
      const fn = jest.fn((a: number, b: number) => a + b)
      const keySelector = (a: number, b: number) => `${a}-${b}`
      const memoized = memoize(fn as (...args: unknown[]) => unknown, keySelector as (...args: unknown[]) => string)

      const result1 = memoized(1, 2)
      const result2 = memoized(1, 2)

      expect(result1).toBe(3)
      expect(result2).toBe(3)
      expect(fn).toHaveBeenCalledTimes(1)
    })

    it('should handle different arguments', () => {
      const fn = jest.fn((x: number) => x * 2)
      const memoized = memoize(fn as (...args: unknown[]) => unknown)

      memoized(5)
      memoized(10)

      expect(fn).toHaveBeenCalledTimes(2)
    })
  })

  describe('lazyLoad', () => {
    it('should load data only once', async () => {
      const loader = jest.fn().mockResolvedValue('data')
      const cache = new Map()
      const lazy = lazyLoad(loader, cache)

      const result1 = await lazy()
      const result2 = await lazy()

      expect(result1).toBe('data')
      expect(result2).toBe('data')
      expect(loader).toHaveBeenCalledTimes(1)
      expect(cache.get('data')).toBe('data')
    })

    it('should load data when cache is empty', async () => {
      const loader = jest.fn().mockResolvedValue('data')
      const cache = new Map()
      const lazy = lazyLoad(loader, cache)

      const result = await lazy()

      expect(result).toBe('data')
      expect(loader).toHaveBeenCalledTimes(1)
    })
  })

  describe('batchProcess', () => {
    it('should process items in batches', async () => {
      const items = [1, 2, 3, 4, 5]
      const processor = jest.fn().mockImplementation((batch: number[]) =>
        Promise.resolve(batch.map(x => x * 2))
      )

      const results = await batchProcess(items, processor, 2)

      expect(results).toEqual([2, 4, 6, 8, 10])
      expect(processor).toHaveBeenCalledTimes(3)
    })

    it('should handle empty array', async () => {
      const processor = jest.fn().mockResolvedValue([])
      const results = await batchProcess([], processor, 2)

      expect(results).toEqual([])
      expect(processor).not.toHaveBeenCalled()
    })
  })

  describe('parallelProcess', () => {
    it('should process items in parallel batches', async () => {
      const items = [1, 2, 3, 4, 5]
      const processor = jest.fn().mockImplementation((item: number) =>
        Promise.resolve(item * 2)
      )

      const results = await parallelProcess(items, processor, 2)

      expect(results).toEqual([2, 4, 6, 8, 10])
      expect(processor).toHaveBeenCalledTimes(5)
    })

    it('should handle empty array', async () => {
      const processor = jest.fn().mockResolvedValue(0)
      const results = await parallelProcess([], processor, 2)

      expect(results).toEqual([])
      expect(processor).not.toHaveBeenCalled()
    })
  })

  describe('withCache', () => {
    beforeEach(() => {
      jest.useFakeTimers()
    })

    it('should cache function results', () => {
      const fn = jest.fn((x: number) => x * 2)
      const cached = withCache(fn as (...args: unknown[]) => unknown, 5000)

      const result1 = cached(5)
      const result2 = cached(5)

      expect(result1).toBe(10)
      expect(result2).toBe(10)
      expect(fn).toHaveBeenCalledTimes(1)
    })

    it('should refresh cache after TTL', () => {
      const fn = jest.fn((x: number) => x * 2)
      const cached = withCache(fn as (...args: unknown[]) => unknown, 5000)

      cached(5)
      jest.advanceTimersByTime(6000)
      cached(5)

      expect(fn).toHaveBeenCalledTimes(2)
    })

    afterEach(() => {
      jest.runOnlyPendingTimers()
      jest.useRealTimers()
    })
  })

  describe('withRetry', () => {
    beforeEach(() => {
      jest.useFakeTimers()
    })

    it('should succeed on first try', async () => {
      const fn = jest.fn().mockResolvedValue('success')
      const retried = withRetry(fn as (...args: unknown[]) => Promise<unknown>, 3, 1000)

      const result = await retried()

      expect(result).toBe('success')
      expect(fn).toHaveBeenCalledTimes(1)
    })

    it('should retry on failure', async () => {
      const fn = jest.fn()
        .mockRejectedValueOnce(new Error('Failed'))
        .mockRejectedValueOnce(new Error('Failed'))
        .mockResolvedValue('success')

      const retried = withRetry(fn as (...args: unknown[]) => Promise<unknown>, 3, 1000)
      const promise = retried()

      jest.advanceTimersByTime(3000)
      await jest.runAllTimersAsync()
      const result = await promise

      expect(result).toBe('success')
      expect(fn).toHaveBeenCalledTimes(3)
    }, 10000)

    afterEach(() => {
      jest.runOnlyPendingTimers()
      jest.useRealTimers()
    })
  })

  describe('withDebounce', () => {
    beforeEach(() => {
      jest.useFakeTimers()
    })

    it('should debounce function calls', () => {
      const fn = jest.fn()
      const debounced = withDebounce(fn as (...args: unknown[]) => unknown, 1000)

      debounced()
      debounced()
      debounced()

      expect(fn).not.toHaveBeenCalled()

      jest.advanceTimersByTime(1000)

      expect(fn).toHaveBeenCalledTimes(1)
    })

    afterEach(() => {
      jest.runOnlyPendingTimers()
      jest.useRealTimers()
    })
  })

  describe('withThrottle', () => {
    beforeEach(() => {
      jest.useFakeTimers()
    })

    it('should throttle function calls', () => {
      const fn = jest.fn()
      const throttled = withThrottle(fn as (...args: unknown[]) => unknown, 1000)

      throttled()
      throttled()
      throttled()

      expect(fn).toHaveBeenCalledTimes(1)

      jest.advanceTimersByTime(1000)
      throttled()

      expect(fn).toHaveBeenCalledTimes(2)
    })

    afterEach(() => {
      jest.runOnlyPendingTimers()
      jest.useRealTimers()
    })
  })

  describe('withPerformanceMeasurement', () => {
    it('should measure function performance', () => {
      const fn = jest.fn(() => 'result')
      const measured = withPerformanceMeasurement(fn as (...args: unknown[]) => unknown, 'test')

      const result = measured()

      expect(result).toBe('result')
      expect(fn).toHaveBeenCalled()
    })
  })

  describe('withAsyncPerformanceMeasurement', () => {
    it('should measure async function performance', async () => {
      const fn = jest.fn().mockResolvedValue('result')
      const measured = withAsyncPerformanceMeasurement(fn as (...args: unknown[]) => Promise<unknown>, 'test')

      const result = await measured()

      expect(result).toBe('result')
      expect(fn).toHaveBeenCalled()
    })
  })
})

