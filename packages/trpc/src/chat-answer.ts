import { z } from "zod";

export const sourceIdSchema = z.number().int().positive().safe();
export const chatSourceSchema = z.object({
  id: sourceIdSchema,
  video_id: sourceIdSchema,
  title: z.string(),
  start_time: z.string().nullable(),
  end_time: z.string().nullable(),
  evidence_type: z.enum(["transcript", "visual"]).optional(),
}).strict();

/** The model chooses prose and references, never source metadata or destinations. */
export const modelAnswerSchema = z.object({
  segments: z.array(z.object({
    text: z.string().describe("One claim or scene description sharing the same evidence. Start a new segment when the scene, topic or supporting sources change; never combine a multi-scene overview into one text. Texts are concatenated with NO separator. Include leading whitespace for later passages. Preserve complete TeX expressions and code blocks."),
    sourceIds: z.array(z.number()).describe("Only the smallest set of retrieved evidence IDs directly supporting THIS passage, usually 1 or 2; not every source inspected. Visual descriptions cite the matching visual observations. Empty for metadata-only or unsupported statements."),
  }).strict()).min(1).describe("Separate claims or scenes with their own supporting citations. A multi-scene answer must have multiple segments rather than collecting all citations at the end."),
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
