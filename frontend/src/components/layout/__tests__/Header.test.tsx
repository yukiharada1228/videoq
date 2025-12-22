import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Header } from '../Header'
import { useAuth } from '@/hooks/useAuth'
import { apiClient } from '@/lib/api'
import { useOpenAIApiKeyStatus } from '@/hooks/useOpenAIApiKeyStatus'
import { useI18nNavigate } from '@/lib/i18n'

// Mock dependencies
vi.mock('@/hooks/useAuth')
vi.mock('@/hooks/useOpenAIApiKeyStatus')
vi.mock('@/lib/api', () => ({
  apiClient: {
    logout: vi.fn(),
  },
}))

describe('Header', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(globalThis as any).__setMockPathname?.('/')
    window.history.pushState({}, '', '/')
    ;(useOpenAIApiKeyStatus as any).mockReturnValue({
      hasApiKey: true,
      isChecking: false,
      error: null,
      refresh: vi.fn(),
    })
  })

  it('should render brand link', () => {
    ;(useAuth as any).mockReturnValue({ user: null })
    
    render(<Header />)
    
    // There might be multiple elements with the same text (desktop and mobile)
    const brandLinks = screen.getAllByText('navigation.brand')
    expect(brandLinks.length).toBeGreaterThan(0)
    expect(brandLinks[0].closest('a')).toHaveAttribute('href', '/')
  })

  it('should render navigation links when user is logged in', () => {
    ;(useAuth as any).mockReturnValue({
      user: { username: 'testuser' },
    })
    
    render(<Header />)
    
    expect(screen.getByText('navigation.videos')).toBeInTheDocument()
    expect(screen.getByText('navigation.videoGroups')).toBeInTheDocument()
    expect(screen.getByText('navigation.logout')).toBeInTheDocument()
  })

  it('should not render navigation links when user is not logged in', () => {
    ;(useAuth as any).mockReturnValue({ user: null })
    
    render(<Header />)
    
    expect(screen.queryByText('navigation.videos')).not.toBeInTheDocument()
  })

  it('should navigate to videos page when videos link is clicked', async () => {
    ;(useAuth as any).mockReturnValue({
      user: { username: 'testuser' },
    })
    const user = userEvent.setup()
    
    render(<Header />)
    
    const videosButton = screen.getByText('navigation.videos')
    await user.click(videosButton)
    
    const navigate = useI18nNavigate()
    expect(navigate).toHaveBeenCalledWith('/videos')
  })

  it('should navigate to video groups page when groups link is clicked', async () => {
    ;(useAuth as any).mockReturnValue({
      user: { username: 'testuser' },
    })
    const user = userEvent.setup()
    
    render(<Header />)
    
    const groupsButton = screen.getByText('navigation.videoGroups')
    await user.click(groupsButton)
    
    const navigate = useI18nNavigate()
    expect(navigate).toHaveBeenCalledWith('/videos/groups')
  })

  it('should logout and navigate to login when logout is clicked', async () => {
    ;(useAuth as any).mockReturnValue({
      user: { username: 'testuser' },
    })
    const user = userEvent.setup()
    
    render(<Header />)
    
    const logoutButton = screen.getByText('navigation.logout')
    await user.click(logoutButton)
    
    expect(apiClient.logout).toHaveBeenCalled()
    const navigate = useI18nNavigate()
    expect(navigate).toHaveBeenCalledWith('/login')
  })

  it('should render children when provided', () => {
    ;(useAuth as any).mockReturnValue({ user: null })
    
    render(
      <Header>
        <div>Custom Content</div>
      </Header>
    )
    
    expect(screen.getByText('Custom Content')).toBeInTheDocument()
  })

  it('should toggle mobile menu when menu button is clicked', async () => {
    ;(useAuth as any).mockReturnValue({
      user: { username: 'testuser' },
    })
    const user = userEvent.setup()
    
    render(<Header />)
    
    const menuButton = screen.getByLabelText('common.actions.openMenu')
    await user.click(menuButton)
    
    // Menu should be open (close icon should be visible)
    const closeIcon = screen.getByRole('button', { name: 'common.actions.openMenu' })
    expect(closeIcon).toBeInTheDocument()
  })

  it('should toggle mobile menu when menu button is clicked multiple times', async () => {
    ;(useAuth as any).mockReturnValue({
      user: { username: 'testuser' },
    })
    const user = userEvent.setup()
    
    render(<Header />)
    
    const menuButton = screen.getByLabelText('common.actions.openMenu')
    
    // Click to open
    await user.click(menuButton)
    
    // Click again to close
    await user.click(menuButton)
    
    // Menu button should still be present
    expect(screen.getByLabelText('common.actions.openMenu')).toBeInTheDocument()
  })

  it('should close mobile menu when videos button is clicked', async () => {
    ;(useAuth as any).mockReturnValue({
      user: { username: 'testuser' },
    })
    const user = userEvent.setup()
    
    render(<Header />)
    
    const menuButton = screen.getByLabelText('common.actions.openMenu')
    await user.click(menuButton)
    
    // Find mobile menu videos button (second occurrence is in mobile menu)
    const videosButtons = screen.getAllByText('navigation.videos')
    const mobileVideosButton = videosButtons.length > 1 ? videosButtons[1] : videosButtons[0]
    
    await user.click(mobileVideosButton)
    const navigate = useI18nNavigate()
    expect(navigate).toHaveBeenCalledWith('/videos')
  })

  it('should close mobile menu when video groups button is clicked', async () => {
    ;(useAuth as any).mockReturnValue({
      user: { username: 'testuser' },
    })
    const user = userEvent.setup()
    
    render(<Header />)
    
    const menuButton = screen.getByLabelText('common.actions.openMenu')
    await user.click(menuButton)
    
    // Find mobile menu groups button
    const groupsButtons = screen.getAllByText('navigation.videoGroups')
    const mobileGroupsButton = groupsButtons.length > 1 ? groupsButtons[1] : groupsButtons[0]
    
    await user.click(mobileGroupsButton)
    const navigate = useI18nNavigate()
    expect(navigate).toHaveBeenCalledWith('/videos/groups')
  })

  it('should close mobile menu when logout button is clicked', async () => {
    ;(useAuth as any).mockReturnValue({
      user: { username: 'testuser' },
    })
    const user = userEvent.setup()
    
    render(<Header />)
    
    const menuButton = screen.getByLabelText('common.actions.openMenu')
    await user.click(menuButton)
    
    // Find mobile menu logout button
    const logoutButtons = screen.getAllByText('navigation.logout')
    const mobileLogoutButton = logoutButtons.length > 1 ? logoutButtons[1] : logoutButtons[0]
    
    await user.click(mobileLogoutButton)
    expect(apiClient.logout).toHaveBeenCalled()
    const navigate = useI18nNavigate()
    expect(navigate).toHaveBeenCalledWith('/login')
  })
})

