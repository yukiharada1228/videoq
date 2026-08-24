import { fireEvent, render, screen } from '@testing-library/react'
import { apiClient } from '@/lib/api'
import { LandingTryDemo } from '../LandingTryDemo'

describe('LandingTryDemo', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows an owned demo lecture without loading third-party shares', () => {
    render(<LandingTryDemo />)

    expect(screen.getByRole('heading', { level: 2, name: 'landing.demo.title' })).toBeInTheDocument()
    expect(screen.getByText('landing.demo.lectureTitle')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 3, name: 'landing.demo.scenes.hard.title' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'landing.tryOwn' })).toHaveAttribute('href', '/signup')
    expect(apiClient.getSharedGroup).not.toHaveBeenCalled()
    expect(document.querySelector('iframe')).toBeNull()
    expect(screen.queryByRole('link', { name: /share\// })).not.toBeInTheDocument()
  })

  it('jumps to the matching scene when a prepared question is asked', () => {
    render(<LandingTryDemo />)

    fireEvent.click(screen.getByRole('button', { name: 'landing.demo.questions.jump' }))

    expect(screen.getByText(/landing\.demo\.answers\.jump/)).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 3, name: 'landing.demo.scenes.jump.title' })).toBeInTheDocument()
  })

  it('plays from the cited timestamp when the answer time is pressed', () => {
    render(<LandingTryDemo />)

    fireEvent.click(screen.getByRole('button', { name: 'landing.demo.questions.own' }))
    fireEvent.click(screen.getByRole('button', { name: 'landing.demo.lectureTitle 00:00:40' }))

    expect(screen.getByRole('heading', { level: 3, name: 'landing.demo.scenes.own.title' })).toBeInTheDocument()
  })

  it('does not pretend to answer questions about third-party lectures', () => {
    render(<LandingTryDemo />)

    fireEvent.change(screen.getByLabelText('chat.placeholder'), { target: { value: 'CNNとは？' } })
    fireEvent.click(screen.getByRole('button', { name: 'common.actions.send' }))

    expect(screen.getByText('landing.demo.fallback')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 3, name: 'landing.demo.scenes.hard.title' })).toBeInTheDocument()
  })
})
