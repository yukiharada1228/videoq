import { z } from "../../shared/openapi";
import { zReqArray } from "../../shared/zod";

export const videoIdParamSchema = z.object({
  videoId: z.coerce.number().int().positive(),
});

export const tagIdParamSchema = z.object({
  tagId: z.coerce.number().int().positive(),
});

export const videoTagParamsSchema = videoIdParamSchema.merge(tagIdParamSchema);

export const groupIdParamSchema = z.object({
  groupId: z.coerce.number().int().positive(),
});

export const groupVideoParamsSchema = groupIdParamSchema.merge(videoIdParamSchema);

export const tagIdsBodySchema = z
  .object({
    tag_ids: zReqArray(z.coerce.number().int(), "Tag IDs not specified").min(
      1,
      "Tag IDs not specified",
    ),
  })
  .openapi("TagIdsBody");

export const videoIdsBodySchema = z
  .object({
    video_ids: zReqArray(z.coerce.number().int(), "Video ID not specified").min(
      1,
      "Video ID not specified",
    ),
  })
  .openapi("VideoIdsBody");

/** reorder: 空配列は許容（serializer 未使用の従来契約）。 */
export const reorderVideosBodySchema = z
  .object({
    video_ids: zReqArray(z.coerce.number().int(), "video_ids must be an array"),
  })
  .openapi("ReorderVideosBody");

export const membershipMutationSchema = z
  .object({
    message: z.string(),
    added_count: z.number().int().optional(),
    skipped_count: z.number().int().optional(),
    id: z.number().int().optional(),
  })
  .openapi("MembershipMutation");
