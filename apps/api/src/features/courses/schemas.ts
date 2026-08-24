import { z } from "../../shared/openapi";

export const courseListItemSchema = z
  .object({
    id: z.number().int(),
    name: z.string(),
    description: z.string(),
    display_order: z.number().int(),
    created_at: z.string(),
    video_count: z.number().int(),
    access_role: z.enum(["owner", "member"]),
  })
  .openapi("CourseListItem");

export const courseDetailSchema = courseListItemSchema
  .omit({ access_role: true })
  .extend({
    access_role: z.enum(["owner", "member", "public"]),
    updated_at: z.string(),
    share_slug: z.string().nullable(),
    videos: z.array(z.record(z.string(), z.unknown())),
  })
  .openapi("CourseDetail");

export const courseCreateSchema = z
  .object({
    name: z.string().min(1).max(255),
    description: z.string().optional().default(""),
  })
  .openapi("CourseCreate");

export const coursePatchSchema = z
  .object({
    name: z.string().min(1).max(255).optional(),
    description: z.string().optional(),
  })
  .openapi("CoursePatch");

export const coursePutSchema = courseCreateSchema.openapi("CoursePut");

export const courseIdParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const reorderCoursesSchema = z
  .object({
    course_ids: z.array(z.number().int().positive()).min(1),
  })
  .openapi("ReorderCourses");

export const shareLinkSchema = z
  .object({
    share_slug: z.string().min(1),
  })
  .openapi("ShareLinkRequest");
