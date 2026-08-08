/**
 * Rebuild 0006_user_id_uuid using drizzle-kit:
 * 1) Materialize 0005_snapshot.json from the pre-UUID schema (git)
 * 2) Run `drizzle-kit generate --name user_id_uuid` against the current schema
 * 3) Replace naive ALTER TYPE SQL with UUID remap custom SQL (same end-state)
 *
 *   npx tsx scripts/generate-user-id-uuid-migration.mjs
 */
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
  existsSync,
  readdirSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { generateDrizzleJson } from "drizzle-kit/api";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const repoRoot = join(root, "../..");
const drizzleDir = join(root, "drizzle");
const metaDir = join(drizzleDir, "meta");
const journalPath = join(metaDir, "_journal.json");

const TAG = "0006_user_id_uuid";
const PREV_TAG = "0005_better_auth";
/** Last commit before UUID user-id cutover on this branch. */
const BASE_COMMIT = "34e42cc";

const REMAP_BODY = `CREATE TABLE "_user_id_remap" (
	"old_id" bigint PRIMARY KEY,
	"new_id" text NOT NULL UNIQUE
);
--> statement-breakpoint
INSERT INTO "_user_id_remap" ("old_id", "new_id")
SELECT "id", gen_random_uuid()::text FROM "users";
--> statement-breakpoint
ALTER TABLE "account_deletion_requests" DROP CONSTRAINT IF EXISTS "account_deletion_requests_user_id_fkey";
--> statement-breakpoint
ALTER TABLE "videos" DROP CONSTRAINT IF EXISTS "videos_user_id_fkey";
--> statement-breakpoint
ALTER TABLE "video_groups" DROP CONSTRAINT IF EXISTS "video_groups_user_id_fkey";
--> statement-breakpoint
ALTER TABLE "tags" DROP CONSTRAINT IF EXISTS "tags_user_id_fkey";
--> statement-breakpoint
ALTER TABLE "chat_logs" DROP CONSTRAINT IF EXISTS "chat_logs_user_id_fkey";
--> statement-breakpoint
ALTER TABLE "group_evaluation_snapshots" DROP CONSTRAINT IF EXISTS "group_evaluation_snapshots_user_id_fkey";
--> statement-breakpoint
ALTER TABLE "learner_concept_states" DROP CONSTRAINT IF EXISTS "learner_concept_states_user_id_fkey";
--> statement-breakpoint
ALTER TABLE "session" DROP CONSTRAINT IF EXISTS "session_user_id_fkey";
--> statement-breakpoint
ALTER TABLE "account" DROP CONSTRAINT IF EXISTS "account_user_id_fkey";
--> statement-breakpoint
ALTER TABLE "oauth_client" DROP CONSTRAINT IF EXISTS "oauth_client_user_id_fkey";
--> statement-breakpoint
ALTER TABLE "oauth_refresh_token" DROP CONSTRAINT IF EXISTS "oauth_refresh_token_user_id_fkey";
--> statement-breakpoint
ALTER TABLE "oauth_access_token" DROP CONSTRAINT IF EXISTS "oauth_access_token_user_id_fkey";
--> statement-breakpoint
ALTER TABLE "oauth_consent" DROP CONSTRAINT IF EXISTS "oauth_consent_user_id_fkey";
--> statement-breakpoint
ALTER TABLE "account_deletion_requests" ADD COLUMN "user_id_new" text;--> statement-breakpoint
UPDATE "account_deletion_requests" t SET "user_id_new" = r."new_id" FROM "_user_id_remap" r WHERE t."user_id" = r."old_id";--> statement-breakpoint
ALTER TABLE "account_deletion_requests" DROP COLUMN "user_id";--> statement-breakpoint
ALTER TABLE "account_deletion_requests" RENAME COLUMN "user_id_new" TO "user_id";--> statement-breakpoint
ALTER TABLE "account_deletion_requests" ALTER COLUMN "user_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "user_id_new" text;--> statement-breakpoint
UPDATE "videos" t SET "user_id_new" = r."new_id" FROM "_user_id_remap" r WHERE t."user_id" = r."old_id";--> statement-breakpoint
ALTER TABLE "videos" DROP COLUMN "user_id";--> statement-breakpoint
ALTER TABLE "videos" RENAME COLUMN "user_id_new" TO "user_id";--> statement-breakpoint
ALTER TABLE "videos" ALTER COLUMN "user_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "video_groups" ADD COLUMN "user_id_new" text;--> statement-breakpoint
UPDATE "video_groups" t SET "user_id_new" = r."new_id" FROM "_user_id_remap" r WHERE t."user_id" = r."old_id";--> statement-breakpoint
ALTER TABLE "video_groups" DROP COLUMN "user_id";--> statement-breakpoint
ALTER TABLE "video_groups" RENAME COLUMN "user_id_new" TO "user_id";--> statement-breakpoint
ALTER TABLE "video_groups" ALTER COLUMN "user_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "tags" ADD COLUMN "user_id_new" text;--> statement-breakpoint
UPDATE "tags" t SET "user_id_new" = r."new_id" FROM "_user_id_remap" r WHERE t."user_id" = r."old_id";--> statement-breakpoint
ALTER TABLE "tags" DROP COLUMN "user_id";--> statement-breakpoint
ALTER TABLE "tags" RENAME COLUMN "user_id_new" TO "user_id";--> statement-breakpoint
ALTER TABLE "tags" ALTER COLUMN "user_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "chat_logs" ADD COLUMN "user_id_new" text;--> statement-breakpoint
UPDATE "chat_logs" t SET "user_id_new" = r."new_id" FROM "_user_id_remap" r WHERE t."user_id" = r."old_id";--> statement-breakpoint
ALTER TABLE "chat_logs" DROP COLUMN "user_id";--> statement-breakpoint
ALTER TABLE "chat_logs" RENAME COLUMN "user_id_new" TO "user_id";--> statement-breakpoint
ALTER TABLE "chat_logs" ALTER COLUMN "user_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "group_evaluation_snapshots" ADD COLUMN "user_id_new" text;--> statement-breakpoint
UPDATE "group_evaluation_snapshots" t SET "user_id_new" = r."new_id" FROM "_user_id_remap" r WHERE t."user_id" = r."old_id";--> statement-breakpoint
ALTER TABLE "group_evaluation_snapshots" DROP COLUMN "user_id";--> statement-breakpoint
ALTER TABLE "group_evaluation_snapshots" RENAME COLUMN "user_id_new" TO "user_id";--> statement-breakpoint
ALTER TABLE "group_evaluation_snapshots" ALTER COLUMN "user_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "learner_concept_states" ADD COLUMN "user_id_new" text;--> statement-breakpoint
UPDATE "learner_concept_states" t SET "user_id_new" = r."new_id" FROM "_user_id_remap" r WHERE t."user_id" = r."old_id";--> statement-breakpoint
ALTER TABLE "learner_concept_states" DROP COLUMN "user_id";--> statement-breakpoint
ALTER TABLE "learner_concept_states" RENAME COLUMN "user_id_new" TO "user_id";--> statement-breakpoint
ALTER TABLE "learner_concept_states" ALTER COLUMN "user_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "scene_embeddings" ADD COLUMN "user_id_new" text;--> statement-breakpoint
UPDATE "scene_embeddings" t SET "user_id_new" = r."new_id" FROM "_user_id_remap" r WHERE t."user_id" = r."old_id";--> statement-breakpoint
ALTER TABLE "scene_embeddings" DROP COLUMN "user_id";--> statement-breakpoint
ALTER TABLE "scene_embeddings" RENAME COLUMN "user_id_new" TO "user_id";--> statement-breakpoint
ALTER TABLE "scene_embeddings" ALTER COLUMN "user_id" SET NOT NULL;
--> statement-breakpoint
DELETE FROM "session";--> statement-breakpoint
DELETE FROM "oauth_access_token";--> statement-breakpoint
DELETE FROM "oauth_refresh_token";--> statement-breakpoint
DELETE FROM "oauth_consent";--> statement-breakpoint
DELETE FROM "device_code";
--> statement-breakpoint
ALTER TABLE "account" ADD COLUMN "user_id_new" text;--> statement-breakpoint
UPDATE "account" t SET "user_id_new" = r."new_id" FROM "_user_id_remap" r WHERE t."user_id" = r."old_id";--> statement-breakpoint
ALTER TABLE "account" DROP COLUMN "user_id";--> statement-breakpoint
ALTER TABLE "account" RENAME COLUMN "user_id_new" TO "user_id";--> statement-breakpoint
ALTER TABLE "account" ALTER COLUMN "user_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "session" ADD COLUMN "user_id_new" text;--> statement-breakpoint
ALTER TABLE "session" DROP COLUMN "user_id";--> statement-breakpoint
ALTER TABLE "session" RENAME COLUMN "user_id_new" TO "user_id";--> statement-breakpoint
ALTER TABLE "session" ALTER COLUMN "user_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "device_code" ADD COLUMN "user_id_new" text;--> statement-breakpoint
ALTER TABLE "device_code" DROP COLUMN "user_id";--> statement-breakpoint
ALTER TABLE "device_code" RENAME COLUMN "user_id_new" TO "user_id";
--> statement-breakpoint
ALTER TABLE "oauth_client" ADD COLUMN "user_id_new" text;--> statement-breakpoint
UPDATE "oauth_client" t SET "user_id_new" = r."new_id" FROM "_user_id_remap" r WHERE t."user_id" = r."old_id";--> statement-breakpoint
ALTER TABLE "oauth_client" DROP COLUMN "user_id";--> statement-breakpoint
ALTER TABLE "oauth_client" RENAME COLUMN "user_id_new" TO "user_id";
--> statement-breakpoint
ALTER TABLE "oauth_refresh_token" ADD COLUMN "user_id_new" text;--> statement-breakpoint
ALTER TABLE "oauth_refresh_token" DROP COLUMN "user_id";--> statement-breakpoint
ALTER TABLE "oauth_refresh_token" RENAME COLUMN "user_id_new" TO "user_id";--> statement-breakpoint
ALTER TABLE "oauth_refresh_token" ALTER COLUMN "user_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "oauth_access_token" ADD COLUMN "user_id_new" text;--> statement-breakpoint
ALTER TABLE "oauth_access_token" DROP COLUMN "user_id";--> statement-breakpoint
ALTER TABLE "oauth_access_token" RENAME COLUMN "user_id_new" TO "user_id";
--> statement-breakpoint
ALTER TABLE "oauth_consent" ADD COLUMN "user_id_new" text;--> statement-breakpoint
ALTER TABLE "oauth_consent" DROP COLUMN "user_id";--> statement-breakpoint
ALTER TABLE "oauth_consent" RENAME COLUMN "user_id_new" TO "user_id";
--> statement-breakpoint
UPDATE "apikey" a SET "reference_id" = r."new_id" FROM "_user_id_remap" r WHERE a."reference_id" = r."old_id"::text;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "id_new" text;--> statement-breakpoint
UPDATE "users" u SET "id_new" = r."new_id" FROM "_user_id_remap" r WHERE u."id" = r."old_id";--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "users_pkey";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "id";--> statement-breakpoint
ALTER TABLE "users" RENAME COLUMN "id_new" TO "id";--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD PRIMARY KEY ("id");--> statement-breakpoint
DROP SEQUENCE IF EXISTS "users_id_seq";
--> statement-breakpoint
ALTER TABLE "account_deletion_requests" ADD CONSTRAINT "account_deletion_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "videos" ADD CONSTRAINT "videos_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "video_groups" ADD CONSTRAINT "video_groups_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "chat_logs" ADD CONSTRAINT "chat_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "group_evaluation_snapshots" ADD CONSTRAINT "group_evaluation_snapshots_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "learner_concept_states" ADD CONSTRAINT "learner_concept_states_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "oauth_client" ADD CONSTRAINT "oauth_client_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "oauth_refresh_token" ADD CONSTRAINT "oauth_refresh_token_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "oauth_access_token" ADD CONSTRAINT "oauth_access_token_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "oauth_consent" ADD CONSTRAINT "oauth_consent_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;
--> statement-breakpoint
DROP TABLE "_user_id_remap";
`;

