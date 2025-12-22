import { renderHook, act, waitFor } from '@testing-library/react'
import { useAsyncState } from '../useAsyncState'

describe('useAsyncState', () => {
  it('should initialize with default values', () => {
    const { result } = renderHook(() => useAsyncState())
    
    expect(result.current.data).toBeNull()
    expect(result.current.isLoading).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('should initialize with initial data', () => {
    const { result } = renderHook(() => useAsyncState({ initialData: 'test' }))
    
    expect(result.current.data).toBe('test')
  })

  it('should execute async function and update state', async () => {
    const { result } = renderHook(() => useAsyncState<string>())
    
    await act(async () => {
      await result.current.execute(async () => {
        return 'success'
      })
    })

    await waitFor(() => {
      expect(result.current.data).toBe('success')
      expect(result.current.isLoading).toBe(false)
      expect(result.current.error).toBeNull()
    })
  })

  it('should handle errors', async () => {
    const { result } = renderHook(() => useAsyncState<string>())
    
    await act(async () => {
      try {
        await result.current.execute(async () => {
          throw new Error('Test error')
        })
      } catch {
        // Expected to throw
      }
    })

    await waitFor(() => {
      expect(result.current.error).toBe('Test error')
      expect(result.current.isLoading).toBe(false)
    })
  })

  it('should call onSuccess callback', async () => {
    const onSuccess = vi.fn()
    const { result } = renderHook(() => useAsyncState({ onSuccess }))
    
    await act(async () => {
      await result.current.execute(async () => 'success')
    })

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledWith('success')
    })
  })

  it('should call onError callback', async () => {
    const onError = vi.fn()
    const { result } = renderHook(() => useAsyncState({ onError }))
    
    await act(async () => {
      try {
        await result.current.execute(async () => {
          throw new Error('Test error')
        })
      } catch {
        // Expected to throw
      }
    })

    await waitFor(() => {
      expect(onError).toHaveBeenCalled()
    })
  })

  it('should reset state', () => {
    const { result } = renderHook(() => useAsyncState({ initialData: 'initial' }))
    
    act(() => {
      result.current.setData('changed')
      result.current.setError('error')
    })

    act(() => {
      result.current.reset()
    })

    expect(result.current.data).toBe('initial')
    expect(result.current.error).toBeNull()
    expect(result.current.isLoading).toBe(false)
  })

  it('should set data manually', () => {
    const { result } = renderHook(() => useAsyncState())
    
    act(() => {
      result.current.setData('manual')
    })

    expect(result.current.data).toBe('manual')
  })

  it('should set error manually', () => {
    const { result } = renderHook(() => useAsyncState())
    
    act(() => {
      result.current.setError('manual error')
    })

    expect(result.current.error).toBe('manual error')
  })

  it('should use mutate with confirmation when user confirms', async () => {
    window.confirm = vi.fn(() => true)
    const { result } = renderHook(() => useAsyncState({ confirmMessage: 'Confirm?' }))
    
    await act(async () => {
      const mutateResult = await result.current.mutate(async () => 'success')
      expect(mutateResult).toBe('success')
    })

    expect(window.confirm).toHaveBeenCalledWith('Confirm?')
    await waitFor(() => {
      expect(result.current.data).toBe('success')
    })
  })

  it('should use mutate with confirmation when user cancels', async () => {
    window.confirm = vi.fn(() => false)
    const { result } = renderHook(() => useAsyncState({ confirmMessage: 'Confirm?' }))
    
    await act(async () => {
      const mutateResult = await result.current.mutate(async () => 'success')
      expect(mutateResult).toBeUndefined()
    })

    expect(window.confirm).toHaveBeenCalledWith('Confirm?')
    expect(result.current.data).toBeNull()
  })

  it('should handle non-Error exceptions in execute', async () => {
    const { result } = renderHook(() => useAsyncState<string>())
    
    await act(async () => {
      try {
        await result.current.execute(async () => {
          throw 'String error'
        })
      } catch {
        // Expected to throw
      }
    })

    await waitFor(() => {
      expect(result.current.error).toBe('Operation failed')
      expect(result.current.isLoading).toBe(false)
    })
  })

  it('should handle non-Error exceptions in mutate', async () => {
    window.confirm = vi.fn(() => true)
    const { result } = renderHook(() => useAsyncState({ confirmMessage: 'Confirm?' }))
    
    await act(async () => {
      try {
        await result.current.mutate(async () => {
          throw 'String error'
        })
      } catch {
        // Expected to throw
      }
    })

    await waitFor(() => {
      expect(result.current.error).toBe('Operation failed')
      expect(result.current.isLoading).toBe(false)
    })
  })

  it('should call onError with Error object when non-Error is thrown in execute', async () => {
    const onError = vi.fn()
    const { result } = renderHook(() => useAsyncState({ onError }))
    
    await act(async () => {
      try {
        await result.current.execute(async () => {
          throw 'String error'
        })
      } catch {
        // Expected to throw
      }
    })

    await waitFor(() => {
      expect(onError).toHaveBeenCalled()
      const errorArg = onError.mock.calls[0][0]
      expect(errorArg).toBeInstanceOf(Error)
      expect(errorArg.message).toBe('Operation failed')
    })
  })

  it('should call onError with Error object when non-Error is thrown in mutate', async () => {
    window.confirm = vi.fn(() => true)
    const onError = vi.fn()
    const { result } = renderHook(() => useAsyncState({ onError, confirmMessage: 'Confirm?' }))
    
    await act(async () => {
      try {
        await result.current.mutate(async () => {
          throw 'String error'
        })
      } catch {
        // Expected to throw
      }
    })

    await waitFor(() => {
      expect(onError).toHaveBeenCalled()
      const errorArg = onError.mock.calls[0][0]
      expect(errorArg).toBeInstanceOf(Error)
      expect(errorArg.message).toBe('Operation failed')
    })
  })
})

