import { render, screen } from '@testing-library/react'
import { Footer } from '../Footer'

describe('Footer', () => {
  it('should render footer with copyright text', () => {
    render(<Footer />)
    
    const currentYear = new Date().getFullYear()
    expect(screen.getByText(`layout.footer.copyright ${JSON.stringify({ year: currentYear })}`)).toBeInTheDocument()
  })

  it('should have correct footer structure', () => {
    const { container } = render(<Footer />)
    
    const footer = container.querySelector('footer')
    expect(footer).toBeInTheDocument()
    expect(footer?.className).toContain('border-t')
    expect(footer?.className).toContain('bg-white')
  })
})

