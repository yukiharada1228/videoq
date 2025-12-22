import { render, screen } from '@testing-library/react'
import { PageLayout } from '../PageLayout'

// Mock Header and Footer
vi.mock('../Header', () => ({
  Header: ({ children }: { children?: React.ReactNode }) => (
    <header data-testid="header">{children}</header>
  ),
}))

vi.mock('../Footer', () => ({
  Footer: () => <footer data-testid="footer" />,
}))

describe('PageLayout', () => {
  it('should render children with header and footer', () => {
    render(
      <PageLayout>
        <div>Test Content</div>
      </PageLayout>
    )
    
    expect(screen.getByTestId('header')).toBeInTheDocument()
    expect(screen.getByTestId('footer')).toBeInTheDocument()
    expect(screen.getByText('Test Content')).toBeInTheDocument()
  })

  it('should render header content when provided', () => {
    render(
      <PageLayout headerContent={<div>Header Content</div>}>
        <div>Test Content</div>
      </PageLayout>
    )
    
    expect(screen.getByText('Header Content')).toBeInTheDocument()
  })

  it('should apply centered classes when centered is true', () => {
    const { container } = render(
      <PageLayout centered={true}>
        <div>Test Content</div>
      </PageLayout>
    )
    
    const main = container.querySelector('main')
    expect(main?.className).toContain('items-center')
    expect(main?.className).toContain('justify-center')
  })

  it('should apply fullWidth classes when fullWidth is true', () => {
    const { container } = render(
      <PageLayout fullWidth={true}>
        <div>Test Content</div>
      </PageLayout>
    )
    
    const main = container.querySelector('main')
    expect(main?.className).toContain('w-full')
    expect(main?.className).toContain('px-6')
  })

  it('should apply default container classes when neither centered nor fullWidth', () => {
    const { container } = render(
      <PageLayout>
        <div>Test Content</div>
      </PageLayout>
    )
    
    const main = container.querySelector('main')
    expect(main?.className).toContain('container')
    expect(main?.className).toContain('mx-auto')
  })
})

