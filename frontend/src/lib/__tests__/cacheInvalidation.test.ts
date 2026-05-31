import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { QueryClient } from '@tanstack/react-query'
import {
  invalidateAfterVideoUpload,
  invalidateAfterVideoDelete,
  invalidateAfterVideoUpdate,
  invalidateAfterTranscriptEdit,
  invalidateAfterGroupDelete,
  invalidateAfterGroupVideoRemove,
} from '../cacheInvalidation'
import { queryKeys } from '../queryKeys'

function createMockQueryClient(): QueryClient {
  return {
    invalidateQueries: vi.fn().mockResolvedValue(undefined),
    removeQueries: vi.fn(),
  } as unknown as QueryClient
}

describe('invalidateAfterVideoUpload', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    queryClient = createMockQueryClient()
  })

  it('invalidates videos.all', async () => {
    await invalidateAfterVideoUpload(queryClient)
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.videos.all,
    })
  })
})

describe('invalidateAfterVideoDelete', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    queryClient = createMockQueryClient()
  })

  it('removes the video detail cache', async () => {
    await invalidateAfterVideoDelete(queryClient, 42)
    expect(queryClient.removeQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.videos.detail(42),
    })
  })

  it('invalidates videos.all', async () => {
    await invalidateAfterVideoDelete(queryClient, 42)
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.videos.all,
    })
  })

  it('invalidates all videoGroup detail queries', async () => {
    await invalidateAfterVideoDelete(queryClient, 42)
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.videoGroups.allDetail,
    })
  })

  it('invalidates all sharedVideoGroup queries', async () => {
    await invalidateAfterVideoDelete(queryClient, 42)
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.videoGroups.allShared,
    })
  })

  it('invalidates all popularScenes queries', async () => {
    await invalidateAfterVideoDelete(queryClient, 42)
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.popularScenes.all,
    })
  })
})

describe('invalidateAfterVideoUpdate', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    queryClient = createMockQueryClient()
  })

  it('invalidates the specific video detail', async () => {
    await invalidateAfterVideoUpdate(queryClient, 7)
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.videos.detail(7),
    })
  })

  it('invalidates videos.all', async () => {
    await invalidateAfterVideoUpdate(queryClient, 7)
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.videos.all,
    })
  })

  it('invalidates all videoGroup detail queries', async () => {
    await invalidateAfterVideoUpdate(queryClient, 7)
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.videoGroups.allDetail,
    })
  })

  it('invalidates all sharedVideoGroup queries', async () => {
    await invalidateAfterVideoUpdate(queryClient, 7)
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.videoGroups.allShared,
    })
  })
})

describe('invalidateAfterTranscriptEdit', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    queryClient = createMockQueryClient()
  })

  it('invalidates the specific video detail', async () => {
    await invalidateAfterTranscriptEdit(queryClient, 3)
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.videos.detail(3),
    })
  })

  it('invalidates all videoGroup detail queries', async () => {
    await invalidateAfterTranscriptEdit(queryClient, 3)
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.videoGroups.allDetail,
    })
  })

  it('invalidates all sharedVideoGroup queries', async () => {
    await invalidateAfterTranscriptEdit(queryClient, 3)
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.videoGroups.allShared,
    })
  })

  it('invalidates all popularScenes queries', async () => {
    await invalidateAfterTranscriptEdit(queryClient, 3)
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.popularScenes.all,
    })
  })
})

describe('invalidateAfterGroupDelete', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    queryClient = createMockQueryClient()
  })

  it('invalidates all videoGroups queries', async () => {
    await invalidateAfterGroupDelete(queryClient)
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.videoGroups.prefix,
    })
  })
})

describe('invalidateAfterGroupVideoRemove', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    queryClient = createMockQueryClient()
  })

  it('invalidates the specific group detail', async () => {
    await invalidateAfterGroupVideoRemove(queryClient, 10)
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.videoGroups.detail(10),
    })
  })

  it('invalidates popularScenes for the specific group', async () => {
    await invalidateAfterGroupVideoRemove(queryClient, 10)
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.popularScenes.byGroup(10),
    })
  })
})
