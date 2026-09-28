import type { QueryClient, QueryFilters } from '@tanstack/react-query'
import type { RpcOutputMap, Video } from '@videoq/trpc'
import { trpc } from './trpc'

export async function refreshQuery(queryClient: QueryClient, filter: QueryFilters): Promise<void> {
  // Invalidation alone reuses an in-flight first load. Cancel its older snapshot
  // too, so a read started before the write cannot hide the saved result.
  await queryClient.cancelQueries(filter)
  await queryClient.invalidateQueries(filter)
}

async function invalidateUsage(queryClient: QueryClient): Promise<void> {
  const filter = trpc.account.me.pathFilter()
  await queryClient.cancelQueries(filter)
  // Keep cached usage stale until the next visit, even if an older read was in
  // flight. Only restart a missing first load so authentication can finish.
  await queryClient.invalidateQueries({ ...filter, refetchType: 'none' })
  await queryClient.refetchQueries({
    ...filter, type: 'active', predicate: query => query.state.data === undefined,
  })
}

export async function invalidateAfterChatAnswer(queryClient: QueryClient, courseId?: number): Promise<void> {
  await Promise.all([
    invalidateUsage(queryClient),
    ...(courseId === undefined ? [] : [
      trpc.chat.history.queryFilter({ courseId }),
      trpc.chat.analytics.queryFilter({ courseId }),
      trpc.evaluation.logs.queryFilter({ courseId }),
      trpc.evaluation.summary.queryFilter({ courseId }),
    ].map(filter => refreshQuery(queryClient, filter))),
  ])
}

export async function updateAfterChatFeedback(
  queryClient: QueryClient,
  courseId: number,
  result: RpcOutputMap['chat.feedback'],
): Promise<void> {
  const history = trpc.chat.history.queryFilter({ courseId })
  const analytics = trpc.chat.analytics.queryFilter({ courseId })
  await Promise.all([queryClient.cancelQueries(history), queryClient.cancelQueries(analytics)])
  queryClient.setQueriesData<RpcOutputMap['chat.history']>(history, prev => prev ? {
    ...prev,
    data: prev.data.map(item => item.id === result.chat_log_id ? { ...item, feedback: result.feedback } : item),
  } : prev)
  // Existing history pages are patched without a request. Resume cancelled
  // first loads and refresh aggregates without delaying the feedback controls.
  void Promise.all([
    queryClient.invalidateQueries({ ...history, predicate: query => query.state.data === undefined }),
    queryClient.invalidateQueries(analytics),
  ])
}

export async function invalidateAfterCourseUpdate(
  queryClient: QueryClient,
  courseId: number,
): Promise<void> {
  await Promise.all([
    refreshQuery(queryClient, trpc.courses.get.queryFilter({ id: courseId })),
    refreshQuery(queryClient, trpc.courses.list.pathFilter()),
  ])
}

export async function invalidateAfterCourseRemoval(
  queryClient: QueryClient,
  courseId: number,
): Promise<void> {
  queryClient.removeQueries(trpc.courses.get.queryFilter({ id: courseId }))
  await refreshQuery(queryClient, trpc.courses.list.pathFilter())
}

export async function invalidateAfterVideoUpload(
  queryClient: QueryClient,
  { tagsChanged = false }: { tagsChanged?: boolean } = {},
): Promise<void> {
  await Promise.all([
    refreshQuery(queryClient, trpc.videos.list.pathFilter()),
    refreshQuery(queryClient, trpc.videos.statusCounts.pathFilter()),
    tagsChanged && refreshQuery(queryClient, trpc.tags.list.pathFilter()),
    invalidateUsage(queryClient),
  ])
}

export async function invalidateAfterVideoDelete(
  queryClient: QueryClient,
  videoId: number,
): Promise<void> {
  queryClient.removeQueries(trpc.videos.get.queryFilter({ id: videoId }))
  await Promise.all([
    refreshQuery(queryClient, trpc.videos.list.pathFilter()),
    refreshQuery(queryClient, trpc.videos.statusCounts.pathFilter()),
    refreshQuery(queryClient, trpc.courses.pathFilter()),
    refreshQuery(queryClient, trpc.tags.list.pathFilter()),
    invalidateUsage(queryClient),
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
    (!updatedVideo || tagsChanged) && refreshQuery(queryClient, trpc.videos.get.queryFilter({ id: videoId })),
    (metadataChanged || tagsChanged) && refreshQuery(queryClient, trpc.videos.list.pathFilter()),
    metadataChanged && refreshQuery(queryClient, trpc.courses.get.pathFilter()),
    tagsChanged && refreshQuery(queryClient, trpc.tags.list.pathFilter()),
  ])
}
