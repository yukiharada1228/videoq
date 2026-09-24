import { act, fireEvent, renderHook, screen, waitFor } from '@testing-library/react'
import type { VideoCourse } from '@/lib/api'
import { useShareLink } from '../useShareLink'
import { QueryObserver, useQuery, useQueryClient } from '@tanstack/react-query'
import { trpc } from '@/lib/trpc'

const deleteShare = vi.fn()

const course: VideoCourse = {
  id: 1,
  name: 'Course',
  description: '',
  display_order: 0,
  videos: [],
  video_count: 0,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  share_slug: 'share-token',
}

function useCachedShareLink() {
  const { data } = useQuery(trpc.courses.get.queryOptions({ id: course.id }, {
    initialData: course,
    staleTime: Infinity,
  }))
  return useShareLink(data ?? null)
}

describe('useShareLink', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    deleteShare.mockReset()
    globalThis.__setTrpcHandler('courses.deleteShare', deleteShare)
    Object.defineProperty(window, 'isSecureContext', {
      configurable: true,
      value: true,
    })
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: vi.fn(),
      },
    })
  })

  afterEach(() => vi.useRealTimers())

  it('uses the shared confirm dialog before disabling a share link', async () => {
    deleteShare.mockResolvedValue({ success: true })
    const { result } = renderHook(useCachedShareLink)

    act(() => {
      void result.current.deleteShareLink()
    })

    expect(await screen.findByRole('dialog', { name: 'confirmations.disableShareLink' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'common.actions.disable' }))

    await waitFor(() => {
      expect(deleteShare).toHaveBeenCalledWith({ id: 1 })
      expect(result.current.shareLink).toBeNull()
    })
  })

  it('updates the URL from the course cache after creating a share link', async () => {
    globalThis.__setTrpcHandler('courses.createShare', () => ({ share_slug: 'new-link' }))
    const { result } = renderHook(useCachedShareLink)
    await act(() => result.current.generateShareLink('new-link'))
    await waitFor(() => expect(result.current.shareLink).toContain('/share/new-link'))
  })

  it('deduplicates creation and blocks disabling until the cache update finishes', async () => {
    let finish!: (value: { share_slug: string }) => void
    const createShare = vi.fn(() => new Promise(resolve => { finish = resolve }))
    globalThis.__setTrpcHandler('courses.createShare', createShare)
    const { result } = renderHook(useCachedShareLink)
    let creation!: Promise<void>
    act(() => {
      creation = result.current.generateShareLink('new-link')
      void result.current.generateShareLink('other-link')
      void result.current.deleteShareLink()
    })
    await waitFor(() => expect(createShare).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await act(async () => {
      finish({ share_slug: 'new-link' })
      await creation
    })
    await waitFor(() => expect(result.current.shareLink).toContain('/share/new-link'))
    expect(deleteShare).not.toHaveBeenCalled()
  })

  it('keeps the deletion pending and blocks conflicting requests until it completes', async () => {
    let finish!: (value: { success: boolean }) => void
    deleteShare.mockImplementation(() => new Promise(resolve => { finish = resolve }))
    const createShare = vi.fn(() => ({ share_slug: 'wrong-link' }))
    globalThis.__setTrpcHandler('courses.createShare', createShare)
    const { result } = renderHook(useCachedShareLink)
    let deletion!: Promise<void>
    act(() => { deletion = result.current.deleteShareLink() })
    fireEvent.click(await screen.findByRole('button', { name: 'common.actions.disable' }))
    await waitFor(() => expect(deleteShare).toHaveBeenCalledTimes(1))
    expect(result.current.isDeletingLink).toBe(true)
    await act(async () => {
      await result.current.generateShareLink('wrong-link')
      await result.current.deleteShareLink()
    })
    expect(createShare).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await act(async () => { finish({ success: true }); await deletion })
    await waitFor(() => expect(result.current.isDeletingLink).toBe(false))
    expect(result.current.shareLink).toBeNull()
  })

  it('uses one confirmation for repeated deletion and releases the guard on cancellation', async () => {
    const createShare = vi.fn(() => ({ share_slug: 'new-link' }))
    globalThis.__setTrpcHandler('courses.createShare', createShare)
    const { result } = renderHook(useCachedShareLink)
    let first!: Promise<void>
    let second!: Promise<void>
    act(() => {
      first = result.current.deleteShareLink()
      second = result.current.deleteShareLink()
    })
    fireEvent.click(await screen.findByRole('button', { name: 'common.actions.cancel' }))
    await act(async () => { await first; await second })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(deleteShare).not.toHaveBeenCalled()
    await act(() => result.current.generateShareLink('new-link'))
    expect(createShare).toHaveBeenCalledTimes(1)
  })

  it.each(['create', 'delete'] as const)('allows retry after share %s fails', async operation => {
    const handler = vi.fn().mockRejectedValueOnce(new Error('Temporary failure')).mockResolvedValue(
      operation === 'create' ? { share_slug: 'new-link' } : { success: true },
    )
    globalThis.__setTrpcHandler(`courses.${operation}Share`, handler)
    const { result } = renderHook(useCachedShareLink)
    for (let attempt = 0; attempt < 2; attempt += 1) {
      let action!: Promise<void>
      act(() => { action = operation === 'create' ? result.current.generateShareLink('new-link') : result.current.deleteShareLink() })
      if (operation === 'delete') fireEvent.click(await screen.findByRole('button', { name: 'common.actions.disable' }))
      await act(() => action)
    }
    expect(handler).toHaveBeenCalledTimes(2)
    await waitFor(() => expect(result.current.shareLink).toBe(operation === 'create' ? `${window.location.origin}/share/new-link` : null))
  })

  it.each(['create', 'delete'] as const)('keeps share %s pending until stale detail requests are cancelled', async operation => {
    const createShare = vi.fn(() => ({ share_slug: 'new-link' }))
    globalThis.__setTrpcHandler('courses.createShare', createShare)
    deleteShare.mockResolvedValue({ success: true })
    const { result } = renderHook(() => ({ client: useQueryClient(), share: useCachedShareLink() }))
    let finishCacheUpdate!: () => void
    const cancel = vi.spyOn(result.current.client, 'cancelQueries').mockImplementationOnce(
      () => new Promise(resolve => { finishCacheUpdate = resolve }),
    )
    let action!: Promise<void>
    act(() => {
      action = operation === 'create'
        ? result.current.share.generateShareLink('new-link')
        : result.current.share.deleteShareLink()
    })
    if (operation === 'delete') fireEvent.click(await screen.findByRole('button', { name: 'common.actions.disable' }))
    await waitFor(() => expect(finishCacheUpdate).toBeDefined())
    const isPending = () => operation === 'create' ? result.current.share.isGeneratingLink : result.current.share.isDeletingLink
    expect(isPending()).toBe(true)
    await act(() => result.current.share.generateShareLink('conflicting-link'))
    expect(createShare).toHaveBeenCalledTimes(operation === 'create' ? 1 : 0)
    await act(async () => { finishCacheUpdate(); await action })
    await waitFor(() => expect(isPending()).toBe(false))
    cancel.mockRestore()
  })

  it.each(['create', 'delete'] as const)('does not refetch unchanged course lists after share %s', async operation => {
    globalThis.__setTrpcHandler('courses.createShare', () => ({ share_slug: 'new-link' }))
    deleteShare.mockResolvedValue({ success: true })
    const { result } = renderHook(() => ({ client: useQueryClient(), share: useCachedShareLink() }))
    const keys = [
      trpc.courses.list.queryKey({ limit: 5 }),
      trpc.courses.list.infiniteQueryKey({ limit: 24 }),
    ]
    const fetches = keys.map(() => vi.fn(async () => ({ cached: true })))
    const unsubscribes = keys.map((queryKey, index) => {
      result.current.client.setQueryData(queryKey, { cached: true })
      return new QueryObserver(result.current.client, {
        queryKey,
        queryFn: fetches[index],
        staleTime: Infinity,
      }).subscribe(() => {})
    })
    try {
      let action!: Promise<void>
      act(() => {
        action = operation === 'create'
          ? result.current.share.generateShareLink('new-link')
          : result.current.share.deleteShareLink()
      })
      if (operation === 'delete') {
        fireEvent.click(await screen.findByRole('button', { name: 'common.actions.disable' }))
      }
      await act(() => action)
      await waitFor(() => {
        if (operation === 'create') expect(result.current.share.shareLink).toContain('/share/new-link')
        else expect(result.current.share.shareLink).toBeNull()
      })
      for (const fetch of fetches) expect(fetch).not.toHaveBeenCalled()
      for (const queryKey of keys) expect(result.current.client.getQueryState(queryKey)?.isInvalidated).toBe(false)
    } finally {
      unsubscribes.forEach(unsubscribe => unsubscribe())
    }
  })

  it.each(['create', 'delete'] as const)('reports share %s failures and preserves the existing URL', async (operation) => {
    globalThis.__setTrpcHandler(`courses.${operation}Share`, () => { throw new Error('Sharing unavailable') })
    const { result } = renderHook(useCachedShareLink)
    let action!: Promise<void>
    act(() => {
      action = operation === 'create'
        ? result.current.generateShareLink('new-link')
        : result.current.deleteShareLink()
    })
    if (operation === 'delete') {
      fireEvent.click(await screen.findByRole('button', { name: 'common.actions.disable' }))
    }
    await act(() => action)
    expect(screen.getByRole('alert')).toHaveTextContent('Sharing unavailable')
    expect(result.current.shareLink).toContain('/share/share-token')
  })

  it.each(['create', 'delete'] as const)('keeps the saved URL when an earlier detail request finishes after share %s', async operation => {
    let finishRead!: (value: VideoCourse) => void
    globalThis.__setTrpcHandler('courses.get', () => new Promise(resolve => { finishRead = resolve }))
    globalThis.__setTrpcHandler('courses.createShare', () => ({ share_slug: 'new-link' }))
    deleteShare.mockResolvedValue({ success: true })
    const { result } = renderHook(() => ({ client: useQueryClient(), share: useCachedShareLink() }))
    let read!: Promise<void>
    act(() => { read = result.current.client.refetchQueries(trpc.courses.get.queryFilter({ id: course.id })) })
    await waitFor(() => expect(finishRead).toBeDefined())
    let action!: Promise<void>
    act(() => {
      action = operation === 'create'
        ? result.current.share.generateShareLink('new-link')
        : result.current.share.deleteShareLink()
    })
    if (operation === 'delete') {
      fireEvent.click(await screen.findByRole('button', { name: 'common.actions.disable' }))
    }
    await act(() => action)
    await act(async () => {
      finishRead(course)
      await read
    })
    expect(result.current.client.getQueryData(trpc.courses.get.queryKey({ id: course.id }))?.share_slug)
      .toBe(operation === 'create' ? 'new-link' : null)
    await waitFor(() => {
      if (operation === 'create') expect(result.current.share.shareLink).toContain('/share/new-link')
      else expect(result.current.share.shareLink).toBeNull()
    })
  })

  it('does not replace another course URL when an earlier creation finishes', async () => {
    let finish!: (value: { share_slug: string }) => void
    globalThis.__setTrpcHandler('courses.createShare', () => new Promise(resolve => { finish = resolve }))
    const { result, rerender } = renderHook(({ currentCourse }) => useShareLink(currentCourse), {
      initialProps: { currentCourse: course },
    })
    let creation!: Promise<void>
    act(() => { creation = result.current.generateShareLink('new-link') })
    await waitFor(() => expect(finish).toBeDefined())
    rerender({ currentCourse: { ...course, id: 2, share_slug: 'second-course' } })
    await act(async () => {
      finish({ share_slug: 'new-link' })
      await creation
    })
    expect(result.current.shareLink).toContain('/share/second-course')
  })

  it('keeps the copied indication for two seconds after the latest copy', async () => {
    vi.useFakeTimers()
    const { result } = renderHook(() => useShareLink(course))
    await act(() => result.current.copyShareLink())
    await act(() => vi.advanceTimersByTimeAsync(1500))
    await act(() => result.current.copyShareLink())
    await act(() => vi.advanceTimersByTimeAsync(500))
    expect(result.current.isCopied).toBe(true)
    await act(() => vi.advanceTimersByTimeAsync(1500))
    expect(result.current.isCopied).toBe(false)
  })

  it('releases the copy timer on unmount', async () => {
    vi.useFakeTimers()
    const { result, unmount } = renderHook(() => useShareLink(course))
    const beforeCopy = vi.getTimerCount()
    await act(() => result.current.copyShareLink())
    expect(vi.getTimerCount()).toBe(beforeCopy + 1)
    unmount()
    expect(vi.getTimerCount()).toBe(beforeCopy)
  })

  it('does not schedule a timer if copying completes after unmount', async () => {
    vi.useFakeTimers()
    let finishCopy!: () => void
    vi.mocked(navigator.clipboard.writeText).mockImplementation(() => new Promise(resolve => { finishCopy = resolve }))
    const { result, unmount } = renderHook(() => useShareLink(course))
    const beforeCopy = vi.getTimerCount()
    let copy!: Promise<void>
    act(() => { copy = result.current.copyShareLink() })
    unmount()
    await act(async () => {
      finishCopy()
      await copy
    })
    expect(vi.getTimerCount()).toBe(beforeCopy)
  })

  it('removes the fallback textarea even if the copy command throws', async () => {
    Object.defineProperty(window, 'isSecureContext', { configurable: true, value: false })
    const original = Object.getOwnPropertyDescriptor(document, 'execCommand')
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: vi.fn(() => { throw new Error('Copy not supported') }),
    })
    try {
      const { result } = renderHook(() => useShareLink(course))
      await act(() => result.current.copyShareLink())
      expect(document.querySelector('textarea')).toBeNull()
      expect(screen.getByRole('alert')).toHaveTextContent('common.messages.copyFailed')
    } finally {
      if (original) Object.defineProperty(document, 'execCommand', original)
      else Reflect.deleteProperty(document, 'execCommand')
    }
  })

  it('shows a toast when copying the share link fails', async () => {
    const clipboard = navigator.clipboard as { writeText: ReturnType<typeof vi.fn> }
    clipboard.writeText.mockRejectedValue(new Error('copy failed'))
    const { result } = renderHook(() => useShareLink(course))

    await waitFor(() => {
      expect(result.current.shareLink).toContain('/share/share-token')
    })

    await act(async () => {
      await result.current.copyShareLink()
    })

    expect(await screen.findByRole('alert')).toHaveTextContent('common.messages.copyFailed')
  })
})
