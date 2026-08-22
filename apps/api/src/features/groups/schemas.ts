import { z } from "../../shared/openapi";

export const groupListItemSchema = z
  .object({
    id: z.number().int(),
    name: z.string(),
    description: z.string(),
    display_order: z.number().int(),
    created_at: z.string(),
    video_count: z.number().int(),
    access_role: z.enum(["owner", "member"]),
  })
  .openapi("GroupListItem");

export const groupDetailSchema = groupListItemSchema
  .omit({ access_role: true })
  .extend({
    access_role: z.enum(["owner", "member", "public"]),
    updated_at: z.string(),
    share_slug: z.string().nullable(),
    videos: z.array(z.record(z.string(), z.unknown())),
  })
  .openapi("GroupDetail");

export const groupCreateSchema = z
  .object({
    name: z.string().min(1).max(255),
    description: z.string().optional().default(""),
  })
  .openapi("GroupCreate");

export const groupPatchSchema = z
  .object({
    name: z.string().min(1).max(255).optional(),
    description: z.string().optional(),
  })
  .openapi("GroupPatch");

export const groupPutSchema = groupCreateSchema.openapi("GroupPut");

export const groupIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const reorderGroupsSchema = z
  .object({
    group_ids: z.array(z.number().int().positive()).min(1),
  })
  .openapi("ReorderGroups");

export const shareLinkSchema = z
  .object({
    share_slug: z.string().min(1),
  })
  .openapi("ShareLinkRequest");
