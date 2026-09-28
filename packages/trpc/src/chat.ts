import { z } from "zod";
import { chatFeedbackSchema } from "./model-schemas";
import { chatSourceSchema, sourceIdSchema } from "./chat-answer";

export * from "./chat-answer";
export { appendChatPart, applyChatPart, answerParts } from "./chat-content";
export type { ChatContentPart } from "./chat-content";
export { advanceChatTextContext, parseChatText, protectedTextRanges } from "./chat-syntax";
export type { ChatTextNode } from "./chat-syntax";

const segmentIndex = z.number().int().nonnegative().safe();
export const chatStreamEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("source"), source: chatSourceSchema }),
  z.object({ type: z.literal("text_delta"), segmentIndex, text: z.string() }),
  z.object({ type: z.literal("citation"), segmentIndex, sourceId: sourceIdSchema }),
  z.object({ type: z.literal("searching"), query: z.string(), search_id: sourceIdSchema }),
  z.object({ type: z.literal("search_completed"), query: z.string(), search_id: sourceIdSchema, result_count: z.number().int().nonnegative() }),
  z.object({ type: z.literal("done"), chat_log_id: sourceIdSchema.nullable(), feedback: chatFeedbackSchema }),
  z.object({ type: z.literal("error"), code: z.string(), message: z.string() }),
]);
export type ChatStreamEvent = z.infer<typeof chatStreamEventSchema>;
