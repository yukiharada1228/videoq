import { z } from "zod";
import { chatMessagesSchema } from "@videoq/trpc/schema";

const optionalCourseId = z.coerce.number().int().nullable().optional();

export const chatMessageBodySchema = z
  .object({
    messages: chatMessagesSchema,
    course_id: optionalCourseId,
    mode: z.enum(["qa", "study"]).optional().default("qa"),
    study_session_id: z.string().max(128).nullable().optional(),
  });

export type ChatMessageBody = z.infer<typeof chatMessageBodySchema>;
