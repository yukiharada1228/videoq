import { render, screen } from '@testing-library/react'
import { MessageAlert } from '../MessageAlert'

describe('MessageAlert', () => {
  it('should render error message', () => {
    render(<MessageAlert message="Error occurred" type="error" />)

    expect(screen.getByText('Error occurred')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveAttribute('data-type', 'error')
  })

  it('should render success message', () => {
    render(<MessageAlert message="Success!" type="success" />)

    expect(screen.getByText('Success!')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveAttribute('data-type', 'success')
  })
})
