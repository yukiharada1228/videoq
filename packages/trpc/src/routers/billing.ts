import { protectedProcedure, publicProcedure, t } from "../init";
import { billingInputSchemas } from "../inputs/billing";
import { outputSchemas } from "../outputs";

export const billingRouter = t.router({
  plans: publicProcedure
    .input(billingInputSchemas["billing.plans"])
    .output(outputSchemas["billing.plans"])
    .query(({ ctx, input }) => ctx.call("billing.plans", input)),
  checkout: protectedProcedure
    .input(billingInputSchemas["billing.checkout"])
    .output(outputSchemas["billing.checkout"])
    .mutation(({ ctx, input }) => ctx.call("billing.checkout", input)),
  portal: protectedProcedure
    .input(billingInputSchemas["billing.portal"])
    .output(outputSchemas["billing.portal"])
    .mutation(({ ctx, input }) => ctx.call("billing.portal", input)),
});
