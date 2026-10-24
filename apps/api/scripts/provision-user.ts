import { parseArgs } from "node:util";
import { nodeBindings } from "../src/runtime/node-config";
import { provisionOnpremUser, resetOnpremUserAccess } from "../src/features/admin/onprem-users";
import { adminInputSchemas } from "@videoq/trpc/admin";
import pg from "pg";
import { postgresRateLimitBackend } from "../src/runtime/postgres-rate-limit";

const { values } = parseArgs({ options: {
  email: { type: "string" }, username: { type: "string" },
  admin: { type: "boolean", default: false }, reset: { type: "string" },
} });

let pool: pg.Pool | undefined;
try {
  const env = nodeBindings(process.env);
  pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 4 });
  env.DATABASE_POOL = pool;
  env.RATE_LIMIT_BACKEND = postgresRateLimitBackend(pool);
  const result = values.reset
    ? await resetOnpremUserAccess(env, values.reset)
    : await provisionOnpremUser(env, {
      ...adminInputSchemas["admin.createUser"].parse({ email: values.email, username: values.username }),
      admin: values.admin,
    });
  // The operator intentionally receives this short-lived credential. It is not
  // printed by HTTP request logs and is never written to a repository file.
  console.log(JSON.stringify(result));
} catch {
  console.error("Account provisioning failed. Check the account details and on-prem runtime configuration.");
  process.exitCode = 1;
} finally {
  await pool?.end();
}
