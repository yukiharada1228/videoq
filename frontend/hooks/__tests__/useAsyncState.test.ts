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
    const onError = jest.fn()
    
    await act(async () => {
      try {
        await result.current.execute(async () => {
          throw new Error('Test error')
        })
      } catch (e) {
        // Expected to throw
      }
    })

    await waitFor(() => {
      expect(result.current.error).toBe('Test error')
      expect(result.current.isLoading).toBe(false)
    })
  })

  it('should call onSuccess callback', async () => {
    const onSuccess = jest.fn()
    const { result } = renderHook(() => useAsyncState({ onSuccess }))
    
    await act(async () => {
      await result.current.execute(async () => 'success')
    })

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledWith('success')
    })
  })

  it('should call onError callback', async () => {
    const onError = jest.fn()
    const { result } = renderHook(() => useAsyncState({ onError }))
    
    await act(async () => {
      try {
        await result.current.execute(async () => {
          throw new Error('Test error')
        })
      } catch (e) {
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

  it('should use mutate with confirmation', async () => {
    window.confirm = jest.fn(() => false)
    const { result } = renderHook(() => useAsyncState({ confirmMessage: 'Confirm?' }))
    
    await act(async () => {
      const mutateResult = await result.current.mutate(async () => 'success')
      expect(mutateResult).toBeUndefined()
    })

    expect(window.confirm).toHaveBeenCalledWith('Confirm?')
  })
})

