import { renderHook, act, waitFor } from '@testing-library/react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { Tag, Video } from '@videoq/trpc'
import { trpc } from '@/lib/trpc'

const trpcApi = vi.hoisted(() => ({
  listTags: vi.fn(),
  createTag: vi.fn(),
  deleteTag: vi.fn(),
}))

import { useTags } from '../useTags'

const tag = (fields: Partial<Tag> & Pick<Tag, 'id' | 'name' | 'color'>): Tag => ({
  created_at: '2023-01-01',
  video_count: 0,
  ...fields,
})

describe('useTags', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    globalThis.__setTrpcHandler('tags.list', async () => {
      const data = await trpcApi.listTags() as Tag[]
      return { data, meta: { total: data.length, limit: 100, offset: 0 } }
    })
    globalThis.__setTrpcHandler('tags.create', input => trpcApi.createTag(input))
    globalThis.__setTrpcHandler('tags.delete', input => trpcApi.deleteTag(input))
  })

  it('should initialize with empty tags array', async () => {
    trpcApi.listTags.mockResolvedValue([])
    const { result } = renderHook(() => useTags())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.tags).toEqual([])
    expect(result.current.error).toBeNull()
  })

  it('should load tags on mount', async () => {
    const mockTags = [
      tag({ id: 1, name: 'Tag 1', color: 'red' }),
      tag({ id: 2, name: 'Tag 2', color: 'green', created_at: '2023-01-02' }),
    ]
    trpcApi.listTags.mockResolvedValue(mockTags)

    const { result } = renderHook(() => useTags())

    await waitFor(() => {
      expect(result.current.tags).toEqual(mockTags)
      expect(result.current.isLoading).toBe(false)
    })
  })

  it('loads tags only when enabled and defers hidden refreshes until reopening', async () => {
    const oldTag = tag({ id: 1, name: 'Old', color: 'blue' })
    const newTag = tag({ id: 2, name: 'New', color: 'green' })
    trpcApi.listTags.mockResolvedValue([oldTag])
    const { result, rerender } = renderHook(({ enabled }) => ({
      tags: useTags({ enabled }), client: useQueryClient(),
    }), { initialProps: { enabled: false } })
    expect(result.current.tags.isLoading).toBe(false)
    expect(trpcApi.listTags).not.toHaveBeenCalled()

    rerender({ enabled: true })
    await waitFor(() => expect(result.current.tags.tags).toEqual([oldTag]))
    rerender({ enabled: false })
    trpcApi.listTags.mockResolvedValue([oldTag, newTag])
    await act(() => result.current.client.invalidateQueries(trpc.tags.list.pathFilter()))
    expect(trpcApi.listTags).toHaveBeenCalledTimes(1)

    rerender({ enabled: true })
    await waitFor(() => expect(result.current.tags.tags).toEqual([newTag, oldTag]))
    expect(trpcApi.listTags).toHaveBeenCalledTimes(2)
  })

  it('should create a tag', async () => {
    const mockTag = tag({
      id: 3,
      name: 'New Tag',
      color: 'blue',
      created_at: '2023-01-03',
    })
    trpcApi.createTag.mockResolvedValue(mockTag)
    trpcApi.listTags.mockResolvedValue([])

    const { result } = renderHook(() => useTags())

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    await act(async () => {
      await result.current.createTag('New Tag', 'blue')
    })

    expect(trpcApi.createTag).toHaveBeenCalledWith({ name: 'New Tag', color: 'blue' })
    await waitFor(() => {
      expect(result.current.tags).toContainEqual(mockTag)
    })
    expect(trpcApi.listTags).toHaveBeenCalledTimes(1)
  })

  it.each([100, 205])('loads all %s tags once for concurrent consumers without fetching an empty extra page', async total => {
    const tags = Array.from({ length: total }, (_, index) =>
      tag({ id: index + 1, name: `Tag ${String(index + 1).padStart(3, '0')}`, color: 'blue' }))
    const list = vi.fn((input: unknown) => {
      const { limit, offset } = input as { limit: number; offset: number }
      return { data: tags.slice(offset, offset + limit), meta: { total, limit, offset } }
    })
    globalThis.__setTrpcHandler('tags.list', list)
    const { result } = renderHook(() => ({ first: useTags(), second: useTags() }))

    await waitFor(() => expect(result.current.first.tags).toEqual(tags))
    expect(result.current.second.tags).toEqual(tags)
    expect(list.mock.calls.map(([input]) => input)).toEqual(
      Array.from({ length: Math.ceil(total / 100) }, (_, page) => ({ limit: 100, offset: page * 100 })),
    )
  })

  it('keeps the complete list separate from a cached API page', async () => {
    const firstTag = tag({ id: 1, name: 'A', color: 'blue' })
    const secondTag = tag({ id: 2, name: 'B', color: 'blue' })
    const list = vi.fn((input: unknown) => {
      const { limit, offset } = input as { limit: number; offset: number }
      return { data: offset === 0 ? [firstTag] : [secondTag], meta: { total: 2, limit, offset } }
    })
    globalThis.__setTrpcHandler('tags.list', list)
    const { result } = renderHook(() => ({
      tags: useTags(),
      page: useQuery(trpc.tags.list.queryOptions({ limit: 100, offset: 0 }, { staleTime: Infinity })),
    }))

    await waitFor(() => expect(result.current.tags.tags).toEqual([firstTag, secondTag]))
    expect(result.current.page.data?.data).toEqual([firstTag])
    expect(result.current.page.data?.meta.total).toBe(2)
  })

  it('keeps tag names ordered after creation and a later refetch', async () => {
    const oldTag = tag({ id: 1, name: 'Zoo', color: 'blue' })
    const newTag = tag({ id: 2, name: 'Apple', color: 'green' })
    trpcApi.listTags.mockResolvedValue([oldTag])
    trpcApi.createTag.mockResolvedValue(newTag)
    const { result } = renderHook(() => ({ tags: useTags(), client: useQueryClient() }))
    await waitFor(() => expect(result.current.tags.tags).toEqual([oldTag]))

    await act(() => result.current.tags.createTag('Apple', 'green'))

    await waitFor(() => expect(result.current.tags.tags).toEqual([newTag, oldTag]))
    expect(trpcApi.listTags).toHaveBeenCalledTimes(1)
    trpcApi.listTags.mockResolvedValue([oldTag, newTag])
    await act(() => result.current.client.invalidateQueries(trpc.tags.list.pathFilter()))
    await waitFor(() => expect(result.current.tags.tags).toEqual([newTag, oldTag]))
  })

  it('deduplicates tags shifted between pages by a concurrent insertion', async () => {
    const firstTag = tag({ id: 1, name: 'A', color: 'blue' })
    const lastTag = tag({ id: 2, name: 'B', color: 'blue' })
    const list = vi.fn((input: unknown) => {
      const { limit, offset } = input as { limit: number; offset: number }
      return { data: offset === 0 ? [firstTag] : [firstTag, lastTag], meta: { total: 3, limit, offset } }
    })
    globalThis.__setTrpcHandler('tags.list', list)
    const { result } = renderHook(useTags)

    await waitFor(() => expect(result.current.tags).toEqual([firstTag, lastTag]))
    expect(list).toHaveBeenCalledTimes(2)
  })

  it('stops when a page becomes empty after concurrent deletion', async () => {
    const firstTag = tag({ id: 1, name: 'A', color: 'blue' })
    const list = vi.fn((input: unknown) => {
      const { limit, offset } = input as { limit: number; offset: number }
      return { data: offset === 0 ? [firstTag] : [], meta: { total: 2, limit, offset } }
    })
    globalThis.__setTrpcHandler('tags.list', list)
    const { result } = renderHook(useTags)

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.tags).toEqual([firstTag])
    expect(list).toHaveBeenCalledTimes(2)
  })

  it('reports later-page failures without caching an incomplete list', async () => {
    const firstTag = tag({ id: 1, name: 'A', color: 'blue' })
    globalThis.__setTrpcHandler('tags.list', input => {
      const { limit, offset } = input as { limit: number; offset: number }
      if (offset > 0) throw new Error('Next page failed')
      return { data: [firstTag], meta: { total: 2, limit, offset } }
    })
    const { result } = renderHook(useTags)

    await waitFor(() => expect(result.current.error).toBe('Next page failed'))
    expect(result.current.tags).toEqual([])
    expect(result.current.isLoading).toBe(false)
  })

  it('should delete a tag', async () => {
    const initialTags = [
      tag({ id: 1, name: 'Tag 1', color: 'red' }),
      tag({ id: 2, name: 'Tag 2', color: 'green', created_at: '2023-01-02' }),
    ]
    trpcApi.listTags.mockResolvedValue(initialTags)
    trpcApi.deleteTag.mockResolvedValue({ id: 1 })

    const { result } = renderHook(() => useTags())

    await waitFor(() => {
      expect(result.current.tags).toEqual(initialTags)
    })

    await act(async () => {
      await result.current.deleteTag(1)
    })

    expect(trpcApi.deleteTag).toHaveBeenCalledWith({ id: 1 })
    await waitFor(() => {
      expect(result.current.tags).toEqual([initialTags[1]])
    })
  })

  it('refreshes video tags after deletion without fetching unrelated video statistics', async () => {
    const oldTag = tag({ id: 1, name: 'Tag 1', color: 'blue' })
    let video: Video = {
      id: 7, title: 'Video', description: '', file: null, uploaded_at: '2026-09-22T00:00:00Z',
      source_type: 'uploaded', status: 'completed', tags: [oldTag],
    }
    trpcApi.listTags.mockResolvedValue([oldTag])
    trpcApi.deleteTag.mockImplementation(() => {
      video = { ...video, tags: [] }
      return { id: oldTag.id }
    })
    const getVideo = vi.fn(() => video)
    const listVideos = vi.fn(() => ({ data: [video], meta: { total: 1, limit: 24, offset: 0 } }))
    globalThis.__setTrpcHandler('videos.get', getVideo)
    globalThis.__setTrpcHandler('videos.list', listVideos)
    const { result } = renderHook(() => ({
      tags: useTags(),
      client: useQueryClient(),
      video: useQuery(trpc.videos.get.queryOptions({ id: 7 }, { staleTime: Infinity })),
      videos: useQuery(trpc.videos.list.queryOptions({ limit: 24 }, { staleTime: Infinity })),
    }))
    await waitFor(() => expect(result.current.video.data?.tags).toEqual([oldTag]))
    await waitFor(() => expect(result.current.videos.data?.data[0].tags).toEqual([oldTag]))
    const pagesKey = trpc.videos.list.infiniteQueryKey({ limit: 24 })
    const statsKey = trpc.videos.statusCounts.queryKey()
    result.current.client.setQueryData(pagesKey, { pages: [], pageParams: [] })
    result.current.client.setQueryData(statsKey, { total: 1 })

    await act(() => result.current.tags.deleteTag(oldTag.id))

    await waitFor(() => expect(result.current.video.data?.tags).toEqual([]))
    await waitFor(() => expect(result.current.videos.data?.data[0].tags).toEqual([]))
    expect(getVideo).toHaveBeenCalledTimes(2)
    expect(listVideos).toHaveBeenCalledTimes(2)
    expect(result.current.client.getQueryState(pagesKey)?.isInvalidated).toBe(true)
    expect(result.current.client.getQueryState(statsKey)?.isInvalidated).toBe(false)
  })

  it('preserves the newer tag already returned by a concurrent refresh', async () => {
    const oldTag = tag({ id: 1, name: 'Old', color: 'blue' })
    const newTag = tag({ id: 2, name: 'New', color: 'green' })
    const refreshedTag = { ...newTag, video_count: 1 }
    trpcApi.listTags.mockResolvedValue([oldTag])
    let finishCreate!: (tag: Tag) => void
    trpcApi.createTag.mockImplementation(() => new Promise(resolve => { finishCreate = resolve }))
    const { result } = renderHook(() => ({ tags: useTags(), client: useQueryClient() }))
    await waitFor(() => expect(result.current.tags.tags).toEqual([oldTag]))
    let creation!: Promise<Tag>
    act(() => { creation = result.current.tags.createTag('New', 'green') })
    await waitFor(() => expect(finishCreate).toBeDefined())
    trpcApi.listTags.mockResolvedValue([oldTag, refreshedTag])
    await act(() => result.current.client.invalidateQueries(trpc.tags.list.pathFilter()))
    await waitFor(() => expect(result.current.tags.tags).toEqual([refreshedTag, oldTag]))

    await act(async () => {
      finishCreate(newTag)
      await creation
    })

    expect(result.current.tags.tags).toEqual([refreshedTag, oldTag])
  })

  it('allows an initial tag query to finish after tag creation fails', async () => {
    const oldTag = tag({ id: 1, name: 'Existing', color: 'blue' })
    let finishList!: (tags: Tag[]) => void
    trpcApi.listTags.mockImplementation(() => new Promise(resolve => { finishList = resolve }))
    trpcApi.createTag.mockRejectedValue(new Error('Creation failed'))
    const { result } = renderHook(useTags)
    await waitFor(() => expect(finishList).toBeDefined())
    await act(async () => {
      await expect(result.current.createTag('New', 'blue')).rejects.toThrow('Creation failed')
      finishList([oldTag])
    })
    await waitFor(() => expect(result.current.tags).toEqual([oldTag]))
  })

  it('loads the complete list when creation finishes before the initial query', async () => {
    const oldTag = tag({ id: 1, name: 'Existing', color: 'blue' })
    const newTag = tag({ id: 2, name: 'New', color: 'green' })
    let finishInitialList!: (tags: Tag[]) => void
    trpcApi.listTags
      .mockImplementationOnce(() => new Promise(resolve => { finishInitialList = resolve }))
      .mockResolvedValue([oldTag, newTag])
    trpcApi.createTag.mockResolvedValue(newTag)
    const { result } = renderHook(useTags)
    await waitFor(() => expect(finishInitialList).toBeDefined())

    await act(() => result.current.createTag('New', 'green'))
    await act(async () => { finishInitialList([oldTag]) })

    await waitFor(() => expect(result.current.tags).toEqual([oldTag, newTag]))
    expect(trpcApi.listTags).toHaveBeenCalledTimes(2)
  })

  it('should expose the id of the tag currently being deleted', async () => {
    const initialTags = [
      tag({ id: 1, name: 'Tag 1', color: 'red' }),
      tag({ id: 2, name: 'Tag 2', color: 'green', created_at: '2023-01-02' }),
    ]
    trpcApi.listTags.mockResolvedValue(initialTags)
    let resolveDelete: () => void = () => {}
    trpcApi.deleteTag.mockImplementation(
      () => new Promise((resolve) => {
        resolveDelete = () => resolve({ id: 2 })
      })
    )

    const { result } = renderHook(() => useTags())

    await waitFor(() => {
      expect(result.current.tags).toEqual(initialTags)
    })
    expect(result.current.deletingTagId).toBeNull()

    let deletion: Promise<unknown> | undefined
    act(() => {
      deletion = result.current.deleteTag(2)
    })

    await waitFor(() => {
      expect(result.current.deletingTagId).toBe(2)
    })

    await act(async () => {
      resolveDelete()
      await deletion
    })

    await waitFor(() => {
      expect(result.current.deletingTagId).toBeNull()
    })
  })

  it('should handle loading errors', async () => {
    trpcApi.listTags.mockRejectedValue(new Error('Failed to load'))

    const { result } = renderHook(() => useTags())

    await waitFor(() => {
      expect(result.current.error).toBe('Failed to load')
    })
  })
})
