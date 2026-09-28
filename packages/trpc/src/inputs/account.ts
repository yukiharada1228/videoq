import { z } from "zod";

export const accountInputSchemas = {
  "account.me": z.undefined(),
  "account.integrationApiKeys": z.undefined(),
  "account.connectedApps": z.undefined(),
  "account.searchApiKeyStatus": z.undefined(),
  "account.saveSearchApiKey": z.object({ apiKey: z.string().min(1) }),
  "account.deleteSearchApiKey": z.undefined(),
};
