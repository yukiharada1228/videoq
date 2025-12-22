import { render, screen, fireEvent } from '@testing-library/react'
import { AuthForm } from '../AuthForm'

// Mock child components
vi.mock('../FormField', () => ({
  FormField: ({ name, label, value, onChange }: { name: string; label: string; value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void }) => (
    <div>
      <label htmlFor={name}>{label}</label>
      <input
        id={name}
        name={name}
        value={value}
        onChange={onChange}
        data-testid={`input-${name}`}
      />
    </div>
  ),
}))

vi.mock('../ErrorMessage', () => ({
  ErrorMessage: ({ message }: { message: string | null }) =>
    message ? <div data-testid="error-message">{message}</div> : null,
}))

vi.mock('../AuthFormFooter', () => ({
  AuthFormFooter: ({ questionText, linkText, href }: { questionText: string; linkText: string; href: string }) => (
    <div>
      <span>{questionText}</span>
      <a href={href}>{linkText}</a>
    </div>
  ),
}))

describe('AuthForm', () => {
  const defaultProps = {
    title: 'Test Form',
    description: 'Test Description',
    fields: [
      {
        id: 'username',
        name: 'username',
        label: 'Username',
        type: 'text',
        placeholder: 'Enter username',
      },
      {
        id: 'password',
        name: 'password',
        label: 'Password',
        type: 'password',
        placeholder: 'Enter password',
      },
    ],
    formData: { username: '', password: '' },
    error: null,
    loading: false,
    submitButtonText: 'Submit',
    loadingButtonText: 'Submitting...',
    onChange: vi.fn(),
    onSubmit: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should render form with title and description', () => {
    render(<AuthForm {...defaultProps} />)
    
    expect(screen.getByText('Test Form')).toBeInTheDocument()
    expect(screen.getByText('Test Description')).toBeInTheDocument()
  })

  it('should render form fields', () => {
    render(<AuthForm {...defaultProps} />)
    
    expect(screen.getByLabelText('Username')).toBeInTheDocument()
    expect(screen.getByLabelText('Password')).toBeInTheDocument()
  })

  it('should display error message', () => {
    render(<AuthForm {...defaultProps} error="Test error" />)
    
    expect(screen.getByTestId('error-message')).toHaveTextContent('Test error')
  })

  it('should call onChange when input changes', () => {
    const onChange = vi.fn()
    render(<AuthForm {...defaultProps} onChange={onChange} />)
    
    const usernameInput = screen.getByTestId('input-username')
    fireEvent.change(usernameInput, { target: { value: 'testuser' } })
    
    expect(onChange).toHaveBeenCalled()
  })

  it('should call onSubmit when form is submitted', () => {
    const onSubmit = vi.fn((e) => e.preventDefault())
    render(<AuthForm {...defaultProps} onSubmit={onSubmit} />)
    
    const submitButton = screen.getByText('Submit')
    const form = submitButton.closest('form')
    if (form) {
      fireEvent.submit(form)
      expect(onSubmit).toHaveBeenCalled()
    }
  })

  it('should disable submit button when loading', () => {
    render(<AuthForm {...defaultProps} loading={true} />)
    
    const submitButton = screen.getByText('Submitting...')
    expect(submitButton).toBeDisabled()
  })

  it('should show loading button text when loading', () => {
    render(<AuthForm {...defaultProps} loading={true} />)
    
    expect(screen.getByText('Submitting...')).toBeInTheDocument()
    expect(screen.queryByText('Submit')).not.toBeInTheDocument()
  })

  it('should render footer when provided', () => {
    const footer = {
      questionText: 'Don\'t have an account?',
      linkText: 'Sign up',
      href: '/signup',
    }
    render(<AuthForm {...defaultProps} footer={footer} />)
    
    expect(screen.getByText('Don\'t have an account?')).toBeInTheDocument()
    expect(screen.getByText('Sign up')).toBeInTheDocument()
  })

  it('should not render footer when not provided', () => {
    render(<AuthForm {...defaultProps} />)
    
    expect(screen.queryByText('Don\'t have an account?')).not.toBeInTheDocument()
  })
})

