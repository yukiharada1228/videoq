import { render, screen, fireEvent } from '@testing-library/react'
import { FormField } from '../FormField'

describe('FormField', () => {
  const defaultProps = {
    id: 'username',
    name: 'username',
    label: 'Username',
    type: 'text',
    placeholder: 'Enter username',
    value: '',
    onChange: jest.fn(),
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should render label and input', () => {
    render(<FormField {...defaultProps} />)
    
    expect(screen.getByLabelText('Username')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Enter username')).toBeInTheDocument()
  })

  it('should call onChange when input changes', () => {
    const onChange = jest.fn()
    render(<FormField {...defaultProps} onChange={onChange} />)
    
    const input = screen.getByPlaceholderText('Enter username')
    fireEvent.change(input, { target: { value: 'testuser' } })
    
    expect(onChange).toHaveBeenCalled()
  })

  it('should set required attribute when required is true', () => {
    render(<FormField {...defaultProps} required={true} />)
    
    const input = screen.getByPlaceholderText('Enter username')
    expect(input).toHaveAttribute('required')
  })

  it('should set minLength attribute when provided', () => {
    render(<FormField {...defaultProps} minLength={5} />)
    
    const input = screen.getByPlaceholderText('Enter username')
    expect(input).toHaveAttribute('minLength', '5')
  })

  it('should display value', () => {
    render(<FormField {...defaultProps} value="testuser" />)
    
    const input = screen.getByPlaceholderText('Enter username') as HTMLInputElement
    expect(input.value).toBe('testuser')
  })
})

