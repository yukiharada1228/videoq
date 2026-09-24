import { reorderVideos } from "../../repositories/course-repository";
import {
  attachTags,
  detachTag,
  addVideoToCourse,
  removeVideoFromCourse,
  addVideosBulk,
} from "../../repositories/membership-repository";
import type { Bindings } from "../../types/bindings";

export async function addTagsToVideo(
  env: Bindings,
  userId: string,
  videoId: number,
  tagIds: number[],
) {
  const result = await attachTags(env, videoId, userId, tagIds);
  if ("notFound" in result) return result;
  return {
    ok: true as const,
    message: `Added ${result.added} tags to video`,
    added_count: result.added,
    skipped_count: tagIds.length - result.added,
  };
}

export async function removeTagFromVideo(
  env: Bindings,
  userId: string,
  videoId: number,
  tagId: number,
) {
  const result = await detachTag(env, videoId, tagId, userId);
  if ("notFound" in result) return result;
  return { ok: true as const, message: "Tag removed from video" };
}

export async function reorderGroupVideos(
  env: Bindings,
  userId: string,
  courseId: number,
  videoIds: number[],
) {
  const result = await reorderVideos(env, courseId, userId, videoIds);
  if ("notFound" in result) {
    return { notFound: "Course not found" } as const;
  }
  if ("mismatch" in result) {
    return {
      badRequest: "Specified video IDs do not match videos in course",
    } as const;
  }

  return { ok: true as const, message: "Video order updated" };
}

export async function addVideosToCourseBulk(
  env: Bindings,
  userId: string,
  courseId: number,
  videoIds: number[],
) {
  const result = await addVideosBulk(env, courseId, videoIds, userId);
  if ("notFound" in result) return result;
  const { added } = result;
  return {
    ok: true as const,
    message: `Added ${added} videos to course`,
    added_count: added,
    skipped_count: videoIds.length - added,
  };
}

export async function addVideoToCourseOne(
  env: Bindings,
  userId: string,
  courseId: number,
  videoId: number,
) {
  const r = await addVideoToCourse(env, courseId, videoId, userId);
  if ("notFound" in r) return r;
  if ("alreadyIn" in r) {
    return {
      ok: true as const,
      message: "Video is already in the course",
      id: r.id,
      reused: true,
    };
  }
  return {
    ok: true as const,
    message: "Video added to course",
    id: r.id,
    reused: false,
  };
}

export async function removeVideoFromCourseOne(
  env: Bindings,
  userId: string,
  courseId: number,
  videoId: number,
) {
  const r = await removeVideoFromCourse(env, courseId, videoId, userId);
  if ("notFound" in r) return r;
  if ("notMember" in r) {
    return { notFound: "This video is not added to the course" } as const;
  }
  return { ok: true as const };
}
