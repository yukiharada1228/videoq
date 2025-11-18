import {
  getStatusBadgeClassName,
  getStatusLabel,
  formatDate,
  timeStringToSeconds,
} from '../video'

// Mock i18n
jest.mock('@/i18n/config', () => ({
  initI18n: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      if (options) {
        return `${key} ${JSON.stringify(options)}`
      }
      return key === key ? 'Status Label' : key
    },
    language: 'en',
    changeLanguage: jest.fn(),
  }),
}))

describe('video utils', () => {
  describe('getStatusBadgeClassName', () => {
    it('should return correct class for pending status', () => {
      const className = getStatusBadgeClassName('pending')
      expect(className).toContain('bg-yellow-100')
      expect(className).toContain('text-yellow-800')
    })

    it('should return correct class for processing status', () => {
      const className = getStatusBadgeClassName('processing')
      expect(className).toContain('bg-blue-100')
      expect(className).toContain('text-blue-800')
    })

    it('should return correct class for completed status', () => {
      const className = getStatusBadgeClassName('completed')
      expect(className).toContain('bg-green-100')
      expect(className).toContain('text-green-800')
    })

    it('should return correct class for error status', () => {
      const className = getStatusBadgeClassName('error')
      expect(className).toContain('bg-red-100')
      expect(className).toContain('text-red-800')
    })

    it('should return default class for unknown status', () => {
      const className = getStatusBadgeClassName('unknown')
      expect(className).toContain('bg-gray-100')
      expect(className).toContain('text-gray-800')
    })

    it('should handle size variants', () => {
      const xs = getStatusBadgeClassName('pending', 'xs')
      const sm = getStatusBadgeClassName('pending', 'sm')
      const md = getStatusBadgeClassName('pending', 'md')

      expect(xs).toContain('text-[10px]')
      expect(sm).toContain('text-xs')
      expect(md).toContain('text-sm')
    })
  })

  describe('getStatusLabel', () => {
    it('should return status label', () => {
      const label = getStatusLabel('pending')
      expect(label).toBeDefined()
    })
  })

  describe('formatDate', () => {
    beforeEach(() => {
      // Mock navigator.language
      Object.defineProperty(navigator, 'language', {
        writable: true,
        value: 'en-US',
      })
    })

    it('should format date in short format', () => {
      const date = new Date('2024-01-15T10:30:00')
      const result = formatDate(date, 'short')
      expect(result).toMatch(/01\/15\/2024|2024\/01\/15/)
    })

    it('should format date in full format', () => {
      const date = new Date('2024-01-15T10:30:00')
      const result = formatDate(date, 'full')
      expect(result).toContain('2024')
    })

    it('should handle string date', () => {
      const result = formatDate('2024-01-15T10:30:00', 'short')
      expect(result).toBeDefined()
    })

    it('should use custom locale', () => {
      const date = new Date('2024-01-15T10:30:00')
      const result = formatDate(date, 'short', 'ja-JP')
      expect(result).toBeDefined()
    })
  })

  describe('timeStringToSeconds', () => {
    it('should convert HH:MM:SS format', () => {
      expect(timeStringToSeconds('01:30:45')).toBe(5445)
      expect(timeStringToSeconds('00:05:30')).toBe(330)
    })

    it('should convert MM:SS format', () => {
      expect(timeStringToSeconds('05:30')).toBe(330)
      expect(timeStringToSeconds('01:05')).toBe(65)
    })

    it('should convert SS format', () => {
      expect(timeStringToSeconds('45')).toBe(45)
      expect(timeStringToSeconds('0')).toBe(0)
    })

    it('should handle milliseconds', () => {
      expect(timeStringToSeconds('01:30:45,123')).toBe(5445)
      expect(timeStringToSeconds('01:30:45.123')).toBe(5445)
    })

    it('should handle empty string', () => {
      expect(timeStringToSeconds('')).toBe(0)
    })

    it('should handle invalid format', () => {
      expect(timeStringToSeconds('invalid')).toBe(0)
      expect(timeStringToSeconds('::')).toBe(0)
      expect(timeStringToSeconds('abc:def')).toBe(0)
    })
  })
})

