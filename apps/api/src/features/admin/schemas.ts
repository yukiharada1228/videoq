import { z } from "../../shared/openapi";
import { paginationQuerySchema } from "../../shared/pagination";

export const adminUserIdParamSchema = z.object({
  id: z.string().min(1),
});

export const adminUserListQuerySchema = paginationQuerySchema.extend({
  q: z.string().optional(),
});

export const adminUserSchema = z
  .object({
    id: z.string(),
    username: z.string(),
    email: z.string(),
    is_active: z.boolean(),
    is_staff: z.boolean(),
    is_superuser: z.boolean(),
    max_video_upload_size_mb: z.number().int(),
    storage_limit_gb: z.number().nullable(),
    processing_limit_minutes: z.number().nullable(),
    ai_answers_limit: z.number().nullable(),
    used_storage_bytes: z.number().int(),
    used_processing_seconds: z.number().int(),
    used_ai_answers: z.number().int(),
    usage_period_start: z.string().nullable(),
    is_over_quota: z.boolean(),
  })
  .openapi("AdminUser");

export const adminQuotaPatchSchema = z
  .object({
    max_video_upload_size_mb: z.number().int().positive().optional(),
    storage_limit_gb: z.number().nullable().optional(),
    processing_limit_minutes: z.number().nullable().optional(),
    ai_answers_limit: z.number().nullable().optional(),
  })
  .openapi("AdminQuotaPatch");

export const adminUsagePatchSchema = z
  .object({
    used_storage_bytes: z.number().int().nonnegative().optional(),
    used_processing_seconds: z.number().int().nonnegative().optional(),
    used_ai_answers: z.number().int().nonnegative().optional(),
    usage_period_start: z.string().nullable().optional(),
    is_over_quota: z.boolean().optional(),
  })
  .openapi("AdminUsagePatch");

export const adminFlagsPatchSchema = z
  .object({
    is_active: z.boolean().optional(),
    is_staff: z.boolean().optional(),
    is_superuser: z.boolean().optional(),
  })
  .openapi("AdminFlagsPatch");

export const adminJobResponseSchema = z
  .object({ job_id: z.string() })
  .openapi("AdminJobResponse");
