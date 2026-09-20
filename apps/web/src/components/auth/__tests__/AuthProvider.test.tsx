import { act, render, screen, waitFor } from '@testing-library/react'
import { useEffect, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api'
import { useI18nNavigate } from '@/lib/i18n'
import { TRPC_UNAUTHORIZED_EVENT } from '@/lib/trpc'
import { AuthProvider as SessionAuthProvider } from '../AuthProvider'
import { useAuthSession } from '@/lib/authSession'

const cachedProfileKey = ['test', 'account.me'] as const

function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  return <SessionAuthProvider initialQueryClient={queryClient}>{children}</SessionAuthProvider>
}

vi.mock('@/lib/api', () => ({
  apiClient: {
    setUnauthorizedHandler: vi.fn(),
    logout: vi.fn(() => Promise.resolve()),
  },
}))

function latestUnauthorizedHandler(): (() => void | Promise<void>) {
  const calls = (apiClient.setUnauthorizedHandler as ReturnType<typeof vi.fn>).mock.calls
  for (let i = calls.length - 1; i >= 0; i -= 1) {
    const candidate = calls[i][0]
    if (typeof candidate === 'function') {
      return candidate
    }
  }
  throw new Error('Unauthorized handler was not registered')
}

describe('AuthProvider', () => {
  let queryClient: QueryClient | null = null

  function QueryClientProbe({ onClient }: { onClient: (client: QueryClient) => void }) {
    const client = useQueryClient()
    useEffect(() => {
      onClient(client)
    }, [client, onClient])
    return null
  }

  beforeEach(() => {
    vi.clearAllMocks()
    queryClient = null
    ;(globalThis as any).__setMockPathname?.('/videos')
    window.history.pushState({}, '', '/videos')
  })

  it('clears cached auth state and redirects protected routes when any API reports unauthorized', async () => {
    render(
      <AuthProvider>
        <QueryClientProbe onClient={(client) => { queryClient = client }} />
      </AuthProvider>,
    )

    expect(apiClient.setUnauthorizedHandler).toHaveBeenCalledWith(expect.any(Function))
    expect(queryClient).not.toBeNull()
    queryClient!.setQueryData(cachedProfileKey, { id: 1, username: 'testuser' })

    await act(async () => {
      await latestUnauthorizedHandler()()
    })

    expect(queryClient!.getQueryData(cachedProfileKey)).toBeUndefined()
    expect(useI18nNavigate()).toHaveBeenCalledWith('/login')
  })

  it('clears cached auth state without redirecting from public routes', async () => {
    ;(globalThis as any).__setMockPathname?.('/login')
    window.history.pushState({}, '', '/login')

    render(
      <AuthProvider>
        <QueryClientProbe onClient={(client) => { queryClient = client }} />
      </AuthProvider>,
    )

    queryClient!.setQueryData(cachedProfileKey, { id: 1, username: 'testuser' })

    await act(async () => {
      await latestUnauthorizedHandler()()
    })

    expect(queryClient!.getQueryData(cachedProfileKey)).toBeUndefined()
    expect(useI18nNavigate()).not.toHaveBeenCalled()
  })

  it('signs out and redirects when tRPC reports an unauthorized response', async () => {
    render(
      <AuthProvider>
        <QueryClientProbe onClient={(client) => { queryClient = client }} />
      </AuthProvider>,
    )
    queryClient!.setQueryData(cachedProfileKey, { id: 1, username: 'testuser' })

    await act(async () => {
      window.dispatchEvent(new Event(TRPC_UNAUTHORIZED_EVENT))
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(apiClient.logout).toHaveBeenCalledTimes(1)
    expect(queryClient!.getQueryData(cachedProfileKey)).toBeUndefined()
    expect(useI18nNavigate()).toHaveBeenCalledWith('/login')
  })

  it('unregisters the unauthorized handler on unmount', () => {
    const { unmount } = render(
      <AuthProvider>
        <QueryClientProbe onClient={(client) => { queryClient = client }} />
      </AuthProvider>,
    )

    unmount()

    expect(apiClient.setUnauthorizedHandler).toHaveBeenLastCalledWith(undefined)
  })

  it.each([null, { user: { id: 'another-user' } }])(
    'clears private data when a session changes without a local logout: %j',
    async (nextSession) => {
      const content = <AuthProvider><QueryClientProbe onClient={(client) => { queryClient = client }} /></AuthProvider>
      const { rerender } = render(content)
      queryClient!.setQueryData(cachedProfileKey, { id: '1', username: 'previous-user' })
      queryClient!.setQueryData(['private-videos'], ['previous-user-video'])

      globalThis.__setMockAuthSession(nextSession)
      rerender(<AuthProvider><QueryClientProbe onClient={(client) => { queryClient = client }} /></AuthProvider>)

      await waitFor(() => {
        expect(queryClient!.getQueryData(cachedProfileKey)).toBeUndefined()
        expect(queryClient!.getQueryData(['private-videos'])).toBeUndefined()
      })
      expect(apiClient.logout).not.toHaveBeenCalled()
    },
  )

  it('never renders the previous account data under a new session and reloads mounted queries', async () => {
    const observed: Array<{ userId: string | undefined; data: string | undefined }> = []
    function PrivateData() {
      const userId = useAuthSession().data?.user.id
      const query = useQuery({
        queryKey: ['private-videos'],
        queryFn: async () => `${userId}-video`,
        staleTime: Infinity,
      })
      observed.push({ userId, data: query.data })
      return <p>{query.data}</p>
    }
    const { rerender } = render(<AuthProvider><PrivateData /></AuthProvider>)
    await screen.findByText('1-video')

    globalThis.__setMockAuthSession({ user: { id: '2' } })
    rerender(<AuthProvider><PrivateData /></AuthProvider>)

    await screen.findByText('2-video')
    expect(observed).not.toContainEqual({ userId: '2', data: '1-video' })
  })

  it('keeps the cache when the same user refreshes their session', () => {
    const { rerender } = render(<AuthProvider><QueryClientProbe onClient={(client) => { queryClient = client }} /></AuthProvider>)
    queryClient!.setQueryData(['private-videos'], ['current-user-video'])

    globalThis.__setMockAuthSession({ user: { id: '1', name: 'updated-name' } })
    rerender(<AuthProvider><QueryClientProbe onClient={(client) => { queryClient = client }} /></AuthProvider>)

    expect(queryClient!.getQueryData(['private-videos'])).toEqual(['current-user-video'])
  })

  it('isolates late responses and mutation cache writes from the previous account', async () => {
    const { rerender } = render(<AuthProvider><QueryClientProbe onClient={(client) => { queryClient = client }} /></AuthProvider>)
    const previousClient = queryClient!
    let resolveRequest!: (value: string) => void
    const pendingRequest = previousClient.fetchQuery({
      queryKey: ['private-videos'],
      queryFn: () => new Promise<string>((resolve) => { resolveRequest = resolve }),
    }).catch(() => undefined)

    globalThis.__setMockAuthSession({ user: { id: '2' } })
    rerender(<AuthProvider><QueryClientProbe onClient={(client) => { queryClient = client }} /></AuthProvider>)
    await waitFor(() => expect(queryClient).not.toBe(previousClient))

    await act(async () => {
      resolveRequest('previous-user-video')
      await pendingRequest
      // A request that already reached the server cannot be cancelled reliably;
      // its mutation callback may still update the client captured by its hook.
      previousClient.setQueryData(['private-videos'], ['late-private-video'])
    })

    expect(queryClient!.getQueryData(['private-videos'])).toBeUndefined()
  })
})
