/**
 * VideoQ 業務テーブル（旧 Django app_*）。
 * テーブル名は互換のため維持。DDL 正本は Drizzle（django migrations 凍結）。
 */
import {
  bigint,
  bigserial,
  boolean,
  customType,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

const bytea = customType<{ data: Buffer | null; driverData: Buffer | null }>({
  dataType() {
    return "bytea";
  },
});

export const appUser = pgTable(
  "app_user",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    password: varchar("password", { length: 128 }).notNull(),
    lastLogin: timestamp("last_login", { withTimezone: true }),
    isSuperuser: boolean("is_superuser").notNull().default(false),
    username: varchar("username", { length: 150 }).notNull(),
    firstName: varchar("first_name", { length: 150 }).notNull().default(""),
    lastName: varchar("last_name", { length: 150 }).notNull().default(""),
    email: varchar("email", { length: 254 }).notNull(),
    isStaff: boolean("is_staff").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    dateJoined: timestamp("date_joined", { withTimezone: true }).notNull(),
    pendingEmail: varchar("pending_email", { length: 254 }),
    maxVideoUploadSizeMb: integer("max_video_upload_size_mb").notNull(),
    storageLimitGb: doublePrecision("storage_limit_gb"),
    processingLimitMinutes: integer("processing_limit_minutes"),
    aiAnswersLimit: integer("ai_answers_limit"),
    usedStorageBytes: bigint("used_storage_bytes", { mode: "number" })
      .notNull()
      .default(0),
    usedProcessingSeconds: integer("used_processing_seconds").notNull().default(0),
    usedAiAnswers: integer("used_ai_answers").notNull().default(0),
    usagePeriodStart: timestamp("usage_period_start", { withTimezone: true }),
    isOverQuota: boolean("is_over_quota").notNull().default(false),
    searchapiApiKeyEncrypted: bytea("searchapi_api_key_encrypted"),
    deactivatedAt: timestamp("deactivated_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("app_user_username_key").on(t.username)],
);

export const appVideo = pgTable("app_video", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  userId: bigint("user_id", { mode: "number" }).notNull(),
  file: varchar("file", { length: 100 }).notNull().default(""),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description").notNull().default(""),
  sourceType: varchar("source_type", { length: 20 }).notNull().default("uploaded"),
  sourceUrl: varchar("source_url", { length: 200 }).notNull().default(""),
  youtubeVideoId: varchar("youtube_video_id", { length: 32 }).notNull().default(""),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull(),
  transcript: text("transcript").notNull().default(""),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  errorMessage: text("error_message").notNull().default(""),
});

export const appVideoGroup = pgTable("app_videogroup", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  userId: bigint("user_id", { mode: "number" }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description").notNull().default(""),
  displayOrder: integer("display_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  shareSlug: varchar("share_slug", { length: 64 }),
});

export const appVideoGroupMember = pgTable("app_videogroupmember", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  groupId: bigint("group_id", { mode: "number" }).notNull(),
  videoId: bigint("video_id", { mode: "number" }).notNull(),
  addedAt: timestamp("added_at", { withTimezone: true }).notNull(),
  order: integer("order").notNull().default(0),
});

export const appTag = pgTable("app_tag", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  userId: bigint("user_id", { mode: "number" }).notNull(),
  name: varchar("name", { length: 50 }).notNull(),
  color: varchar("color", { length: 20 }).notNull().default("blue"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

export const appVideoTag = pgTable("app_videotag", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  videoId: bigint("video_id", { mode: "number" }).notNull(),
  tagId: bigint("tag_id", { mode: "number" }).notNull(),
  addedAt: timestamp("added_at", { withTimezone: true }).notNull(),
});

export const appChatLog = pgTable("app_chatlog", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  userId: bigint("user_id", { mode: "number" }).notNull(),
  groupId: bigint("group_id", { mode: "number" }).notNull(),
  question: text("question").notNull(),
  answer: text("answer").notNull(),
  citations: jsonb("citations").notNull().default([]),
  retrievedContexts: jsonb("retrieved_contexts").notNull().default([]),
  isSharedOrigin: boolean("is_shared_origin").notNull().default(false),
  feedback: varchar("feedback", { length: 4 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

export const appChatLogEvaluation = pgTable("app_chatlogevaluation", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  chatLogId: bigint("chat_log_id", { mode: "number" }).notNull(),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  faithfulness: doublePrecision("faithfulness"),
  answerRelevancy: doublePrecision("answer_relevancy"),
  contextPrecision: doublePrecision("context_precision"),
  errorMessage: text("error_message").notNull().default(""),
  evaluatedAt: timestamp("evaluated_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

export const appUserApiKey = pgTable("app_userapikey", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  userId: bigint("user_id", { mode: "number" }).notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  accessLevel: varchar("access_level", { length: 20 }).notNull().default("all"),
  prefix: varchar("prefix", { length: 12 }).notNull(),
  hashedKey: varchar("hashed_key", { length: 64 }).notNull(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

export const appAccountDeletionRequest = pgTable("app_accountdeletionrequest", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  userId: bigint("user_id", { mode: "number" }).notNull(),
  reason: text("reason").notNull().default(""),
  requestedAt: timestamp("requested_at", { withTimezone: true }).notNull(),
});

export const appPlogBuildJob = pgTable("app_plogbuildjob", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  videoId: bigint("video_id", { mode: "number" }).notNull(),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  errorMessage: text("error_message").notNull().default(""),
  inputTokens: integer("input_tokens").notNull().default(0),
  outputTokens: integer("output_tokens").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
});

export const appPlogSummaryNode = pgTable("app_plogsummarynode", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  videoId: bigint("video_id", { mode: "number" }).notNull(),
  parentId: bigint("parent_id", { mode: "number" }),
  level: smallint("level").notNull().default(0),
  text: text("text").notNull(),
  startSec: real("start_sec").notNull().default(0),
  endSec: real("end_sec").notNull().default(0),
  sceneIndices: jsonb("scene_indices").notNull().default([]),
  embedding: jsonb("embedding").notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

export const appPlogConcept = pgTable("app_plogconcept", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  videoId: bigint("video_id", { mode: "number" }).notNull(),
  label: varchar("label", { length: 255 }).notNull(),
  nodeType: varchar("node_type", { length: 20 }).notNull().default("object"),
  introSec: real("intro_sec").notNull().default(0),
  sourceQuote: text("source_quote").notNull().default(""),
  embedding: jsonb("embedding").notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

export const appPlogEdge = pgTable("app_plogedge", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  videoId: bigint("video_id", { mode: "number" }).notNull(),
  sourceId: bigint("source_id", { mode: "number" }).notNull(),
  targetId: bigint("target_id", { mode: "number" }).notNull(),
  edgeType: varchar("edge_type", { length: 32 }).notNull(),
  quote: text("quote").notNull().default(""),
  validationStatus: varchar("validation_status", { length: 20 })
    .notNull()
    .default("validated"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

export const appPlogLearningObject = pgTable("app_ploglearningobject", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  conceptId: bigint("concept_id", { mode: "number" }).notNull(),
  openingQuestion: text("opening_question").notNull().default(""),
  hintLadder: jsonb("hint_ladder").notNull().default([]),
  misconceptions: jsonb("misconceptions").notNull().default([]),
  canonicalOrder: jsonb("canonical_order").notNull().default([]),
  workedExamples: jsonb("worked_examples").notNull().default([]),
  waypoints: jsonb("waypoints").notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

export const appLearnerConceptState = pgTable("app_learnerconceptstate", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  userId: bigint("user_id", { mode: "number" }).notNull(),
  conceptId: bigint("concept_id", { mode: "number" }).notNull(),
  reached: boolean("reached").notNull().default(false),
  hintIndex: smallint("hint_index").notNull().default(0),
  lastGrade: varchar("last_grade", { length: 32 }).notNull().default(""),
  active: boolean("active").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

/** pgvector シーン（langchain-postgres 由来。演算は raw SQL）。 */
export const videoqScenes = pgTable(
  "videoq_scenes",
  {
    id: varchar("id", { length: 255 }).primaryKey(),
    // embedding vector(N) — drizzle では custom; 検索は sql テンプレート
    content: text("content"),
    userId: integer("user_id"),
    videoId: integer("video_id"),
    // langchain metadata jsonb 等は環境差があるため必要列のみ
  },
  (t) => [index("videoq_scenes_user_video_idx").on(t.userId, t.videoId)],
);
