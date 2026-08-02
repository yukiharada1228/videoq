export * from "./app";
export * from "./oauth";

import * as app from "./app";
import * as oauth from "./oauth";

/** drizzle(client, { schema }) 用。 */
export const schema = { ...app, ...oauth };
