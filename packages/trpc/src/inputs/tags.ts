import { z } from "zod";
import { tagColorSchema } from "../schema";

const id = z.number().int().positive();

export const tagsInputSchemas = {
  "tags.list": z.object({
    limit: z.number().int().positive().max(100).default(100),
    offset: z.number().int().nonnegative().default(0),
  }).default({ limit: 100, offset: 0 }),
  "tags.get": z.object({ id }),
  "tags.create": z.object({ name: z.string().min(1).max(50), color: tagColorSchema.default("gray") }),
  "tags.update": z.object({
    id,
    name: z.string().min(1).max(50).optional(),
    color: tagColorSchema.optional(),
  }),
  "tags.delete": z.object({ id }),
};