function gitShow(commit, relPath) {
  return execFileSync("git", ["show", `${commit}:${relPath}`], {
    cwd: repoRoot,
    encoding: "utf8",
  });
}

function readJournal() {
  return JSON.parse(readFileSync(journalPath, "utf8"));
}

function writeJournal(journal) {
  writeFileSync(journalPath, JSON.stringify(journal, null, 2) + "\n");
}

// --- 1) Drop previous 0006 artifacts ---
const journal = readJournal();
journal.entries = journal.entries.filter((e) => e.tag !== TAG);
writeJournal(journal);
rmSync(join(drizzleDir, `${TAG}.sql`), { force: true });
rmSync(join(metaDir, "0006_snapshot.json"), { force: true });

if (!journal.entries.some((e) => e.tag === PREV_TAG)) {
  throw new Error(`journal missing ${PREV_TAG}`);
}

// --- 2) Build 0005_snapshot.json from pre-UUID schema ---
const tmp = join(root, ".tmp-prev-schema");
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });
try {
  for (const file of ["index.ts", "modern.ts", "better-auth.ts"]) {
    writeFileSync(
      join(tmp, file),
      gitShow(BASE_COMMIT, `apps/api/src/db/schema/${file}`),
    );
  }
  const prevSchema = await import(pathToFileURL(join(tmp, "index.ts")).href);
  const prevJson = await generateDrizzleJson(prevSchema);
  const snap0000 = JSON.parse(
    readFileSync(join(metaDir, "0000_snapshot.json"), "utf8"),
  );
  writeFileSync(
    join(metaDir, "0005_snapshot.json"),
    JSON.stringify(
      { ...prevJson, id: prevJson.id || randomUUID(), prevId: snap0000.id },
      null,
      2,
    ) + "\n",
  );
  console.log("wrote meta/0005_snapshot.json from", BASE_COMMIT);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

// --- 3) drizzle-kit generate (hide non-JSON meta/*.hash which breaks kit) ---
const hashPath = join(metaDir, "0000_init.hash");
const hashBak = join(metaDir, "0000_init.hash.bak");
if (existsSync(hashPath)) renameSync(hashPath, hashBak);
try {
  execFileSync(
    "npx",
    ["drizzle-kit", "generate", "--name", "user_id_uuid"],
    { cwd: root, stdio: "inherit" },
  );
} finally {
  if (existsSync(hashBak)) renameSync(hashBak, hashPath);
}

const generatedSql = readdirSync(drizzleDir)
  .filter((n) => n.includes("user_id_uuid") && n.endsWith(".sql"))
  .sort()
  .at(-1);
if (!generatedSql) {
  throw new Error("drizzle-kit generate did not create user_id_uuid.sql");
}
const generatedPath = join(drizzleDir, generatedSql);
const generatedBody = readFileSync(generatedPath, "utf8");
console.log(`drizzle-kit generated ${generatedSql}`);

const targetSqlPath = join(drizzleDir, `${TAG}.sql`);
if (generatedPath !== targetSqlPath) {
  writeFileSync(targetSqlPath, generatedBody);
  rmSync(generatedPath, { force: true });
}

if (!existsSync(join(metaDir, "0006_snapshot.json"))) {
  throw new Error("missing meta/0006_snapshot.json after generate");
}

const preview = generatedBody
  .split(/\s*--> statement-breakpoint\s*/g)
  .map((s) => s.trim())
  .filter(Boolean)
  .map((s) => `--   ${s.replace(/\n/g, " ")}`)
  .join("\n");

writeFileSync(
  targetSqlPath,
  `-- Generated via: drizzle-kit generate --name user_id_uuid
-- Snapshot (schema end-state): drizzle/meta/0006_snapshot.json
--
-- drizzle-kit DDL preview (replaced with UUID remap custom SQL below):
${preview}
--
-- Custom SQL: remap existing bigint ids to new UUIDs (not USING id::text),
-- and invalidate sessions / OAuth tokens whose JWT sub would keep old ids.
-- Regenerate with: npx tsx scripts/generate-user-id-uuid-migration.mjs

${REMAP_BODY}
`,
);

console.log(`wrote ${targetSqlPath} with custom UUID remap SQL`);
console.log("done");
