import { z } from "../../shared/openapi";

export const tagSchema = z
  .object({
    id: z.number().int(),
    name: z.string(),
    color: z.string(),
  })
  .openapi("Tag");

export const tagDetailSchema = tagSchema
  .extend({
    videos: z
      .array(
        z.object({
          id: z.number().int(),
          title: z.string(),
        }),
      )
      .optional(),
  })
  .openapi("TagDetail");

/** Create: name max 50 (no trim here), color required. */
export const tagCreateSchema = z
  .object({
    name: z.string().min(1).max(50),
    color: z.string().min(1),
  })
  .openapi("TagCreate");

/** PATCH: both optional. */
export const tagPatchSchema = z
  .object({
    name: z.string().min(1).max(50).optional(),
    color: z.string().min(1).optional(),
  })
  .openapi("TagPatch");

/** PUT: both required. */
export const tagPutSchema = tagCreateSchema.openapi("TagPut");

export const tagIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});
