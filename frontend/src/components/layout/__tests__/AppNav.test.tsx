import React from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'
import { useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/queryKeys'
import { apiClient } from '@/lib/api'

// Unmock AppNav so we can test the real implementation
vi.unmock('@/components/layout/AppNav')

const { AppNav } = await vi.importActual<typeof import('../AppNav')>('../AppNav')

// Helper: seeds the React Query cache with a user before rendering
function SeedUser({ user }: { user: unknown }) {
  const qc = useQueryClient()
  qc.setQueryData(queryKeys.auth.me, user)
  return null
}

function renderWithUser(ui: React.ReactElement) {
  return render(
    <>
      <SeedUser user={{ id: '1', username: 'testuser' }} />
      {ui}
    </>
  )
}

function getPrimaryNav() {
  return screen.getByRole('navigation', { name: 'navigation.menu' })
}

describe('AppNav - no authenticated user (empty cache)', () => {
  beforeEach(() => {
    ;(globalThis as any).__setMockAuthSession?.(null)
  })

  it('highlights home link when activePage="home"', () => {
    render(<AppNav activePage="home" />)
    const homeLink = within(getPrimaryNav()).getByText('navigation.home')
    expect(homeLink.closest('a')).toHaveAttribute('aria-current', 'page')
  })

  it('hides videos nav link', () => {
    render(<AppNav />)
    expect(screen.queryByText('navigation.videosNav')).not.toBeInTheDocument()
  })

  it('hides groups nav link', () => {
    render(<AppNav />)
    expect(screen.queryByText('navigation.groupsNav')).not.toBeInTheDocument()
  })

  it('hides settings nav link', () => {
    render(<AppNav />)
    expect(screen.queryByText('navigation.settings')).not.toBeInTheDocument()
  })

  it('shows docs nav link', () => {
    render(<AppNav />)
    expect(within(getPrimaryNav()).getByText('navigation.docs')).toBeInTheDocument()
  })

  it('shows pricing nav link', () => {
    render(<AppNav />)
    expect(within(getPrimaryNav()).getByText('navigation.pricing')).toBeInTheDocument()
  })

  it('shows login button', () => {
    render(<AppNav />)
    expect(screen.getAllByText('auth.login.submit').length).toBeGreaterThan(0)
  })
})

describe('AppNav - authenticated user (cache populated)', () => {
  it('shows videos nav link', () => {
    renderWithUser(<AppNav />)
    expect(within(getPrimaryNav()).getByText('navigation.videosNav')).toBeInTheDocument()
  })

  it('shows groups nav link', () => {
    renderWithUser(<AppNav />)
    expect(within(getPrimaryNav()).getByText('navigation.groupsNav')).toBeInTheDocument()
  })

  it('shows settings nav link', () => {
    renderWithUser(<AppNav />)
    expect(within(getPrimaryNav()).getByText('navigation.settings')).toBeInTheDocument()
  })

  it('hides admin nav link for non-superusers', () => {
    renderWithUser(<AppNav />)
    expect(screen.queryByText('navigation.admin')).not.toBeInTheDocument()
  })

  it('shows admin nav link for superusers', () => {
    render(
      <>
        <SeedUser user={{ id: 1, username: 'admin', is_superuser: true }} />
        <AppNav />
      </>,
    )
    expect(within(getPrimaryNav()).getByText('navigation.admin')).toBeInTheDocument()
  })

  it('shows docs nav link', () => {
    renderWithUser(<AppNav />)
    expect(within(getPrimaryNav()).getByText('navigation.docs')).toBeInTheDocument()
  })
})

describe('AppNav - auth cache uninitialized (fetches from API)', () => {
  it('loads app profile via getMeOrNull only when BA session exists', async () => {
    render(<AppNav />)
    await waitFor(() => {
      expect(within(getPrimaryNav()).getByText('navigation.videosNav')).toBeInTheDocument()
    })
    expect(apiClient.getMe).not.toHaveBeenCalled()
    expect(apiClient.getMeOrNull).toHaveBeenCalled()
  })

  it('shows authenticated menu after fetching user from API when cache is empty', async () => {
    ;(apiClient.getMeOrNull as ReturnType<typeof vi.fn>).mockResolvedValue({ id: '1', username: 'testuser' })
    render(<AppNav />)
    await waitFor(() => {
      expect(within(getPrimaryNav()).getByText('navigation.videosNav')).toBeInTheDocument()
    })
    expect(screen.queryByText('auth.login.submit')).not.toBeInTheDocument()
  })

  it('shows login button when BA session is absent', async () => {
    vi.clearAllMocks()
    ;(globalThis as any).__setMockAuthSession?.(null)
    render(<AppNav />)
    await waitFor(() => {
      expect(screen.getAllByText('auth.login.submit').length).toBeGreaterThan(0)
    })
    expect(screen.queryByText('navigation.videosNav')).not.toBeInTheDocument()
    expect(apiClient.getMeOrNull).not.toHaveBeenCalled()
  })
})
