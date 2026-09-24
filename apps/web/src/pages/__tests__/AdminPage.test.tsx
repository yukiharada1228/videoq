import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import AdminPage from '../AdminPage'

const listUsers = vi.fn()
const patchFlags = vi.fn()
const patchQuota = vi.fn()
const patchUsage = vi.fn()
const reindexAll = vi.fn()
const deleteUser = vi.fn()

const navigateMock = vi.fn()

vi.mock('@/lib/i18n', async () => {
  const actual = await vi.importActual<typeof import('@/lib/i18n')>('@/lib/i18n')
  return {
    ...actual,
    useI18nNavigate: () => navigateMock,
  }
})

vi.mock('@/hooks/useAuth', () => ({
  useAuth: vi.fn(),
}))

import { useAuth } from '@/hooks/useAuth'

const sampleUser = {
  id: 9,
  username: 'bob',
  email: 'bob@example.com',
  is_active: true,
  is_staff: false,
  is_superuser: false,
  max_video_upload_size_mb: 500,
  storage_limit_gb: 10,
  processing_limit_minutes: 60,
  ai_answers_limit: 100,
  used_storage_bytes: 1024,
  used_processing_seconds: 30,
  used_ai_answers: 2,
  usage_period_start: null,
  is_over_quota: false,
  plan_code: 'free',
  quota_source: 'plan',
}

