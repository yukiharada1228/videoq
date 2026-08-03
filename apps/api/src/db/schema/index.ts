/**
 * Drizzle schema 正本（DB introspect 由来）。
 * 変更後: `npm run db:generate` → `npm run db:migrate`
 */
export * from "./tables";
export * from "./relations";

import * as tables from "./tables";
import * as relations from "./relations";

/** drizzle(client, { schema }) 用。 */
export const schema = { ...tables, ...relations };
