import { z } from "zod";

export const sourceIdSchema = z.number().int().positive().safe();
export const chatSourceSchema = z.object({
  id: sourceIdSchema,
  video_id: sourceIdSchema,
  title: z.string(),
  start_time: z.string().nullable(),
  end_time: z.string().nullable(),
}).strict();

/** The model chooses prose and references, never source metadata or destinations. */
export const modelAnswerSchema = z.object({
  segments: z.array(z.object({
    text: z.string().describe("Literal passage. Texts are concatenated with NO separator. For each segment after the first, include a leading space or two newlines when separating sentences or paragraphs. Preserve TeX, code and whitespace."),
    sourceIds: z.array(z.number()).describe("Retrieved scene IDs supporting this passage; empty for metadata-only or unsupported statements."),
  }).strict()).min(1),
}).strict();
export type ModelAnswer = z.infer<typeof modelAnswerSchema>;

export const chatAnswerSchema = z.object({
  segments: z.array(z.object({ text: z.string(), sourceIds: z.array(sourceIdSchema) }).strict()),
  sources: z.array(chatSourceSchema),
}).strict();
export type ChatAnswer = z.infer<typeof chatAnswerSchema>;
export type ChatSource = z.infer<typeof chatSourceSchema>;

/** Plain text is a projection, never another stored answer. */
export const chatAnswerText = (answer: ChatAnswer): string => answer.segments.map(s => s.text).join("");
export const plainChatAnswer = (text: string): ChatAnswer => ({ segments: [{ text, sourceIds: [] }], sources: [] });
