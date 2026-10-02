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

  it('groups user identity, status, quota units and actions in the same row', async () => {
    render(<AdminPage />)
    const username = await screen.findByText('bob')
    const row = within(username.closest('tr')!)
    const identity = row.getByRole('rowheader', { name: /bob@example.com/ })
    expect(identity).toHaveTextContent('bob')
    expect(identity).toHaveTextContent('admin.users.columns.id: 9')
    expect(row.getByText('admin.users.flags.active')).toBeInTheDocument()
    expect(row.getByText('500 MB')).toBeInTheDocument()
    expect(row.getByText('10 GB')).toBeInTheDocument()
    expect(row.getByRole('button', { name: 'admin.users.edit' })).toBeEnabled()
    expect(row.getByRole('button', { name: 'admin.users.delete' })).toBeEnabled()
    expect(row.getByRole('button', { name: 'admin.users.edit' })).toHaveAccessibleDescription('bob bob@example.com')
    expect(row.getByRole('button', { name: 'admin.users.delete' })).toHaveAccessibleDescription('bob bob@example.com')
  })

  it('announces loading and empty search results through the same status region', async () => {
    let finishLoading!: (value: { data: typeof sampleUser[]; meta: { total: number; limit: number; offset: number } }) => void
    listUsers.mockImplementation(() => new Promise(resolve => { finishLoading = resolve }))
    render(<AdminPage />)
    const status = screen.getByRole('status')
    expect(status).toHaveTextContent('common.messages.loading')
    await waitFor(() => expect(finishLoading).toBeDefined())
    await act(async () => finishLoading({ data: [], meta: { total: 0, limit: 20, offset: 0 } }))
    expect(screen.getByRole('status')).toBe(status)
    await waitFor(() => expect(status).toHaveTextContent('admin.users.empty'))
    expect(screen.getByRole('button', { name: 'admin.users.prev' })).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByRole('button', { name: 'admin.users.next' })).toHaveAttribute('aria-disabled', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'admin.users.next' }))
    expect(listUsers).toHaveBeenCalledTimes(1)
  })

  it('retries a failed list request when the same search is submitted again', async () => {
    listUsers.mockRejectedValueOnce(new Error('Temporarily unavailable'))
    render(<AdminPage />)
    await screen.findByText('admin.users.loadError')
    fireEvent.click(screen.getByRole('button', { name: 'admin.users.search' }))
    expect(await screen.findByText('bob')).toBeInTheDocument()
    expect(listUsers).toHaveBeenCalledTimes(2)
    expect(listUsers).toHaveBeenLastCalledWith({ limit: 20, offset: 0 })
  })

  it('announces a background refresh without hiding the cached user list', async () => {
    render(<AdminPage />)
    await screen.findByText('bob')
    let finishReload!: (value: { data: typeof sampleUser[]; meta: { total: number; limit: number; offset: number } }) => void
    listUsers.mockImplementation(() => new Promise(resolve => { finishReload = resolve }))
    const status = screen.getByRole('status')
    fireEvent.click(screen.getByRole('button', { name: 'admin.users.search' }))
    await waitFor(() => expect(finishReload).toBeDefined())
    try {
      expect(status).toHaveTextContent('common.messages.loading')
      expect(screen.getByText('bob')).toBeInTheDocument()
    } finally {
      await act(async () => finishReload({ data: [sampleUser], meta: { total: 1, limit: 20, offset: 0 } }))
    }
    await waitFor(() => expect(status).toHaveTextContent('admin.users.pageRange {"from":1,"to":1,"total":1}'))
  })

  it('keeps the latest search visible when an earlier search responds later', async () => {
    const alice = { ...sampleUser, id: 10, username: 'alice', email: 'alice@example.com' }
    let finishEarlierSearch!: (value: { data: typeof sampleUser[]; meta: { total: number; limit: number; offset: number } }) => void
    listUsers.mockImplementation(({ q }) => q === 'bob'
      ? new Promise(resolve => { finishEarlierSearch = resolve })
      : Promise.resolve({ data: q === 'alice' ? [alice] : [sampleUser], meta: { total: 1, limit: 20, offset: 0 } }))
    render(<AdminPage />)
    await screen.findByText('bob')
    const searchInput = screen.getByLabelText('admin.users.searchLabel')
    const searchButton = screen.getByRole('button', { name: 'admin.users.search' })
    fireEvent.change(searchInput, { target: { value: 'bob' } })
    fireEvent.click(searchButton)
    await waitFor(() => expect(finishEarlierSearch).toBeDefined())
    try {
      fireEvent.change(searchInput, { target: { value: 'alice' } })
      fireEvent.click(searchButton)
      expect(await screen.findByText('alice')).toBeInTheDocument()
    } finally {
      await act(async () => finishEarlierSearch({ data: [sampleUser], meta: { total: 41, limit: 20, offset: 0 } }))
    }
    expect(screen.getByText('alice')).toBeInTheDocument()
    expect(screen.queryByText('bob')).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('admin.users.pageRange {"from":1,"to":1,"total":1}')
    expect(screen.getByRole('button', { name: 'admin.users.next' })).toHaveAttribute('aria-disabled', 'true')
  })

  it('keeps saved flags visible when a pre-save list refresh responds later', async () => {
    render(<AdminPage />)
    await screen.findByText('bob')
    let finishEarlierRefresh!: (value: { data: typeof sampleUser[]; meta: { total: number; limit: number; offset: number } }) => void
    listUsers.mockImplementationOnce(() => new Promise(resolve => { finishEarlierRefresh = resolve }))
    fireEvent.click(screen.getByRole('button', { name: 'admin.users.search' }))
    await waitFor(() => expect(finishEarlierRefresh).toBeDefined())
    try {
      fireEvent.click(screen.getByRole('button', { name: 'admin.users.edit' }))
      fireEvent.click(screen.getByLabelText('admin.users.fields.isStaff'))
      listUsers.mockResolvedValue({ data: [{ ...sampleUser, is_staff: true }], meta: { total: 1, limit: 20, offset: 0 } })
      fireEvent.click(screen.getByRole('button', { name: 'admin.users.save' }))
      await screen.findByText('admin.users.saveSuccess')
      expect(screen.getByText('admin.users.flags.staff')).toBeInTheDocument()
    } finally {
      await act(async () => finishEarlierRefresh({ data: [sampleUser], meta: { total: 1, limit: 20, offset: 0 } }))
    }
    expect(screen.getByText('admin.users.flags.staff')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(patchFlags).toHaveBeenCalledExactlyOnceWith({ id: 9, is_staff: true })
    expect(listUsers).toHaveBeenCalledTimes(3)
  })

  it('preserves pagination controls while loading and lets users return after a page fails', async () => {
    let failPage!: (reason: Error) => void
    listUsers.mockImplementation(({ offset }) => offset === 0
      ? Promise.resolve({ data: [sampleUser], meta: { total: 41, limit: 20, offset } })
      : new Promise((_, reject) => { failPage = reject }))
    render(<AdminPage />)
    await screen.findByText('bob')
    const next = screen.getByRole('button', { name: 'admin.users.next' })
    next.focus()
    fireEvent.click(next)
    await waitFor(() => expect(failPage).toBeDefined())
    try {
      expect(screen.getByRole('button', { name: 'admin.users.next' })).toBe(next)
      expect(next).toHaveFocus()
      expect(next).toHaveAttribute('aria-disabled', 'true')
      fireEvent.click(next)
      expect(listUsers).toHaveBeenCalledTimes(2)
    } finally {
      await act(async () => failPage(new Error('Temporarily unavailable')))
    }
    await screen.findByText('admin.users.loadError')
    expect(next).toHaveFocus()
    const previous = screen.getByRole('button', { name: 'admin.users.prev' })
    expect(previous).toHaveAttribute('aria-disabled', 'false')
    previous.focus()
    fireEvent.click(previous)
    expect(await screen.findByText('bob')).toBeInTheDocument()
    expect(previous).toHaveFocus()
    expect(previous).toHaveAttribute('aria-disabled', 'true')
    expect(await screen.findByText('admin.users.pageRange {"from":1,"to":20,"total":41}')).toBeInTheDocument()
    await waitFor(() => expect(listUsers).toHaveBeenLastCalledWith({ limit: 20, offset: 0 }))
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

  it.each([
    ['usedStorageBytes', '-1', 'invalidUsage'],
    ['usedStorageBytes', '9007199254740992', 'invalidUsage'],
    ['usedStorageBytes', '', 'invalidUsage'],
    ['usedProcessingSeconds', '2147483648', 'invalidUsage'],
    ['usedAiAnswers', '2147483648', 'invalidUsage'],
    ['maxUploadMb', '2147483648', 'invalidUploadMb'],
    ['storageLimitGb', '-0.5', 'invalidStorageGb'],
    ['processingLimitMinutes', '-1', 'invalidProcessingMinutes'],
    ['processingLimitMinutes', '1.5', 'invalidProcessingMinutes'],
    ['processingLimitMinutes', '2147483648', 'invalidProcessingMinutes'],
    ['aiAnswersLimit', '-1', 'invalidAiLimit'],
    ['aiAnswersLimit', '1.5', 'invalidAiLimit'],
    ['aiAnswersLimit', '2147483648', 'invalidAiLimit'],
  ])('rejects %s=%s before changing any user fields', async (field, value, error) => {
    render(<AdminPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'admin.users.edit' }))
    fireEvent.click(screen.getByLabelText('admin.users.fields.isStaff'))
    fireEvent.change(screen.getByLabelText(`admin.users.fields.${field}`), { target: { value } })
    fireEvent.click(screen.getByRole('button', { name: 'admin.users.save' }))

    expect(await screen.findByText(`admin.users.errors.${error}`)).toBeInTheDocument()
    const invalidInput = screen.getByLabelText(`admin.users.fields.${field}`)
    expect(invalidInput).toHaveAttribute('aria-invalid', 'true')
    expect(invalidInput).toHaveAccessibleDescription(`admin.users.errors.${error}`)
    expect(invalidInput).toHaveFocus()
    expect(patchFlags).not.toHaveBeenCalled()
    expect(patchQuota).not.toHaveBeenCalled()
    expect(patchUsage).not.toHaveBeenCalled()
    expect(listUsers).toHaveBeenCalledTimes(1)
  })

  it('shows all invalid fields, advances focus after a correction and clears errors on reopening', async () => {
    render(<AdminPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'admin.users.edit' }))
    const upload = screen.getByLabelText('admin.users.fields.maxUploadMb')
    const storage = screen.getByLabelText('admin.users.fields.storageLimitGb')
    const usedAi = screen.getByLabelText('admin.users.fields.usedAiAnswers')
    fireEvent.change(upload, { target: { value: '0' } })
    fireEvent.change(storage, { target: { value: '-1' } })
    fireEvent.change(usedAi, { target: { value: '1.5' } })
    fireEvent.click(screen.getByRole('button', { name: 'admin.users.save' }))
    expect(upload).toHaveFocus()
    for (const [input, error] of [[upload, 'invalidUploadMb'], [storage, 'invalidStorageGb'], [usedAi, 'invalidUsage']] as const) {
      expect(input).toHaveAttribute('aria-invalid', 'true')
      expect(input).toHaveAccessibleDescription(`admin.users.errors.${error}`)
    }
    fireEvent.change(upload, { target: { value: '500' } })
    fireEvent.change(storage, { target: { value: '10' } })
    fireEvent.click(screen.getByRole('button', { name: 'admin.users.save' }))
    expect(usedAi).toHaveFocus()
    expect(upload).not.toHaveAttribute('aria-invalid')
    expect(storage).toHaveAccessibleDescription('admin.users.nullableHint')
    expect(patchQuota).not.toHaveBeenCalled()
    expect(patchUsage).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'admin.users.cancel' }))
    fireEvent.click(screen.getByRole('button', { name: 'admin.users.edit' }))
    expect(screen.getByLabelText('admin.users.fields.usedAiAnswers')).toHaveValue('2')
    expect(screen.getByLabelText('admin.users.fields.usedAiAnswers')).not.toHaveAttribute('aria-invalid')
    expect(screen.queryByText('admin.users.errors.invalidUsage')).not.toBeInTheDocument()
  })

  it('allows fractional storage quotas, zero limits and large safe byte counts', async () => {
    render(<AdminPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'admin.users.edit' }))
    for (const [field, value] of Object.entries({
      maxUploadMb: '2147483647', storageLimitGb: '0.5', processingLimitMinutes: '0',
      aiAnswersLimit: '', usedStorageBytes: '9007199254740991',
      usedProcessingSeconds: '2147483647', usedAiAnswers: '0',
    })) {
      fireEvent.change(screen.getByLabelText(`admin.users.fields.${field}`), { target: { value } })
    }
    fireEvent.click(screen.getByRole('button', { name: 'admin.users.save' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(patchQuota).toHaveBeenCalledExactlyOnceWith({ id: 9,
      max_video_upload_size_mb: 2147483647, storage_limit_gb: 0.5,
      processing_limit_minutes: 0, ai_answers_limit: null,
    })
    expect(patchUsage).toHaveBeenCalledExactlyOnceWith({ id: 9,
      used_storage_bytes: 9007199254740991, used_processing_seconds: 2147483647, used_ai_answers: 0,
    })
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
      expect(screen.getByRole('button', { name: 'admin.users.save' })).toHaveAttribute('aria-disabled', 'true')
      expect(screen.getByRole('button', { name: 'admin.users.save' })).toHaveAttribute('aria-busy', 'true')
      fireEvent.click(screen.getByRole('button', { name: 'admin.users.save' }))
      expect(patchFlags).toHaveBeenCalledTimes(1)
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

  it('returns focus to the list heading when a saved edit is followed by a list failure', async () => {
    render(<AdminPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'admin.users.edit' }))
    fireEvent.click(screen.getByLabelText('admin.users.fields.isStaff'))
    listUsers.mockRejectedValueOnce(new Error('Temporarily unavailable'))
    fireEvent.click(screen.getByRole('button', { name: 'admin.users.save' }))
    await screen.findByText('admin.users.saveSuccess')
    expect(screen.getByText('admin.users.loadError')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'admin.users.edit' })).not.toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('heading', { name: 'admin.users.title' })).toHaveFocus())
    expect(patchFlags).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'admin.users.search' }))
    expect(await screen.findByText('bob')).toBeInTheDocument()
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

  it.each([
    ['delete', 'admin.users.delete', 'admin.users.deleteConfirm'],
    ['reindex', 'admin.reindex.button', 'admin.reindex.confirm'],
  ])('keeps the %s action named and prevents closing while it is pending', async (action, openLabel, confirmLabel) => {
    let finishAction!: (value: { job_id: string }) => void
    const mutation = action === 'delete' ? deleteUser : reindexAll
    mutation.mockImplementation(() => new Promise(resolve => { finishAction = resolve }))
    render(<AdminPage />)
    fireEvent.click(await screen.findByRole('button', { name: openLabel }))
    fireEvent.click(screen.getByRole('button', { name: confirmLabel }))
    await waitFor(() => expect(finishAction).toBeDefined())
    try {
      const dialog = within(screen.getByRole('dialog'))
      expect(dialog.getByRole('button', { name: confirmLabel })).toHaveAttribute('aria-disabled', 'true')
      expect(dialog.getByRole('button', { name: confirmLabel })).toHaveAttribute('aria-busy', 'true')
      expect(dialog.getByRole('button', { name: 'admin.users.cancel' })).toBeDisabled()
      fireEvent.click(dialog.getByRole('button', { name: confirmLabel }))
      expect(mutation).toHaveBeenCalledTimes(1)
    } finally {
      await act(async () => finishAction({ job_id: 'pending-job' }))
    }
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
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
    expect(screen.queryByText('admin.users.flags.active')).not.toBeInTheDocument()
    expect(screen.getByText('bob')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'admin.users.edit' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'admin.users.delete' })).toBeDisabled()
    expect(screen.getByText('admin.users.pageRange {"from":1,"to":1,"total":1}')).toBeInTheDocument()
    await waitFor(() => expect(listUsers).toHaveBeenCalledTimes(2))
  })

  it('prevents opening another deletion until the previous deletion finishes refreshing the list', async () => {
    const otherUser = { ...sampleUser, id: 10, username: 'alice' }
    const response = { data: [sampleUser, otherUser], meta: { total: 2, limit: 20, offset: 0 } }
    let finishReload!: (value: typeof response) => void
    listUsers.mockResolvedValueOnce(response)
      .mockImplementation(() => new Promise(resolve => { finishReload = resolve }))
    deleteUser.mockResolvedValue({ job_id: 'job-del' })
    render(<AdminPage />)
    const bobRow = within((await screen.findByText('bob')).closest('tr')!)
    fireEvent.click(bobRow.getByRole('button', { name: 'admin.users.delete' }))
    fireEvent.click(screen.getByRole('button', { name: 'admin.users.deleteConfirm' }))
    await waitFor(() => expect(finishReload).toBeDefined())
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    const aliceDelete = within(screen.getByText('alice').closest('tr')!).getByRole('button', { name: 'admin.users.delete' })
    try {
      expect(aliceDelete).toBeDisabled()
      fireEvent.click(aliceDelete)
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    } finally {
      await act(async () => finishReload(response))
    }
    await waitFor(() => expect(aliceDelete).toBeEnabled())
    fireEvent.click(aliceDelete)
    expect(screen.getByRole('dialog')).toHaveAccessibleName('admin.users.deleteTitle {"username":"alice"}')
    expect(screen.getByRole('button', { name: 'admin.users.cancel' })).toBeEnabled()
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
    expect(screen.getByRole('heading', { name: 'admin.users.title' })).toHaveFocus()
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

  it('can revisit a cached empty page after the user count grows again', async () => {
    const firstUser = { ...sampleUser, id: 10, username: 'alice' }
    let total = 21
    let lastUser = sampleUser
    let delayLastPage = false
    let finishLastPage!: (value: { data: typeof sampleUser[]; meta: { total: number; limit: number; offset: number } }) => void
    listUsers.mockImplementation(async ({ offset }) => {
      if (offset === 20 && delayLastPage) return new Promise(resolve => { finishLastPage = resolve })
      return {
        data: offset === 0 ? [firstUser] : total > 20 ? [lastUser] : [],
        meta: { total, limit: 20, offset },
      }
    })
    deleteUser.mockImplementation(async () => {
      total = 20
      return { job_id: 'job-del' }
    })
    render(<AdminPage />)
    await screen.findByText('alice')
    fireEvent.click(screen.getByRole('button', { name: 'admin.users.next' }))
    fireEvent.click(await screen.findByRole('button', { name: 'admin.users.delete' }))
    fireEvent.click(screen.getByRole('button', { name: 'admin.users.deleteConfirm' }))
    await screen.findByText('admin.users.pageRange {"from":1,"to":20,"total":20}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    total = 21
    lastUser = { ...sampleUser, id: 11, username: 'charlie' }
    fireEvent.click(screen.getByRole('button', { name: 'admin.users.search' }))
    await screen.findByText('admin.users.pageRange {"from":1,"to":20,"total":21}')
    delayLastPage = true
    fireEvent.click(screen.getByRole('button', { name: 'admin.users.next' }))
    await waitFor(() => expect(finishLastPage).toBeDefined())
    try {
      expect(screen.getByRole('status')).toHaveTextContent('common.messages.loading')
      expect(screen.queryByText('admin.users.pageRange {"from":21,"to":20,"total":20}')).not.toBeInTheDocument()
    } finally {
      await act(async () => finishLastPage({ data: [lastUser], meta: { total, limit: 20, offset: 20 } }))
    }
    expect(await screen.findByText('charlie')).toBeInTheDocument()
    expect(screen.getByText('admin.users.pageRange {"from":21,"to":21,"total":21}')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'admin.users.prev' })).toHaveAttribute('aria-disabled', 'false')
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
