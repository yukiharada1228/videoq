import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
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

describe('AppNav - no authenticated user (empty cache)', () => {
  it('highlights home link when activePage="home"', () => {
    render(<AppNav activePage="home" />)
    const homeLink = screen.getByText('navigation.home')
    expect(homeLink.closest('a')).toHaveClass('border-b-2')
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
    expect(screen.getByText('navigation.docs')).toBeInTheDocument()
  })

  it('shows login button', () => {
    render(<AppNav />)
    expect(screen.getByText('auth.login.submit')).toBeInTheDocument()
  })
})

describe('AppNav - authenticated user (cache populated)', () => {
  it('shows videos nav link', () => {
    renderWithUser(<AppNav />)
    expect(screen.getByText('navigation.videosNav')).toBeInTheDocument()
  })

  it('shows groups nav link', () => {
    renderWithUser(<AppNav />)
    expect(screen.getByText('navigation.groupsNav')).toBeInTheDocument()
  })

  it('shows settings nav link', () => {
    renderWithUser(<AppNav />)
    expect(screen.getByText('navigation.settings')).toBeInTheDocument()
  })

  it('shows docs nav link', () => {
    renderWithUser(<AppNav />)
    expect(screen.getByText('navigation.docs')).toBeInTheDocument()
  })
})

describe('AppNav - auth cache uninitialized (fetches from API)', () => {
  it('shows authenticated menu after fetching user from API when cache is empty', async () => {
    ;(apiClient.getMe as ReturnType<typeof vi.fn>).mockResolvedValue({ id: '1', username: 'testuser' })
    render(<AppNav />)
    await waitFor(() => {
      expect(screen.getByText('navigation.videosNav')).toBeInTheDocument()
    })
    expect(screen.queryByText('auth.login.submit')).not.toBeInTheDocument()
  })

  it('shows login button when API returns null and cache is empty', async () => {
    ;(apiClient.getMe as ReturnType<typeof vi.fn>).mockResolvedValue(null)
    render(<AppNav />)
    await waitFor(() => {
      expect(screen.getByText('auth.login.submit')).toBeInTheDocument()
    })
    expect(screen.queryByText('navigation.videosNav')).not.toBeInTheDocument()
  })
})
