import { z } from "zod";
import { chatMessagesSchema } from "@videoq/trpc/schema";

const optionalCourseId = z.coerce.number().int().nullable().optional();

export const chatMessageBodySchema = z
  .object({
    messages: chatMessagesSchema,
    course_id: optionalCourseId,
  });

export type ChatMessageBody = z.infer<typeof chatMessageBodySchema>;
