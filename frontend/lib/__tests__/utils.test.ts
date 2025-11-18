import {
  cn,
  formatString,
  formatDate,
  formatFileSize,
  formatDuration,
  formatNumber,
  formatPercentage,
  truncateString,
  sanitizeString,
  shuffleArray,
  chunkArray,
  deepClone,
  debounce,
  throttle,
} from '../utils'

describe('utils', () => {
  describe('cn', () => {
    it('should merge class names', () => {
      expect(cn('foo', 'bar')).toBe('foo bar')
    })

    it('should handle conditional classes', () => {
      expect(cn('foo', false && 'bar', 'baz')).toBe('foo baz')
    })
  })

  describe('formatString', () => {
    it('should format string with values', () => {
      expect(formatString('Hello {name}', { name: 'World' })).toBe('Hello World')
    })

    it('should handle multiple placeholders', () => {
      expect(formatString('{greeting} {name}', { greeting: 'Hello', name: 'World' })).toBe('Hello World')
    })

    it('should keep placeholder if value is undefined', () => {
      expect(formatString('Hello {name}', {})).toBe('Hello {name}')
    })
  })

  describe('formatDate', () => {
    it('should format date with default format', () => {
      const date = new Date('2024-01-15T10:30:00')
      expect(formatDate(date)).toMatch(/2024-01-15/)
    })

    it('should format date with custom format', () => {
      const date = new Date('2024-01-15T10:30:45')
      const result = formatDate(date, 'YYYY-MM-DD HH:mm:ss')
      expect(result).toMatch(/2024-01-15 10:30:45/)
    })

    it('should handle string date', () => {
      expect(formatDate('2024-01-15')).toMatch(/2024-01-15/)
    })
  })

  describe('formatFileSize', () => {
    it('should format bytes', () => {
      expect(formatFileSize(0)).toBe('0 Bytes')
      expect(formatFileSize(1024)).toBe('1 KB')
      expect(formatFileSize(1024 * 1024)).toBe('1 MB')
      expect(formatFileSize(1024 * 1024 * 1024)).toBe('1 GB')
    })

    it('should format with decimals', () => {
      expect(formatFileSize(1536)).toBe('1.5 KB')
    })
  })

  describe('formatDuration', () => {
    it('should format seconds without hours', () => {
      expect(formatDuration(65)).toBe('1:05')
      expect(formatDuration(125)).toBe('2:05')
    })

    it('should format seconds with hours', () => {
      expect(formatDuration(3665)).toBe('1:01:05')
    })
  })

  describe('formatNumber', () => {
    it('should format number with default decimals', () => {
      expect(formatNumber(1000)).toBe('1,000')
    })

    it('should format number with custom decimals', () => {
      expect(formatNumber(1000.123, 2)).toBe('1,000.12')
    })
  })

  describe('formatPercentage', () => {
    it('should format percentage', () => {
      expect(formatPercentage(50, 100)).toBe('50.0%')
      expect(formatPercentage(25, 100, 2)).toBe('25.00%')
    })

    it('should handle zero total', () => {
      expect(formatPercentage(50, 0)).toBe('0%')
    })
  })

  describe('truncateString', () => {
    it('should truncate long string', () => {
      expect(truncateString('Hello World', 5)).toBe('He...')
    })

    it('should not truncate short string', () => {
      expect(truncateString('Hello', 10)).toBe('Hello')
    })

    it('should use custom suffix', () => {
      expect(truncateString('Hello World', 5, '...')).toBe('He...')
    })
  })

  describe('sanitizeString', () => {
    it('should remove HTML tags', () => {
      expect(sanitizeString('<script>alert("xss")</script>')).toBe('scriptalert(xss)/script')
    })

    it('should remove quotes', () => {
      expect(sanitizeString('Hello "World"')).toBe('Hello World')
    })

    it('should trim whitespace', () => {
      expect(sanitizeString('  Hello  ')).toBe('Hello')
    })
  })

  describe('shuffleArray', () => {
    it('should shuffle array', () => {
      const array = [1, 2, 3, 4, 5]
      const shuffled = shuffleArray(array)
      expect(shuffled).toHaveLength(5)
      expect(shuffled.sort()).toEqual([1, 2, 3, 4, 5])
    })

    it('should not mutate original array', () => {
      const array = [1, 2, 3]
      shuffleArray(array)
      expect(array).toEqual([1, 2, 3])
    })
  })

  describe('chunkArray', () => {
    it('should chunk array', () => {
      expect(chunkArray([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
    })

    it('should handle empty array', () => {
      expect(chunkArray([], 2)).toEqual([])
    })
  })

  describe('deepClone', () => {
    it('should clone object', () => {
      const obj = { a: 1, b: { c: 2 } }
      const cloned = deepClone(obj)
      expect(cloned).toEqual(obj)
      expect(cloned).not.toBe(obj)
      expect(cloned.b).not.toBe(obj.b)
    })

    it('should clone array', () => {
      const arr = [1, 2, { a: 3 }]
      const cloned = deepClone(arr)
      expect(cloned).toEqual(arr)
      expect(cloned).not.toBe(arr)
    })

    it('should clone Date', () => {
      const date = new Date('2024-01-15')
      const cloned = deepClone(date)
      expect(cloned).toEqual(date)
      expect(cloned).not.toBe(date)
    })

    it('should return primitive values as-is', () => {
      expect(deepClone(42)).toBe(42)
      expect(deepClone('hello')).toBe('hello')
      expect(deepClone(null)).toBe(null)
    })
  })

  describe('debounce', () => {
    jest.useFakeTimers()

    it('should debounce function calls', () => {
      const func = jest.fn()
      const debounced = debounce(func, 100)

      debounced()
      debounced()
      debounced()

      expect(func).not.toHaveBeenCalled()

      jest.advanceTimersByTime(100)

      expect(func).toHaveBeenCalledTimes(1)
    })

    afterEach(() => {
      jest.runOnlyPendingTimers()
      jest.useRealTimers()
    })
  })

  describe('throttle', () => {
    beforeEach(() => {
      jest.useFakeTimers()
    })

    it('should throttle function calls', () => {
      const func = jest.fn()
      const throttled = throttle(func, 100)

      throttled()
      throttled()
      throttled()

      expect(func).toHaveBeenCalledTimes(1)

      jest.advanceTimersByTime(100)
      throttled()

      expect(func).toHaveBeenCalledTimes(2)
    })

    afterEach(() => {
      jest.runOnlyPendingTimers()
      jest.useRealTimers()
    })
  })
})

