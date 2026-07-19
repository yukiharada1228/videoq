import { render, screen } from '@testing-library/react'
import { ErrorMessage } from '../ErrorMessage'

describe('ErrorMessage', () => {
  it('should render error message when message is provided', () => {
    render(<ErrorMessage message="Test error message" />)

    expect(screen.getByText('Test error message')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveAttribute('data-type', 'error')
    expect(screen.getByRole('alert')).toHaveAttribute('data-slot', 'notification-banner')
  })

  it('should not render when message is null', () => {
    const { container } = render(<ErrorMessage message={null} />)

    expect(container.firstChild).toBeNull()
  })

  it('should not render when message is empty string', () => {
    const { container } = render(<ErrorMessage message="" />)

    expect(container.firstChild).toBeNull()
  })
})
