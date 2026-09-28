import { protectedProcedure, t } from "../init";
import { accountInputSchemas } from "../inputs/account";
import { outputSchemas } from "../outputs";

export const accountRouter = t.router({
  integrationApiKeys: protectedProcedure
    .output(outputSchemas["account.integrationApiKeys"])
    .query(({ ctx }) => ctx.call("account.integrationApiKeys", undefined)),
  connectedApps: protectedProcedure
    .output(outputSchemas["account.connectedApps"])
    .query(({ ctx }) => ctx.call("account.connectedApps", undefined)),
  me: protectedProcedure
    .output(outputSchemas["account.me"])
    .query(({ ctx }) => ctx.call("account.me", undefined)),
  searchApiKeyStatus: protectedProcedure
    .output(outputSchemas["account.searchApiKeyStatus"])
    .query(({ ctx }) => ctx.call("account.searchApiKeyStatus", undefined)),
  saveSearchApiKey: protectedProcedure
    .input(accountInputSchemas["account.saveSearchApiKey"])
    .output(outputSchemas["account.saveSearchApiKey"])
    .mutation(({ ctx, input }) => ctx.call("account.saveSearchApiKey", input)),
  deleteSearchApiKey: protectedProcedure
    .output(outputSchemas["account.deleteSearchApiKey"])
    .mutation(({ ctx }) => ctx.call("account.deleteSearchApiKey", undefined)),
});
