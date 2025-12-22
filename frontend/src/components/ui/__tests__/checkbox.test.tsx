import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Checkbox } from '../checkbox'

describe('Checkbox', () => {
  it('should render checkbox', () => {
    render(<Checkbox />)
    
    const checkbox = screen.getByRole('checkbox')
    expect(checkbox).toBeInTheDocument()
  })

  it('should be checked when checked prop is true', () => {
    render(<Checkbox checked={true} />)
    
    const checkbox = screen.getByRole('checkbox')
    expect(checkbox).toHaveAttribute('data-state', 'checked')
  })

  it('should be unchecked when checked prop is false', () => {
    render(<Checkbox checked={false} />)
    
    const checkbox = screen.getByRole('checkbox')
    expect(checkbox).toHaveAttribute('data-state', 'unchecked')
  })

  it('should call onChange when clicked', async () => {
    const handleChange = vi.fn()
    const user = userEvent.setup()
    
    render(<Checkbox onCheckedChange={handleChange} />)
    
    const checkbox = screen.getByRole('checkbox')
    await user.click(checkbox)
    
    expect(handleChange).toHaveBeenCalled()
  })

  it('should be disabled when disabled prop is true', () => {
    render(<Checkbox disabled={true} />)
    
    const checkbox = screen.getByRole('checkbox')
    expect(checkbox).toBeDisabled()
  })

  it('should apply custom className', () => {
    const { container } = render(<Checkbox className="custom-class" />)
    
    const checkbox = container.querySelector('[data-slot="checkbox"]')
    expect(checkbox?.className).toContain('custom-class')
  })
})

