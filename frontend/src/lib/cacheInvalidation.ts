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
    queryClient.invalidateQueries({ queryKey: queryKeys.videoCourses.allDetail }),
    queryClient.invalidateQueries({ queryKey: queryKeys.videoCourses.allShared }),
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
    queryClient.invalidateQueries({ queryKey: queryKeys.videoCourses.allDetail }),
    queryClient.invalidateQueries({ queryKey: queryKeys.videoCourses.allShared }),
  ])
}

export async function invalidateAfterTranscriptEdit(
  queryClient: QueryClient,
  videoId: number,
): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.videos.detail(videoId) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.videoCourses.allDetail }),
    queryClient.invalidateQueries({ queryKey: queryKeys.videoCourses.allShared }),
    queryClient.invalidateQueries({ queryKey: queryKeys.popularScenes.all }),
  ])
}

export async function invalidateAfterGroupDelete(queryClient: QueryClient): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: queryKeys.videoCourses.prefix })
}

export async function invalidateAfterGroupVideoRemove(
  queryClient: QueryClient,
  courseId: number,
): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.videoCourses.detail(courseId) }),
    queryClient.invalidateQueries({ queryKey: queryKeys.popularScenes.byCourse(courseId) }),
  ])
}
