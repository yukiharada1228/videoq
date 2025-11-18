import { render, screen } from '@testing-library/react'
import { AuthFormFooter } from '../AuthFormFooter'

// Mock next/link
jest.mock('next/link', () => {
  return ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  )
})

describe('AuthFormFooter', () => {
  it('should render question text and link', () => {
    render(
      <AuthFormFooter
        questionText="Don't have an account?"
        linkText="Sign up"
        href="/signup"
      />
    )

    expect(screen.getByText("Don't have an account?")).toBeInTheDocument()
    expect(screen.getByText('Sign up')).toBeInTheDocument()
  })

  it('should render link with correct href', () => {
    render(
      <AuthFormFooter
        questionText="Already have an account?"
        linkText="Log in"
        href="/login"
      />
    )

    const link = screen.getByText('Log in')
    expect(link.closest('a')).toHaveAttribute('href', '/login')
  })
})

