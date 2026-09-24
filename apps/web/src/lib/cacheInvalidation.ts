import type { QueryClient } from '@tanstack/react-query'
import type { Video } from '@videoq/trpc'
import { trpc } from './trpc'

const trpcVideoQueries = trpc.videos.pathKey()
const trpcCourseQueries = trpc.courses.pathKey()

export async function invalidateAfterCourseUpdate(
  queryClient: QueryClient,
  courseId: number,
): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries(trpc.courses.get.queryFilter({ id: courseId })),
    queryClient.invalidateQueries(trpc.courses.list.pathFilter()),
  ])
}

export async function invalidateAfterVideoUpload(
  queryClient: QueryClient,
  { tagsChanged = false }: { tagsChanged?: boolean } = {},
): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: trpcVideoQueries }),
    tagsChanged && queryClient.invalidateQueries(trpc.tags.list.pathFilter()),
    // Usage is shown on the home page; fetch it when that page mounts.
    queryClient.invalidateQueries({ ...trpc.account.me.pathFilter(), refetchType: 'none' }),
  ])
}

export async function invalidateAfterVideoDelete(
  queryClient: QueryClient,
  videoId: number,
): Promise<void> {
  queryClient.removeQueries(trpc.videos.get.queryFilter({ id: videoId }))
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: trpcVideoQueries }),
    queryClient.invalidateQueries({ queryKey: trpcCourseQueries }),
    queryClient.invalidateQueries(trpc.tags.list.pathFilter()),
    queryClient.invalidateQueries({ ...trpc.account.me.pathFilter(), refetchType: 'none' }),
  ])
}

export async function invalidateAfterVideoUpdate(
  queryClient: QueryClient,
  videoId: number,
  { metadataChanged = true, tagsChanged = false, updatedVideo }: {
    metadataChanged?: boolean; tagsChanged?: boolean; updatedVideo?: Video;
  } = {},
): Promise<void> {
  if (updatedVideo) {
    await queryClient.cancelQueries(trpc.videos.get.queryFilter({ id: videoId }))
    queryClient.setQueryData(trpc.videos.get.queryKey({ id: videoId }), updatedVideo)
  }
  await Promise.all([
    (!updatedVideo || tagsChanged) && queryClient.invalidateQueries(trpc.videos.get.queryFilter({ id: videoId })),
    (metadataChanged || tagsChanged) && queryClient.invalidateQueries(trpc.videos.list.pathFilter()),
    metadataChanged && queryClient.invalidateQueries(trpc.courses.get.pathFilter()),
    tagsChanged && queryClient.invalidateQueries(trpc.tags.list.pathFilter()),
  ])
}
