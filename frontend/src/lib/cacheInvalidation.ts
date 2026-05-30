import type { QueryClient } from '@tanstack/react-query'
import { queryKeys } from './queryKeys'

export async function invalidateAfterVideoUpload(queryClient: QueryClient): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: queryKeys.videos.all })
}

export async function invalidateAfterVideoDelete(
  queryClient: QueryClient,
  videoId: number,
): Promise<void> {
  queryClient.removeQueries({ queryKey: queryKeys.videos.detail(videoId) })
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.videos.all }),
    queryClient.invalidateQueries({ queryKey: queryKeys.videoGroups.allDetail }),
    queryClient.invalidateQueries({ queryKey: queryKeys.videoGroups.allShared }),
    queryClient.invalidateQueries({ queryKey: queryKeys.popularScenes.all }),
  ])
}

export async function invalidateAfterVideoUpdate(
  queryClient: QueryClient,
  videoId: number,
): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.videos.detail(videoId) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.videos.all }),
    queryClient.invalidateQueries({ queryKey: queryKeys.videoGroups.allDetail }),
    queryClient.invalidateQueries({ queryKey: queryKeys.videoGroups.allShared }),
  ])
}

export async function invalidateAfterTranscriptEdit(
  queryClient: QueryClient,
  videoId: number,
): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.videos.detail(videoId) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.videoGroups.allDetail }),
    queryClient.invalidateQueries({ queryKey: queryKeys.videoGroups.allShared }),
    queryClient.invalidateQueries({ queryKey: queryKeys.popularScenes.all }),
  ])
}

export async function invalidateAfterGroupDelete(queryClient: QueryClient): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: queryKeys.videoGroups.prefix })
}

export async function invalidateAfterGroupVideoRemove(
  queryClient: QueryClient,
  groupId: number,
): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.videoGroups.detail(groupId) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.popularScenes.byGroup(groupId) }),
  ])
}
