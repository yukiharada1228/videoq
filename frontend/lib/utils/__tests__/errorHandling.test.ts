import { handleAsyncError } from '../errorHandling'

describe('errorHandling', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should handle Error object', () => {
    const setError = jest.fn()
    const error = new Error('Test error')
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation()

    handleAsyncError(error, 'Default error', setError)

    expect(setError).toHaveBeenCalledWith('Test error')
    expect(consoleSpy).toHaveBeenCalledWith('Default error', error)

    consoleSpy.mockRestore()
  })

  it('should handle non-Error object', () => {
    const setError = jest.fn()
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation()

    handleAsyncError('String error', 'Default error', setError)

    expect(setError).toHaveBeenCalledWith('Default error')
    expect(consoleSpy).toHaveBeenCalledWith('Default error', 'String error')

    consoleSpy.mockRestore()
  })

  it('should handle Error without message', () => {
    const setError = jest.fn()
    const error = new Error()
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation()

    handleAsyncError(error, 'Default error', setError)

    expect(setError).toHaveBeenCalledWith('Default error')
    expect(consoleSpy).toHaveBeenCalledWith('Default error', error)

    consoleSpy.mockRestore()
  })
})

