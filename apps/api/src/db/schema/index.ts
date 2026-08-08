/** Runtime Drizzle schema. */
export * from "./modern";
export * from "./better-auth";

import * as modern from "./modern";
import * as betterAuth from "./better-auth";

/** drizzle(client, { schema }) uses only application-owned tables. */
export const schema = { ...modern, ...betterAuth };
