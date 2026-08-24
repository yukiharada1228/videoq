import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Dialog, useDialog } from '../dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../select'

function DialogSelectHarness() {
  const dialog = useDialog({ open: true, onOpenChange: () => {} })

  return (
    <Dialog {...dialog.dialogProps}>
      <Select defaultValue="uploaded_at_desc">
        <SelectTrigger aria-label="ordering">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="uploaded_at_desc">新しい順</SelectItem>
          <SelectItem value="uploaded_at_asc">古い順</SelectItem>
          <SelectItem value="title_asc">タイトル順</SelectItem>
        </SelectContent>
      </Select>
    </Dialog>
  )
}

describe('Select', () => {
  beforeEach(() => {
    if (!Element.prototype.hasPointerCapture) {
      Element.prototype.hasPointerCapture = () => false
    }
    if (!Element.prototype.setPointerCapture) {
      Element.prototype.setPointerCapture = () => {}
    }
    if (!Element.prototype.releasePointerCapture) {
      Element.prototype.releasePointerCapture = () => {}
    }
    if (!Element.prototype.scrollIntoView) {
      Element.prototype.scrollIntoView = () => {}
    }
  })

  it('shows every option when opened', async () => {
    const user = userEvent.setup()
    render(
      <Select defaultValue="uploaded_at_desc">
        <SelectTrigger aria-label="ordering">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="uploaded_at_desc">新しい順</SelectItem>
          <SelectItem value="uploaded_at_asc">古い順</SelectItem>
          <SelectItem value="title_asc">タイトル順</SelectItem>
        </SelectContent>
      </Select>,
    )

    await user.click(screen.getByRole('combobox', { name: 'ordering' }))

    expect(await screen.findByRole('option', { name: '新しい順' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: '古い順' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'タイトル順' })).toBeInTheDocument()
  })

  it('portals options into the open native dialog', async () => {
    const user = userEvent.setup()
    render(<DialogSelectHarness />)

    const dialog = document.querySelector('dialog')
    expect(dialog).toBeTruthy()

    await user.click(screen.getByRole('combobox', { name: 'ordering' }))

    const older = await screen.findByRole('option', { name: '古い順' })
    expect(dialog?.contains(older)).toBe(true)
    expect(screen.getByRole('option', { name: 'タイトル順' })).toBeInTheDocument()
  })
})
