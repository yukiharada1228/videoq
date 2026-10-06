import { z } from "zod";

const locale = z.enum(["en", "ja"]).optional();

export const billingInputSchemas = {
  "billing.plans": z.object({ locale }).default({}),
  "billing.checkout": z.object({ lookupKey: z.string().min(1), locale }),
  "billing.portal": z.object({ locale }).default({}),
};
