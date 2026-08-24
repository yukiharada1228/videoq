import {
  createGroup,
  deleteGroup,
  getGroupDetail,
  getGroupDetailByShareSlug,
  getGroupShareSlug,
  listGroupsPage,
  reorderGroups,
  setShareSlug,
  updateGroup,
} from "../../repositories/group-repository";
import {
  normalizeShareSlug,
  SLUG_ALREADY_EXISTS_MESSAGE,
} from "../../lib/share-slug";
import type { Bindings } from "../../types/bindings";

export async function listGroups(
  env: Bindings,
  userId: string,
  limit: number,
  offset: number,
) {
  return listGroupsPage(env, userId, limit, offset);
}

export async function getGroup(env: Bindings, groupId: number, userId: string) {
  return getGroupDetail(env, groupId, userId);
}

export async function getSharedGroup(env: Bindings, slug: string) {
  return getGroupDetailByShareSlug(env, slug);
}

export async function createUserGroup(
  env: Bindings,
  userId: string,
  name: string,
  description: string,
) {
  const id = await createGroup(env, userId, name, description);
  return getGroupDetail(env, id, userId);
}

export async function updateUserGroup(
  env: Bindings,
  groupId: number,
  userId: string,
  data: { name?: string; description?: string },
) {
  const res = await updateGroup(env, groupId, userId, data);
  if ("notFound" in res) return { notFound: true } as const;
  return { group: await getGroupDetail(env, groupId, userId) } as const;
}

export async function removeGroup(env: Bindings, groupId: number, userId: string) {
  return deleteGroup(env, groupId, userId);
}

export async function reorderUserGroups(
  env: Bindings,
  userId: string,
  groupIds: number[],
) {
  return reorderGroups(env, userId, groupIds);
}

export async function saveShareLink(
  env: Bindings,
  groupId: number,
  userId: string,
  rawSlug: string,
) {
  const cur = await getGroupShareSlug(env, groupId, userId);
  if (!cur.found) return { notFound: true as const };
  const norm = normalizeShareSlug(rawSlug);
  if ("error" in norm) return { error: norm.error } as const;
  const res = await setShareSlug(env, groupId, userId, norm.slug);
  if ("conflict" in res) {
    return { conflict: SLUG_ALREADY_EXISTS_MESSAGE } as const;
  }
  return { share_slug: norm.slug } as const;
}

export async function clearShareLink(
  env: Bindings,
  groupId: number,
  userId: string,
) {
  const cur = await getGroupShareSlug(env, groupId, userId);
  if (!cur.found) return { notFound: true as const };
  if (!cur.slug) return { notConfigured: true as const };
  await setShareSlug(env, groupId, userId, null);
  return { ok: true as const };
}
