import {
  createCourse,
  deleteCourse,
  getCourseDetail,
  getCourseDetailByShareSlug,
  getCourseShareSlug,
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

export async function listCourses(
  env: Bindings,
  userId: string,
  limit: number,
  offset: number,
) {
  return listCoursesPage(env, userId, limit, offset);
}

export async function getCourse(env: Bindings, courseId: number, userId: string) {
  return getCourseDetail(env, courseId, userId);
}

export async function getSharedCourse(env: Bindings, slug: string) {
  return getCourseDetailByShareSlug(env, slug);
}

export async function createUserCourse(
  env: Bindings,
  userId: string,
  name: string,
  description: string,
) {
  const id = await createCourse(env, userId, name, description);
  return getCourseDetail(env, id, userId);
}

export async function updateUserCourse(
  env: Bindings,
  courseId: number,
  userId: string,
  data: { name?: string; description?: string },
) {
  const res = await updateCourse(env, courseId, userId, data);
  if ("notFound" in res) return { notFound: true } as const;
  return { course: await getCourseDetail(env, courseId, userId) } as const;
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
  const cur = await getCourseShareSlug(env, courseId, userId);
  if (!cur.found) return { notFound: true as const };
  const norm = normalizeShareSlug(rawSlug);
  if ("error" in norm) return { error: norm.error } as const;
  const res = await setShareSlug(env, courseId, userId, norm.slug);
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
  const cur = await getCourseShareSlug(env, courseId, userId);
  if (!cur.found) return { notFound: true as const };
  if (!cur.slug) return { notConfigured: true as const };
  await setShareSlug(env, courseId, userId, null);
  return { ok: true as const };
}
