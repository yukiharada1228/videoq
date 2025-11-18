import {
  handleAsyncError,
  handleApiError,
  handleValidationErrors,
} from '../errorUtils'

// Mock i18n
jest.mock('@/i18n/config', () => ({
  initI18n: () => ({
    t: (key: string, options?: Record<string, unknown>) => {
      if (options) {
        return `${key} ${JSON.stringify(options)}`
      }
      return key
    },
  }),
}))

describe('errorUtils', () => {
  describe('handleAsyncError', () => {
    it('should handle Error object', () => {
      const onError = jest.fn()
      const error = new Error('Test error')
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation()

      handleAsyncError(error, 'Default error', onError)

      expect(consoleSpy).toHaveBeenCalledWith('Async operation failed:', 'Test error')
      expect(onError).toHaveBeenCalled()

      consoleSpy.mockRestore()
    })

    it('should handle non-Error object', () => {
      const onError = jest.fn()
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation()

      handleAsyncError('String error', 'Default error', onError)

      expect(consoleSpy).toHaveBeenCalledWith('Async operation failed:', 'Default error')
      expect(onError).toHaveBeenCalled()

      consoleSpy.mockRestore()
    })
  })

  describe('handleApiError', () => {
    it('should handle 400 error', () => {
      const response = { ok: false, status: 400 } as Response
      const result = handleApiError(response)
      expect(result).toBe('errors.badRequest')
    })

    it('should handle 401 error', () => {
      const response = { ok: false, status: 401 } as Response
      const result = handleApiError(response)
      expect(result).toBe('errors.unauthorized')
    })

    it('should handle 403 error', () => {
      const response = { ok: false, status: 403 } as Response
      const result = handleApiError(response)
      expect(result).toBe('errors.forbidden')
    })

    it('should handle 404 error', () => {
      const response = { ok: false, status: 404 } as Response
      const result = handleApiError(response)
      expect(result).toBe('errors.notFound')
    })

    it('should handle 500 error', () => {
      const response = { ok: false, status: 500 } as Response
      const result = handleApiError(response)
      expect(result).toBe('errors.server')
    })

    it('should handle unknown status code', () => {
      const response = { ok: false, status: 418 } as Response
      const result = handleApiError(response)
      expect(result).toBe('errors.generic {"status":418}')
    })

    it('should return null for successful response', () => {
      const response = { ok: true, status: 200 } as Response
      const result = handleApiError(response)
      expect(result).toBeNull()
    })
  })

  describe('handleValidationErrors', () => {
    it('should return empty string for empty array', () => {
      expect(handleValidationErrors([])).toBe('')
    })

    it('should return single error', () => {
      expect(handleValidationErrors(['Error 1'])).toBe('Error 1')
    })

    it('should return formatted multiple errors', () => {
      const result = handleValidationErrors(['Error 1', 'Error 2'])
      expect(result).toContain('Error 1')
      expect(result).toContain('Error 2')
    })
  })
})