describe('AdminPage', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    globalThis.__setTrpcHandler('admin.listUsers', listUsers)
    globalThis.__setTrpcHandler('admin.patchFlags', patchFlags)
    globalThis.__setTrpcHandler('admin.patchQuota', patchQuota)
    globalThis.__setTrpcHandler('admin.patchUsage', patchUsage)
    globalThis.__setTrpcHandler('admin.reindexAll', reindexAll)
    globalThis.__setTrpcHandler('admin.deleteUser', deleteUser)
    ;(useAuth as ReturnType<typeof vi.fn>).mockReturnValue({
      user: {
        id: 1,
        username: 'admin',
        email: 'admin@example.com',
        is_superuser: true,
        video_count: 0,
        max_video_upload_size_mb: 500,
      },
      isLoading: false,
      refetch: vi.fn(),
    })
    listUsers.mockResolvedValue({
      data: [sampleUser],
      meta: { total: 1, limit: 20, offset: 0 },
    })
    patchFlags.mockImplementation(async patch => ({ ...sampleUser, ...patch }))
    patchQuota.mockImplementation(async patch => ({ ...sampleUser, ...patch, quota_source: 'admin' }))
    patchUsage.mockImplementation(async patch => ({ ...sampleUser, ...patch }))
  })

  it('lists admin users for superusers', async () => {
    render(<AdminPage />)

    expect(await screen.findByText('admin.title')).toBeInTheDocument()
    expect(await screen.findByText('bob')).toBeInTheDocument()
    expect(listUsers).toHaveBeenCalled()
  })

  it('keeps the users table in a horizontal scroll container on narrow viewports', async () => {
    const { container } = render(<AdminPage />)
    expect(await screen.findByText('bob')).toBeInTheDocument()
    const table = container.querySelector('table')
    expect(table).not.toBeNull()
    expect(table?.parentElement).toHaveClass('overflow-x-auto')
    expect(table).toHaveClass('min-w-[560px]')
  })

  it('redirects non-superusers home', async () => {
    ;(useAuth as ReturnType<typeof vi.fn>).mockReturnValue({
      user: {
        id: 2,
        username: 'alice',
        email: 'alice@example.com',
        is_superuser: false,
        video_count: 0,
        max_video_upload_size_mb: 500,
      },
      isLoading: false,
      refetch: vi.fn(),
    })

    render(<AdminPage />)

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith('/')
    })
    expect(listUsers).not.toHaveBeenCalled()
  })

  it('saves flags, quota and usage from the edit dialog', async () => {
    render(<AdminPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'admin.users.edit' }))

    const staffCheckbox = await screen.findByLabelText('admin.users.fields.isStaff')
    await waitFor(() => {
      expect(staffCheckbox).not.toBeChecked()
    })
    fireEvent.click(staffCheckbox)

    const uploadInput = await screen.findByLabelText('admin.users.fields.maxUploadMb')
    await waitFor(() => {
      expect(uploadInput).toHaveValue('500')
    })
    fireEvent.change(uploadInput, { target: { value: '750' } })
    fireEvent.change(screen.getByLabelText('admin.users.fields.usedStorageBytes'), { target: { value: '2048' } })
    fireEvent.click(screen.getByRole('button', { name: 'admin.users.save' }))

    await waitFor(() => {
      expect(patchFlags).toHaveBeenCalledWith({
        id: 9,
        is_staff: true,
      })
      expect(patchQuota).toHaveBeenCalledWith({
        id: 9,
        max_video_upload_size_mb: 750,
      })
      expect(patchUsage).toHaveBeenCalledWith({
        id: 9,
        used_storage_bytes: 2048,
      })
    })
    expect(
      await screen.findByText((content) => content.includes('admin.users.saveSuccess')),
    ).toBeInTheDocument()
    await waitFor(() => expect(listUsers).toHaveBeenCalledTimes(2))
  })

  it('closes an unchanged edit without updating or reloading the user', async () => {
    render(<AdminPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'admin.users.edit' }))
    // Equivalent numeric input must also remain a no-op.
    fireEvent.change(screen.getByLabelText('admin.users.fields.maxUploadMb'), { target: { value: ' 0500 ' } })
    fireEvent.click(screen.getByRole('button', { name: 'admin.users.save' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(patchFlags).not.toHaveBeenCalled()
    expect(patchQuota).not.toHaveBeenCalled()
    expect(patchUsage).not.toHaveBeenCalled()
    expect(listUsers).toHaveBeenCalledTimes(1)
  })

  it.each(['flags', 'usage'])('preserves plan quotas and unrelated values when editing only %s', async section => {
    render(<AdminPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'admin.users.edit' }))
    if (section === 'flags') fireEvent.click(screen.getByLabelText('admin.users.fields.isStaff'))
    else fireEvent.change(screen.getByLabelText('admin.users.fields.usedAiAnswers'), { target: { value: '0' } })
    fireEvent.click(screen.getByRole('button', { name: 'admin.users.save' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(patchQuota).not.toHaveBeenCalled()
    if (section === 'flags') {
      expect(patchFlags).toHaveBeenCalledExactlyOnceWith({ id: 9, is_staff: true })
      expect(patchUsage).not.toHaveBeenCalled()
    } else {
      expect(patchUsage).toHaveBeenCalledExactlyOnceWith({ id: 9, used_ai_answers: 0 })
      expect(patchFlags).not.toHaveBeenCalled()
    }
    expect(listUsers).toHaveBeenCalledTimes(2)
  })

  it('sends only the changed quota, including null for an unlimited value', async () => {
    render(<AdminPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'admin.users.edit' }))
    fireEvent.change(screen.getByLabelText('admin.users.fields.storageLimitGb'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'admin.users.save' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(patchQuota).toHaveBeenCalledExactlyOnceWith({ id: 9, storage_limit_gb: null })
    expect(patchFlags).not.toHaveBeenCalled()
    expect(patchUsage).not.toHaveBeenCalled()
  })

  it('refreshes partial saves and retries only changes that were not saved', async () => {
    let currentUser = { ...sampleUser }
    listUsers.mockImplementation(async () => ({ data: [currentUser], meta: { total: 1, limit: 20, offset: 0 } }))
    patchFlags.mockImplementation(async patch => {
      // Usage can advance independently while an administrator edits flags.
      currentUser = { ...currentUser, ...patch, used_ai_answers: 3 }
      return currentUser
    })
    patchQuota.mockRejectedValueOnce(new Error('Quota update failed'))

    render(<AdminPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'admin.users.edit' }))
    fireEvent.click(screen.getByLabelText('admin.users.fields.isStaff'))
    fireEvent.change(screen.getByLabelText('admin.users.fields.maxUploadMb'), { target: { value: '750' } })
    fireEvent.click(screen.getByRole('button', { name: 'admin.users.save' }))

    expect(await screen.findByText('Quota update failed')).toBeInTheDocument()
    expect(listUsers).toHaveBeenCalledTimes(2)
    expect(screen.getByText('admin.users.flags.staff')).toBeInTheDocument()
    expect(screen.getByLabelText('admin.users.fields.maxUploadMb')).toHaveValue('750')
    expect(patchUsage).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'admin.users.save' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(patchFlags).toHaveBeenCalledExactlyOnceWith({ id: 9, is_staff: true })
    expect(patchQuota).toHaveBeenCalledTimes(2)
    expect(patchQuota).toHaveBeenLastCalledWith({ id: 9, max_video_upload_size_mb: 750 })
    expect(patchUsage).not.toHaveBeenCalled()
    expect(currentUser.used_ai_answers).toBe(3)
    expect(listUsers).toHaveBeenCalledTimes(3)
  })

  it('validates all input before changing any user fields', async () => {
    render(<AdminPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'admin.users.edit' }))
    fireEvent.click(screen.getByLabelText('admin.users.fields.isStaff'))
    fireEvent.change(screen.getByLabelText('admin.users.fields.usedStorageBytes'), { target: { value: '-1' } })
    fireEvent.click(screen.getByRole('button', { name: 'admin.users.save' }))

    expect(await screen.findByText('admin.users.errors.invalidUsage')).toBeInTheDocument()
    expect(patchFlags).not.toHaveBeenCalled()
    expect(patchQuota).not.toHaveBeenCalled()
    expect(patchUsage).not.toHaveBeenCalled()
    expect(listUsers).toHaveBeenCalledTimes(1)
  })

  it('keeps inputs and closing disabled until saving and refetching finish', async () => {
    let finishSave!: (value: typeof sampleUser) => void
    let finishReload!: (value: { data: typeof sampleUser[]; meta: { total: number; limit: number; offset: number } }) => void
    patchFlags.mockImplementation(() => new Promise(resolve => { finishSave = resolve }))
    render(<AdminPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'admin.users.edit' }))
    fireEvent.click(screen.getByLabelText('admin.users.fields.isStaff'))
    fireEvent.click(screen.getByRole('button', { name: 'admin.users.save' }))
    await waitFor(() => expect(finishSave).toBeDefined())
    try {
      expect(screen.getByLabelText('admin.users.fields.isStaff')).toBeDisabled()
      expect(screen.getByLabelText('admin.users.fields.maxUploadMb')).toBeDisabled()
      expect(screen.getByRole('button', { name: 'admin.users.cancel' })).toBeDisabled()
      listUsers.mockImplementation(() => new Promise(resolve => { finishReload = resolve }))
      await act(async () => finishSave({ ...sampleUser, is_staff: true }))
      await waitFor(() => expect(finishReload).toBeDefined())
      expect(screen.getByLabelText('admin.users.fields.usedAiAnswers')).toBeDisabled()
      expect(screen.getByRole('button', { name: 'admin.users.cancel' })).toBeDisabled()
    } finally {
      await act(async () => {
        finishSave({ ...sampleUser, is_staff: true })
        finishReload?.({ data: [sampleUser], meta: { total: 1, limit: 20, offset: 0 } })
      })
    }
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('enqueues a full embedding reindex', async () => {
    reindexAll.mockResolvedValue({
      job_id: 'job-123',
    })

    render(<AdminPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'admin.reindex.button' }))
    fireEvent.click(await screen.findByRole('button', { name: 'admin.reindex.confirm' }))

    await waitFor(() => {
      expect(reindexAll).toHaveBeenCalled()
    })
    expect(
      await screen.findByText((content) => content.includes('admin.reindex.success')),
    ).toBeInTheDocument()
  })

  it('shows the server message from a failed tRPC mutation', async () => {
    reindexAll.mockRejectedValueOnce(new Error('A reindex is already running'))
    render(<AdminPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'admin.reindex.button' }))
    fireEvent.click(await screen.findByRole('button', { name: 'admin.reindex.confirm' }))
    expect(await screen.findByText('A reindex is already running')).toBeInTheDocument()
    expect(screen.queryByText('admin.reindex.error')).not.toBeInTheDocument()
  })

  it('marks queued deletion without hiding a user that is still included in server pagination', async () => {
    deleteUser.mockResolvedValue({
      job_id: 'job-del',
    })

    render(<AdminPage />)
    expect(await screen.findByText('bob')).toBeInTheDocument()
    fireEvent.click(await screen.findByRole('button', { name: 'admin.users.delete' }))
    expect(screen.getByText('admin.users.deleteBody')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'admin.users.deleteConfirm' }))

    await waitFor(() => {
      expect(deleteUser).toHaveBeenCalledWith({ id: 9 })
    })
    expect(
      await screen.findByText((content) => content.includes('admin.users.deleteSuccess')),
    ).toBeInTheDocument()
    expect(await screen.findByText('admin.users.deletionPending')).toBeInTheDocument()
    expect(screen.getByText('bob')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'admin.users.edit' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'admin.users.delete' })).toBeDisabled()
    expect(screen.getByText('admin.users.pageRange {"from":1,"to":1,"total":1}')).toBeInTheDocument()
    await waitFor(() => expect(listUsers).toHaveBeenCalledTimes(2))
  })

  it('does not subtract queued deletions from another search and keeps the next page reachable', async () => {
    const otherUser = { ...sampleUser, id: 10, username: 'alice', email: 'alice@example.com' }
    listUsers.mockImplementation(async ({ q, offset }) => ({
      data: q === 'alice' ? [otherUser] : [sampleUser],
      meta: { total: q === 'alice' ? 21 : 1, limit: 20, offset },
    }))
    deleteUser.mockResolvedValue({ job_id: 'job-del' })
    render(<AdminPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'admin.users.delete' }))
    fireEvent.click(screen.getByRole('button', { name: 'admin.users.deleteConfirm' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    fireEvent.change(screen.getByLabelText('admin.users.searchLabel'), { target: { value: 'alice' } })
    fireEvent.click(screen.getByRole('button', { name: 'admin.users.search' }))
    expect(await screen.findByText('alice')).toBeInTheDocument()
    expect(screen.getByText('admin.users.pageRange {"from":1,"to":20,"total":21}')).toBeInTheDocument()
    expect(screen.queryByText('admin.users.deletionPending')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'admin.users.next' }))
    await waitFor(() => expect(listUsers).toHaveBeenCalledWith({ q: 'alice', limit: 20, offset: 20 }))
  })

  it('uses the new server count after a deletion completes without subtracting it twice', async () => {
    const otherUser = { ...sampleUser, id: 10, username: 'alice' }
    let deleted = false
    listUsers.mockImplementation(async () => ({
      data: deleted ? [otherUser] : [sampleUser, otherUser],
      meta: { total: deleted ? 1 : 2, limit: 20, offset: 0 },
    }))
    deleteUser.mockImplementation(async () => {
      deleted = true
      return { job_id: 'job-del' }
    })
    render(<AdminPage />)
    const row = (await screen.findByText('bob')).closest('tr')!
    fireEvent.click(within(row).getByRole('button', { name: 'admin.users.delete' }))
    fireEvent.click(screen.getByRole('button', { name: 'admin.users.deleteConfirm' }))
    await waitFor(() => expect(screen.queryByText('bob')).not.toBeInTheDocument())
    expect(screen.getByText('alice')).toBeInTheDocument()
    expect(screen.getByText('admin.users.pageRange {"from":1,"to":1,"total":1}')).toBeInTheDocument()
  })

  it('returns to the last available page when deletion empties the current page', async () => {
    let deleted = false
    listUsers.mockImplementation(async ({ offset }) => ({
      data: offset === 20 && deleted ? [] : [sampleUser],
      meta: { total: deleted ? 20 : 21, limit: 20, offset },
    }))
    deleteUser.mockImplementation(async () => {
      deleted = true
      return { job_id: 'job-del' }
    })
    render(<AdminPage />)
    await screen.findByText('bob')
    fireEvent.click(screen.getByRole('button', { name: 'admin.users.next' }))
    await screen.findByText('admin.users.pageRange {"from":21,"to":21,"total":21}')
    fireEvent.click(screen.getByRole('button', { name: 'admin.users.delete' }))
    fireEvent.click(screen.getByRole('button', { name: 'admin.users.deleteConfirm' }))
    expect(await screen.findByText('admin.users.pageRange {"from":1,"to":20,"total":20}')).toBeInTheDocument()
    expect(listUsers).toHaveBeenLastCalledWith({ limit: 20, offset: 0 })
  })

  it('keeps the user actionable and the count unchanged after a deletion error', async () => {
    deleteUser.mockRejectedValueOnce(new Error('Deletion could not be queued'))
    render(<AdminPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'admin.users.delete' }))
    fireEvent.click(screen.getByRole('button', { name: 'admin.users.deleteConfirm' }))
    await screen.findByText('Deletion could not be queued')
    expect(screen.getByText('bob')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'admin.users.delete' })).toBeEnabled()
    expect(screen.queryByText('admin.users.deletionPending')).not.toBeInTheDocument()
    expect(screen.getByText('admin.users.pageRange {"from":1,"to":1,"total":1}')).toBeInTheDocument()
    expect(listUsers).toHaveBeenCalledTimes(1)
  })
})
