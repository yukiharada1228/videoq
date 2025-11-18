import { render } from '@testing-library/react'
import { InlineSpinner } from '../InlineSpinner'

describe('InlineSpinner', () => {
  it('should render spinner with default blue color', () => {
    const { container } = render(<InlineSpinner />)
    
    const spinner = container.querySelector('.border-gray-300.border-t-blue-600')
    expect(spinner).toBeInTheDocument()
    expect(spinner).toHaveClass('animate-spin')
  })

  it('should render spinner with red color', () => {
    const { container } = render(<InlineSpinner color="red" />)
    
    const spinner = container.querySelector('.border-red-300.border-t-red-600')
    expect(spinner).toBeInTheDocument()
  })

  it('should apply custom className', () => {
    const { container } = render(<InlineSpinner className="custom-class" />)
    
    const spinner = container.querySelector('.custom-class')
    expect(spinner).toBeInTheDocument()
  })
})

