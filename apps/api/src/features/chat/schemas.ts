import { z } from "zod";
import { chatCourseIdSchema, chatMessagesSchema } from "@videoq/trpc/schema";

export const chatMessageBodySchema = z
  .object({
    messages: chatMessagesSchema,
    course_id: chatCourseIdSchema,
  });

export type ChatMessageBody = z.infer<typeof chatMessageBodySchema>;
