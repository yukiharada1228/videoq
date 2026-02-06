import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { handleAsyncError } from '../errorHandling'

describe('handleAsyncError', () => {
  let mockSetError: ReturnType<typeof vi.fn>
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    mockSetError = vi.fn()
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleErrorSpy.mockRestore()
  })

  it('should use error message when error is an Error instance with message', () => {
    const error = new Error('Specific error message')
    const defaultMessage = 'Default message'

    handleAsyncError(error, defaultMessage, mockSetError)

    expect(mockSetError).toHaveBeenCalledWith('Specific error message')
  })

  it('should use default message when error is not an Error instance', () => {
    const error = 'string error'
    const defaultMessage = 'Default message'

    handleAsyncError(error, defaultMessage, mockSetError)

    expect(mockSetError).toHaveBeenCalledWith('Default message')
  })

  it('should use default message when error is null', () => {
    const error = null
    const defaultMessage = 'Default message'

    handleAsyncError(error, defaultMessage, mockSetError)

    expect(mockSetError).toHaveBeenCalledWith('Default message')
  })

  it('should use default message when error is undefined', () => {
    const error = undefined
    const defaultMessage = 'Default message'

    handleAsyncError(error, defaultMessage, mockSetError)

    expect(mockSetError).toHaveBeenCalledWith('Default message')
  })

  it('should use default message when Error has empty message', () => {
    const error = new Error('')
    const defaultMessage = 'Default message'

    handleAsyncError(error, defaultMessage, mockSetError)

    expect(mockSetError).toHaveBeenCalledWith('Default message')
  })

  it('should log error to console', () => {
    const error = new Error('Test error')
    const defaultMessage = 'Default message'

    handleAsyncError(error, defaultMessage, mockSetError)

    expect(consoleErrorSpy).toHaveBeenCalledWith('Default message', error)
  })

  it('should handle object as error', () => {
    const error = { code: 'ERR_001', details: 'Some details' }
    const defaultMessage = 'Default message'

    handleAsyncError(error, defaultMessage, mockSetError)

    expect(mockSetError).toHaveBeenCalledWith('Default message')
    expect(consoleErrorSpy).toHaveBeenCalledWith('Default message', error)
  })
})
