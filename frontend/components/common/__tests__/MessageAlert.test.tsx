import { render, screen } from '@testing-library/react'
import { MessageAlert } from '../MessageAlert'

describe('MessageAlert', () => {
  it('should render error message', () => {
    render(<MessageAlert message="Error occurred" type="error" />)
    
    const alert = screen.getByText('Error occurred')
    expect(alert).toBeInTheDocument()
    expect(alert.className).toContain('bg-red-50')
    expect(alert.className).toContain('text-red-800')
  })

  it('should render success message', () => {
    render(<MessageAlert message="Success!" type="success" />)
    
    const alert = screen.getByText('Success!')
    expect(alert).toBeInTheDocument()
    expect(alert.className).toContain('bg-green-50')
    expect(alert.className).toContain('text-green-800')
  })
})

