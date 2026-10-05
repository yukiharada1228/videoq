import { render } from '@testing-library/react'
import { InlineSpinner } from '../InlineSpinner'

describe('InlineSpinner', () => {
  it('should inherit the surrounding text color by default', () => {
    const { container } = render(<InlineSpinner />)
    
    const spinner = container.firstElementChild
    expect(spinner).toBeInTheDocument()
    expect(spinner).toHaveClass('border-current/25', 'border-t-current')
    expect(spinner).toHaveClass('animate-spin')
  })

  it('should render spinner with red color', () => {
    const { container } = render(<InlineSpinner color="red" />)
    
    const spinner = container.querySelector('.border-red-200.border-t-error-1')
    expect(spinner).toBeInTheDocument()
  })
  it('should apply custom className', () => {
    const { container } = render(<InlineSpinner className="custom-class" />)
    
    const spinner = container.querySelector('.custom-class')
    expect(spinner).toBeInTheDocument()
  })
})
