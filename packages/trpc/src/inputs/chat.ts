import { z } from "zod";
import { chatMessagesSchema } from "../schema";

const page = {
  limit: z.number().int().positive().max(500).default(100),
  offset: z.number().int().nonnegative().default(0),
};

export const chatInputSchemas = {
  "chat.send": z.object({
    messages: chatMessagesSchema,
    courseId: z.number().int().positive().nullable().optional(),
    shareSlug: z.string().min(1).optional(),
    mode: z.enum(["qa", "study"]).default("qa"),
    studySessionId: z.string().max(128).nullable().optional(),
  }),
  "chat.feedback": z.object({
    chatLogId: z.number().int().positive(),
    feedback: z.enum(["good", "bad"]).nullable(),
    shareSlug: z.string().min(1).optional(),
  }),
  "chat.history": z.object({ courseId: z.number().int().positive(), ...page }),
  "chat.resetHistory": z.object({ courseId: z.number().int().positive() }),
  "chat.analytics": z.object({ courseId: z.number().int().positive() }),
  "evaluation.summary": z.object({ courseId: z.number().int().positive() }),
  "evaluation.logs": z.object({ courseId: z.number().int().positive(), ...page }),
};
