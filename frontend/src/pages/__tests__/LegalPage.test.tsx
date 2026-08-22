import { render, screen } from '@testing-library/react'
import LegalPage from '../LegalPage'

describe('LegalPage', () => {
  it('renders terms of service', () => {
    render(<LegalPage page="terms" />)
    expect(screen.getByRole('heading', { name: 'legal.terms.title' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'legal.terms.sections.payment.title' })).toBeInTheDocument()
  })

  it('renders the Specified Commercial Transactions notice as a definition list', () => {
    render(<LegalPage page="scta" />)
    expect(screen.getByRole('heading', { name: 'legal.scta.title' })).toBeInTheDocument()
    expect(screen.getByText('legal.scta.fields.seller.label')).toBeInTheDocument()
    expect(screen.getByText('legal.scta.fields.email.value')).toBeInTheDocument()
  })
})
