import { renderHook, waitFor } from '@testing-library/react'
import { useAuth } from '../useAuth'
import { useI18nNavigate } from '@/lib/i18n'
import * as authSession from '@/lib/authSession'

const getAccount = vi.fn()

describe('useAuth profile reads', () => {
  afterEach(() => vi.restoreAllMocks())
  beforeEach(() => {
    vi.clearAllMocks()
    getAccount.mockReset()
    globalThis.__setTrpcHandler('account.me', getAccount)
    globalThis.__setMockPathname('/videos')
    globalThis.__setMockAuthSession({
      user: { id: '1', name: 'testuser', email: 'test@example.com' },
    })
  })

  it('waits for the profile on protected routes', async () => {
    let complete!: (user: unknown) => void
    getAccount.mockReturnValue(new Promise(resolve => { complete = resolve }))
    const { result } = renderHook(() => useAuth())
    expect(result.current).toEqual({ isLoading: true, user: null })

    const user = { id: '1', username: 'testuser' }
    await waitFor(() => expect(getAccount).toHaveBeenCalledTimes(1))
    complete(user)
    await waitFor(() => expect(result.current).toEqual({ isLoading: false, user }))
  })

  it.each(['/', '/login', '/terms', '/pricing', '/share/abc'])(
    'does not fetch a profile on public route %s', pathname => {
      globalThis.__setMockPathname(pathname)
      const { result } = renderHook(() => useAuth())
      expect(result.current).toEqual({ isLoading: false, user: null })
      expect(getAccount).not.toHaveBeenCalled()
    },
  )

  it('does not fetch a profile without a session', () => {
    globalThis.__setMockAuthSession(null)
    const { result } = renderHook(() => useAuth())
    expect(result.current).toEqual({ isLoading: false, user: null })
    expect(getAccount).not.toHaveBeenCalled()
  })

  it('waits for the session before requesting the profile', async () => {
    const state = authSession.useAuthSession()
    const session = vi.spyOn(authSession, 'useAuthSession').mockReturnValue({ ...state, isPending: true })
    const user = { id: '1', username: 'testuser' }
    getAccount.mockResolvedValue(user)
    const { result, rerender } = renderHook(() => useAuth())
    expect(result.current.isLoading).toBe(true)
    expect(getAccount).not.toHaveBeenCalled()

    session.mockReturnValue({ ...state, isPending: false })
    rerender()
    await waitFor(() => expect(result.current).toEqual({ isLoading: false, user }))
  })

  it('does not treat a profile request failure as session expiry', async () => {
    getAccount.mockRejectedValue(new Error('temporary database failure'))
    const { result } = renderHook(() => useAuth())
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.user).toBeNull()
    expect(useI18nNavigate()).not.toHaveBeenCalled()
  })
})
