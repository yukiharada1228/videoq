import { z } from "../../shared/openapi";

export const videoMultipartSchema = z
  .object({
    file: z
      .custom<File>((value) => value instanceof File, {
        message: "No file was submitted.",
      })
      .openapi({ type: "string", format: "binary" }),
    title: z.string().optional(),
    description: z.string().optional(),
    transcript: z.string().optional(),
  })
  .openapi("VideoMultipart");
import { paginationQuerySchema } from "../../shared/pagination";
import { zReqNumber, zReqString } from "../../shared/zod";

export const videoTagSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  color: z.string(),
});

export const videoListItemSchema = z
  .object({
    id: z.number().int(),
    file: z.string().nullable(),
    title: z.string(),
    description: z.string(),
    uploaded_at: z.string(),
    status: z.string(),
    source_type: z.string(),
    source_url: z.string().nullable(),
    youtube_video_id: z.string().nullable(),
    youtube_embed_url: z.string().nullable(),
    tags: z.array(videoTagSchema),
  })
  .openapi("VideoListItem");

export const videoDetailSchema = videoListItemSchema
  .extend({
    transcript: z.string().optional(),
  })
  .openapi("VideoDetail");

export const videoListQuerySchema = paginationQuerySchema.extend({
  q: z.string().optional(),
  status: z.string().optional(),
  ordering: z.string().optional(),
  tags: z.string().optional(),
});

export const videoIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const videoStatsSchema = z
  .object({
    total: z.number().int().nonnegative(),
    completed: z.number().int().nonnegative(),
    pending: z.number().int().nonnegative(),
    processing: z.number().int().nonnegative(),
    indexing: z.number().int().nonnegative(),
    error: z.number().int().nonnegative(),
    uploading: z.number().int().nonnegative(),
  })
  .openapi("VideoStats");

const requiredTitle = zReqString()
  .trim()
  .min(1, "This field may not be blank.")
  .max(255, "Ensure this field has no more than 255 characters.");

const optionalDescription = zReqString("This field is required.", "Not a valid string.")
  .optional()
  .default("");

export const videoPatchSchema = z
  .object({
    status: z.literal("uploaded").optional(),
    title: requiredTitle.optional(),
    description: zReqString("This field is required.", "Not a valid string.").optional(),
    // 前後の空白を保持する。
    transcript: zReqString("This field is required.", "Not a valid string.").optional(),
  })
  .openapi("VideoPatch");

export const videoPutSchema = z
  .object({
    title: requiredTitle,
    description: optionalDescription,
  })
  .openapi("VideoPut");

export const youtubeCreateSchema = z
  .object({
    youtube_url: zReqString()
      .trim()
      .min(1, "This field may not be blank."),
    title: requiredTitle,
    description: optionalDescription,
  })
  .openapi("YoutubeCreate");

export const uploadRequestSchema = z
  .object({
    filename: zReqString()
      .trim()
      .min(1, "This field may not be blank.")
      .max(255, "Ensure this field has no more than 255 characters."),
    content_type: zReqString()
      .trim()
      .min(1, "This field may not be blank.")
      .max(100, "Ensure this field has no more than 100 characters."),
    file_size: zReqNumber()
      .int("A valid integer is required.")
      .positive("Ensure this value is greater than or equal to 1."),
    title: requiredTitle,
    description: optionalDescription,
  })
  .openapi("UploadRequest");

export const uploadResponseSchema = z
  .object({
    video: videoDetailSchema,
    upload_url: z.string(),
  })
  .openapi("UploadResponse");

export type UploadRequest = z.infer<typeof uploadRequestSchema>;
export type YoutubeCreateRequest = z.infer<typeof youtubeCreateSchema>;
