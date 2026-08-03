import { z } from "../../shared/openapi";

export const mediaQuerySchema = z.object({
  share_slug: z.string().optional(),
  share_token: z.string().optional(),
});
