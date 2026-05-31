import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { FeedbackProvider } from '../FeedbackProvider'
import { useConfirm, useToast } from '../feedback'

function ConfirmHarness({ onResult }: { onResult: (value: boolean) => void }) {
  const confirm = useConfirm()

  return (
    <button
      onClick={async () => {
        const confirmed = await confirm({
          title: 'Delete video?',
          description: 'This action cannot be undone.',
          confirmLabel: 'Delete',
          cancelLabel: 'Cancel',
          variant: 'danger',
        })
        onResult(confirmed)
      }}
    >
      Open confirm
    </button>
  )
}

function ToastHarness() {
  const toast = useToast()

  return (
    <button
      onClick={() => toast({ message: 'Copy failed', variant: 'error' })}
    >
      Show toast
    </button>
  )
}

describe('FeedbackProvider', () => {
  it('renders an accessible confirm dialog and resolves true on confirm', async () => {
    const onResult = vi.fn()

    render(
      <FeedbackProvider>
        <ConfirmHarness onResult={onResult} />
      </FeedbackProvider>,
    )

    fireEvent.click(screen.getByText('Open confirm'))

    expect(await screen.findByRole('dialog', { name: 'Delete video?' })).toBeInTheDocument()
    expect(screen.getByText('This action cannot be undone.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus()

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

    await waitFor(() => {
      expect(onResult).toHaveBeenCalledWith(true)
      expect(screen.queryByRole('dialog', { name: 'Delete video?' })).not.toBeInTheDocument()
    })
  })

  it('resolves false when the confirm dialog is cancelled', async () => {
    const onResult = vi.fn()

    render(
      <FeedbackProvider>
        <ConfirmHarness onResult={onResult} />
      </FeedbackProvider>,
    )

    fireEvent.click(screen.getByText('Open confirm'))
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }))

    await waitFor(() => {
      expect(onResult).toHaveBeenCalledWith(false)
    })
  })

  it('shows and dismisses toast messages', async () => {
    render(
      <FeedbackProvider>
        <ToastHarness />
      </FeedbackProvider>,
    )

    fireEvent.click(screen.getByText('Show toast'))

    expect(await screen.findByRole('alert')).toHaveTextContent('Copy failed')

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss notification' }))

    await waitFor(() => {
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })
  })
})
