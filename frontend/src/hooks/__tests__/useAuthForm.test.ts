import { renderHook, act, waitFor } from '@testing-library/react'
import { useAuthForm } from '../useAuthForm'

describe('useAuthForm', () => {
  const initialData = { username: '', password: '' }
  const mockOnSubmit = vi.fn()

  beforeEach(() => {
    mockOnSubmit.mockClear()
  })

  it('should initialize with initial data', () => {
    const { result } = renderHook(() =>
      useAuthForm({
        onSubmit: mockOnSubmit,
        initialData,
      })
    )

    expect(result.current.formData).toEqual(initialData)
    expect(result.current.loading).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('should update form data on change', () => {
    const { result } = renderHook(() =>
      useAuthForm({
        onSubmit: mockOnSubmit,
        initialData,
      })
    )

    act(() => {
      result.current.handleChange({
        target: { name: 'username', value: 'testuser' },
      } as React.ChangeEvent<HTMLInputElement>)
    })

    expect(result.current.formData.username).toBe('testuser')
  })

  it('should handle form submission', async () => {
    mockOnSubmit.mockResolvedValue(undefined)
    const { result } = renderHook(() =>
      useAuthForm({
        onSubmit: mockOnSubmit,
        initialData,
      })
    )

    act(() => {
      result.current.handleChange({
        target: { name: 'username', value: 'testuser' },
      } as React.ChangeEvent<HTMLInputElement>)
    })

    await act(async () => {
      await result.current.handleSubmit({
        preventDefault: vi.fn(),
      } as unknown as React.FormEvent)
    })

    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalledWith({ username: 'testuser', password: '' })
    })
  })

  it('should call onSuccessRedirect on successful submission', async () => {
    mockOnSubmit.mockResolvedValue(undefined)
    const onSuccessRedirect = vi.fn()
    const { result } = renderHook(() =>
      useAuthForm({
        onSubmit: mockOnSubmit,
        initialData,
        onSuccessRedirect,
      })
    )

    await act(async () => {
      await result.current.handleSubmit({
        preventDefault: vi.fn(),
      } as unknown as React.FormEvent)
    })

    await waitFor(() => {
      expect(onSuccessRedirect).toHaveBeenCalled()
    })
  })

  it('should handle submission errors', async () => {
    const error = new Error('Submission failed')
    mockOnSubmit.mockRejectedValue(error)
    const { result } = renderHook(() =>
      useAuthForm({
        onSubmit: mockOnSubmit,
        initialData,
      })
    )

    await act(async () => {
      try {
        await result.current.handleSubmit({
          preventDefault: vi.fn(),
        } as unknown as React.FormEvent)
      } catch {
        // Expected to throw
      }
    })

    await waitFor(() => {
      expect(result.current.error).toBe('Submission failed')
    })
  })

  it('should set error manually', () => {
    const { result } = renderHook(() =>
      useAuthForm({
        onSubmit: mockOnSubmit,
        initialData,
      })
    )

    act(() => {
      result.current.setError('Manual error')
    })

    expect(result.current.error).toBe('Manual error')
  })
})

