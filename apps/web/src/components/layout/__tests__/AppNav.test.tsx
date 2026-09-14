import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { apiClient } from '@/lib/api'

// Unmock AppNav so we can test the real implementation
vi.unmock('@/components/layout/AppNav')

const { AppNav } = await vi.importActual<typeof import('../AppNav')>('../AppNav')
const getAccount = vi.fn()

beforeEach(() => {
  getAccount.mockReset()
  getAccount.mockResolvedValue({ id: '1', username: 'testuser' })
  globalThis.__setTrpcHandler('account.me', getAccount)
  vi.mocked(apiClient.logout).mockReset().mockResolvedValue(undefined)
})

function renderWithUser(ui: React.ReactElement) {
  return render(ui)
}

function getPrimaryNav() {
  return screen.getByRole('navigation', { name: 'navigation.menu' })
}

describe('AppNav - disclosure focus and pending actions', () => {
  it('returns focus to the menu trigger on Escape and backdrop dismissal', () => {
    render(<AppNav />)
    const trigger = screen.getByRole('button', { name: 'navigation.menu' })
    fireEvent.click(trigger)
    const panel = document.getElementById(trigger.getAttribute('aria-controls')!)!
    within(panel).getAllByRole('link')[0].focus()
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    expect(trigger).toHaveFocus()
    expect(trigger).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(trigger)
    const backdrop = screen.getAllByRole('button', { name: 'navigation.closeMenu' }).find((button) => button.tabIndex === -1)!
    expect(backdrop).toBeInTheDocument()
    fireEvent.click(backdrop)
    expect(trigger).toHaveFocus()
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
  })

  it('returns focus to the language trigger on Escape and selection', () => {
    render(<AppNav />)
    const trigger = screen.getByRole('button', { name: 'Language' })
    fireEvent.click(trigger)
    const panel = document.getElementById(trigger.getAttribute('aria-controls')!)!
    within(panel).getByRole('link', { name: '日本語' }).focus()
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    expect(trigger).toHaveFocus()
    expect(trigger).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(trigger)
    fireEvent.click(within(document.getElementById(trigger.getAttribute('aria-controls')!)!).getByRole('link', { name: '日本語' }))
    expect(trigger).toHaveFocus()
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
  })

  it('disables desktop and expanded-menu logout while the request is pending', async () => {
    let finish!: () => void
    vi.mocked(apiClient.logout).mockReturnValueOnce(new Promise<void>((resolve) => { finish = resolve }))
    render(<AppNav />)
    fireEvent.click(screen.getByRole('button', { name: 'navigation.menu' }))
    const actions = screen.getAllByRole('button', { name: 'navigation.logout' })
    expect(actions).toHaveLength(2)
    fireEvent.click(actions[0])
    await waitFor(() => actions.forEach((action) => expect(action).toBeDisabled()))
    fireEvent.click(actions[1])
    expect(apiClient.logout).toHaveBeenCalledTimes(1)
    await act(async () => { finish() })
    await waitFor(() => expect(actions[0]).toBeEnabled())
  })
})

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
    expect(screen.queryByText('navigation.videoLibrary')).not.toBeInTheDocument()
  })

  it('hides courses nav link', () => {
    render(<AppNav />)
    expect(screen.queryByText('navigation.coursesNav')).not.toBeInTheDocument()
  })

  it('hides settings nav link', () => {
    render(<AppNav />)
    expect(screen.queryByText('navigation.settings')).not.toBeInTheDocument()
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
    expect(within(getPrimaryNav()).getByText('navigation.videoLibrary')).toBeInTheDocument()
  })

  it('shows courses nav link', () => {
    renderWithUser(<AppNav />)
    expect(within(getPrimaryNav()).getByText('navigation.coursesNav')).toBeInTheDocument()
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
    getAccount.mockResolvedValue({ id: 1, username: 'admin', is_superuser: true })
    render(<AppNav />)
    return waitFor(() => {
      expect(within(getPrimaryNav()).getByText('navigation.admin')).toBeInTheDocument()
    })
  })

})

describe('AppNav - auth cache uninitialized (fetches from API)', () => {
  it('loads app profile via getMeOrNull only when BA session exists', async () => {
    render(<AppNav />)
    await waitFor(() => {
      expect(within(getPrimaryNav()).getByText('navigation.videoLibrary')).toBeInTheDocument()
    })
    expect(getAccount).toHaveBeenCalled()
  })

  it('shows authenticated menu after fetching user from API when cache is empty', async () => {
    getAccount.mockResolvedValue({ id: '1', username: 'testuser' })
    render(<AppNav />)
    await waitFor(() => {
      expect(within(getPrimaryNav()).getByText('navigation.videoLibrary')).toBeInTheDocument()
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
    expect(screen.queryByText('navigation.videoLibrary')).not.toBeInTheDocument()
    expect(getAccount).not.toHaveBeenCalled()
  })
})
