import { z } from "zod";

export const CHAT_MAX_MESSAGES = 100;
export const CHAT_MAX_MESSAGE_CHARS = 16_000;
export const CHAT_MAX_TOTAL_CHARS = 64_000;
/** Includes JSON framing and worst-case UTF-8/escaping overhead. */
export const CHAT_REQUEST_MAX_BYTES = 512 * 1024;
/** Shared by the HTTP batch client and server transport. */
export const TRPC_MAX_BATCH_SIZE = 10;

export const chatMessageSchema = z.object({
  role: z.enum(["user", "assistant", "system"]),
  content: z
    .string()
    .trim()
    .min(1)
    .max(CHAT_MAX_MESSAGE_CHARS, `Message must be at most ${CHAT_MAX_MESSAGE_CHARS} characters`),
});

/**
 * Q&A uses only the latest user message; send one self-contained question.
 * Study also uses the previous assistant question (web: up to 12 messages).
 * Accepting a message array does not imply Q&A conversation memory.
 */
export const chatMessagesSchema = z
  .array(chatMessageSchema)
  .min(1)
  .max(CHAT_MAX_MESSAGES, `At most ${CHAT_MAX_MESSAGES} messages are allowed`)
  .superRefine((messages, ctx) => {
    const totalChars = messages.reduce(
      (total, message) => total + message.content.length,
      0,
    );
    if (totalChars > CHAT_MAX_TOTAL_CHARS) {
      ctx.addIssue({
        code: "custom",
        message: `Message content must total at most ${CHAT_MAX_TOTAL_CHARS} characters`,
      });
    }
  });

export const TAG_COLORS = [
  "gray",
  "blue",
  "light-blue",
  "cyan",
  "green",
  "lime",
  "yellow",
  "orange",
  "red",
  "magenta",
  "purple",
] as const;

export const tagColorSchema = z.enum(TAG_COLORS);
export type TagColor = z.infer<typeof tagColorSchema>;

export const VIDEO_STATUSES = [
  "uploading",
  "pending",
  "processing",
  "indexing",
  "completed",
  "error",
] as const;

export const VIDEO_SOURCE_TYPES = ["uploaded", "youtube"] as const;

export const videoStatusSchema = z.enum(VIDEO_STATUSES);
export const videoSourceTypeSchema = z.enum(VIDEO_SOURCE_TYPES);

export const videoTagSchema = z.object({
  id: z.number(),
  name: z.string(),
  color: z.string(),
});

export const videoListItemSchema = z.object({
  id: z.number(),
  file: z.string().nullable(),
  source_type: videoSourceTypeSchema,
  source_url: z.string().nullable().optional(),
  youtube_video_id: z.string().nullable().optional(),
  youtube_embed_url: z.string().nullable().optional(),
  title: z.string(),
  description: z.string(),
  uploaded_at: z.string(),
  status: videoStatusSchema,
  tags: z.array(videoTagSchema).optional(),
});

export const videoSchema = videoListItemSchema.extend({
  user: z.string().optional(),
  transcript: z.string().nullable().optional(),
  error_message: z.string().nullable().optional(),
});
