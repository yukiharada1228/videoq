import { z } from "zod";
import { citationSchema, chatFeedbackSchema } from "./model-schemas";

export { CitationTextParser, parseCitationParts, serializeChatParts, appendChatPart } from "./chat-content";
export type { ChatContentPart, InvalidCitationReason } from "./chat-content";
export { advanceChatTextContext, parseChatText } from "./chat-syntax";
export type { ChatTextNode } from "./chat-syntax";

export const CHAT_STREAM_FORMAT = "parts-v1";
export const CHAT_STREAM_FORMAT_QUERY = "stream_format";
const referenceId = z.number().int().positive().safe();
export const chatSourceSchema = citationSchema.extend({ id: referenceId, video_id: referenceId });

/** Additive opt-in protocol; requests without stream_format retain content_chunk. */
export const chatStreamEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("content_chunk"), text: z.string(), citations: z.array(citationSchema).optional() }),
  z.object({ type: z.literal("source"), source: chatSourceSchema }),
  z.object({ type: z.literal("text_delta"), text: z.string() }),
  z.object({ type: z.literal("citation"), sourceId: referenceId }),
  z.object({ type: z.literal("searching"), query: z.string(), search_id: referenceId.optional() }),
  z.object({ type: z.literal("search_completed"), query: z.string(), search_id: referenceId, result_count: z.number().int().nonnegative() }),
  z.object({ type: z.literal("done"), chat_log_id: referenceId.nullable(), feedback: chatFeedbackSchema, citations: z.array(citationSchema).optional() }),
  z.object({ type: z.literal("error"), code: z.string(), message: z.string() }),
]);
export type ChatStreamEvent = z.infer<typeof chatStreamEventSchema>;
