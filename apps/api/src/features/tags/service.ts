import {
  createTag,
  deleteTag,
  getTagDetail,
  listTagsPage,
  normalizeTagName,
  isValidTagColor,
  tagExists,
  updateTag,
  EMPTY_NAME_MESSAGE,
  INVALID_COLOR_MESSAGE,
} from "../../repositories/tag-repository";
import type { Bindings } from "../../types/bindings";

export async function listTags(
  env: Bindings,
  userId: string,
  limit: number,
  offset: number,
) {
  return listTagsPage(env, userId, limit, offset);
}

export async function getTag(env: Bindings, tagId: number, userId: string) {
  return getTagDetail(env, tagId, userId);
}

export async function createUserTag(
  env: Bindings,
  userId: string,
  rawName: string,
  color: string,
) {
  const name = normalizeTagName(rawName);
  if (name === null) return { error: EMPTY_NAME_MESSAGE } as const;
  if (!isValidTagColor(color)) return { error: INVALID_COLOR_MESSAGE } as const;
  const tag = await createTag(env, userId, name, color);
  return { tag } as const;
}

export async function updateUserTag(
  env: Bindings,
  tagId: number,
  userId: string,
  fields: { name?: string; color?: string },
) {
  if (!(await tagExists(env, tagId, userId))) return { notFound: true } as const;
  const patch: { name?: string; color?: string } = {};
  if (fields.name !== undefined) {
    const n = normalizeTagName(fields.name);
    if (n === null) return { error: EMPTY_NAME_MESSAGE } as const;
    patch.name = n;
  }
  if (fields.color !== undefined) {
    if (!isValidTagColor(fields.color)) return { error: INVALID_COLOR_MESSAGE } as const;
    patch.color = fields.color;
  }
  await updateTag(env, tagId, userId, patch);
  return { tag: await getTagDetail(env, tagId, userId) } as const;
}

export async function removeTag(env: Bindings, tagId: number, userId: string) {
  return deleteTag(env, tagId, userId);
}
