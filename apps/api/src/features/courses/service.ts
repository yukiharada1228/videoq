import {
  clearShareSlug,
  courseOwnedBy,
  createCourse,
  deleteCourse,
  getCourseDetail,
  getCourseDetailByShareSlug,
  listCoursesPage,
  reorderCourses,
  setShareSlug,
  updateCourse,
} from "../../repositories/course-repository";
import {
  normalizeShareSlug,
  SLUG_ALREADY_EXISTS_MESSAGE,
} from "../../lib/share-slug";
import type { Bindings } from "../../types/bindings";
import type { CreationIdempotency } from "../../repositories/mcp-idempotency-repository";

export async function listCourses(
  env: Bindings,
  userId: string,
  limit: number,
  offset: number,
) {
  return listCoursesPage(env, userId, limit, offset);
}

export async function getCourse(env: Bindings, courseId: number, userId: string) {
  return getCourseDetail(env, courseId, userId, { includeTags: false });
}

export async function getSharedCourse(env: Bindings, slug: string) {
  return getCourseDetailByShareSlug(env, slug, { includeTags: false });
}

export async function createUserCourse(
  env: Bindings,
  userId: string,
  name: string,
  description: string,
) {
  const created = await createCourse(env, userId, name, description);
  if ("idempotencyConflict" in created) {
    throw new Error("Unexpected idempotency conflict without an idempotency key.");
  }
  return getCourseDetail(env, created.courseId, userId, { includeTags: false });
}

/** MCP 用: 同じ key + payload の再試行では同じ講座を返す。 */
export async function createUserCourseIdempotent(
  env: Bindings,
  userId: string,
  name: string,
  description: string,
  idempotency: CreationIdempotency,
) {
  const created = await createCourse(
    env,
    userId,
    name,
    description,
    idempotency,
  );
  if ("idempotencyConflict" in created) return created;
  return {
    course: await getCourseDetail(env, created.courseId, userId, { includeFileUrls: false }),
    reused: created.reused,
  } as const;
}

export async function updateUserCourse(
  env: Bindings,
  courseId: number,
  userId: string,
  data: { name?: string; description?: string },
) {
  return updateCourse(env, courseId, userId, data);
}

export async function removeCourse(env: Bindings, courseId: number, userId: string) {
  return deleteCourse(env, courseId, userId);
}

export async function reorderUserCourses(
  env: Bindings,
  userId: string,
  courseIds: number[],
) {
  return reorderCourses(env, userId, courseIds);
}

export async function saveShareLink(
  env: Bindings,
  courseId: number,
  userId: string,
  rawSlug: string,
) {
  const norm = normalizeShareSlug(rawSlug);
  if ("error" in norm) {
    const owned = await courseOwnedBy(env, courseId, userId);
    return owned ? { error: norm.error } as const : { notFound: true } as const;
  }
  const res = await setShareSlug(env, courseId, userId, norm.slug);
  if ("notFound" in res) return res;
  if ("conflict" in res) {
    return { conflict: SLUG_ALREADY_EXISTS_MESSAGE } as const;
  }
  return { share_slug: norm.slug } as const;
}

export async function clearShareLink(
  env: Bindings,
  courseId: number,
  userId: string,
) {
  return clearShareSlug(env, courseId, userId);
}
