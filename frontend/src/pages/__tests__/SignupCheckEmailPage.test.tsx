import { render, screen } from '@testing-library/react'
import SignupCheckEmailPage from '../SignupCheckEmailPage'

describe('SignupCheckEmailPage', () => {
  it('should render page title', () => {
    render(<SignupCheckEmailPage />)

    expect(screen.getByText('auth.checkEmail.title')).toBeInTheDocument()
  })

  it('should render description', () => {
    render(<SignupCheckEmailPage />)

    expect(screen.getByText('auth.checkEmail.description')).toBeInTheDocument()
  })

  it('should render success alert', () => {
    render(<SignupCheckEmailPage />)

    expect(screen.getByText('auth.checkEmail.alert')).toBeInTheDocument()
  })

  it('should render help text', () => {
    render(<SignupCheckEmailPage />)

    expect(screen.getByText('auth.checkEmail.help')).toBeInTheDocument()
  })

  it('should render back to login link', () => {
    render(<SignupCheckEmailPage />)

    expect(screen.getByText('auth.checkEmail.backToLogin')).toBeInTheDocument()
  })

  it('should have centered layout', () => {
    render(<SignupCheckEmailPage />)

    const container = screen.getByText('auth.checkEmail.title').closest('div')
    expect(container).toBeInTheDocument()
  })
})
