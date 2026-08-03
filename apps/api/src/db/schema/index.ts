/** Runtime Drizzle schema. */
export * from "./modern";

import * as modern from "./modern";

/** drizzle(client, { schema }) uses only application-owned tables. */
export const schema = { ...modern };
