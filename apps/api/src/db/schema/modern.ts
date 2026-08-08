import {
	pgTable,
	bigint,
	varchar,
	timestamp,
	unique,
	integer,
	index,
	foreignKey,
	check,
	text,
	smallint,
	jsonb,
	boolean,
	uniqueIndex,
	uuid,
	vector,
	json,
	doublePrecision,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Users & auth
// ---------------------------------------------------------------------------

export const users = pgTable(
	"users",
	{
		/** Better Auth default: string UUID (text PK). */
		id: text("id").primaryKey(),
		/** Better Auth display name (required by BA). */
		name: text("name").notNull().default(""),
		email: varchar({ length: 254 }).notNull(),
		emailVerified: boolean("email_verified").notNull().default(false),
		image: text("image"),
		createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
			.notNull()
			.defaultNow(),
		username: varchar({ length: 150 }).notNull(),
		displayUsername: text("display_username"),
		/** Better Auth admin plugin role (`admin` | `user`). */
		role: text("role").notNull().default("user"),
		banned: boolean("banned").default(false),
		banReason: text("ban_reason"),
		banExpires: timestamp("ban_expires", { withTimezone: true, mode: "string" }),
		lastLogin: timestamp("last_login", { withTimezone: true, mode: "string" }),
		firstName: varchar("first_name", { length: 150 }).notNull().default(""),
		lastName: varchar("last_name", { length: 150 }).notNull().default(""),
		/** Legacy flag kept for admin UI / quota tooling; prefer `role` + `banned`. */
		isSuperuser: boolean("is_superuser").notNull().default(false),
		isStaff: boolean("is_staff").notNull().default(false),
		isActive: boolean("is_active").notNull().default(true),
		dateJoined: timestamp("date_joined", { withTimezone: true, mode: "string" })
			.notNull()
			.defaultNow(),
		deactivatedAt: timestamp("deactivated_at", { withTimezone: true, mode: "string" }),
		maxVideoUploadSizeMb: integer("max_video_upload_size_mb").notNull(),
		searchapiApiKeyEncrypted: text("searchapi_api_key_encrypted"),
		aiAnswersLimit: integer("ai_answers_limit"),
		isOverQuota: boolean("is_over_quota").notNull(),
		processingLimitMinutes: integer("processing_limit_minutes"),
		storageLimitGb: doublePrecision("storage_limit_gb"),
		usagePeriodStart: timestamp("usage_period_start", { withTimezone: true, mode: "string" }),
		usedAiAnswers: integer("used_ai_answers").notNull(),
		usedProcessingSeconds: integer("used_processing_seconds").notNull(),
		usedStorageBytes: bigint("used_storage_bytes", { mode: "number" }).notNull(),
		pendingEmail: varchar("pending_email", { length: 254 }),
		passwordResetRequired: boolean("password_reset_required").notNull().default(true),
	},
	(table) => [
		index("users_email_active_idx").using(
			"btree",
			table.email.asc().nullsLast(),
			table.isActive.asc().nullsLast(),
		),
		index("users_deactivated_at_idx").using("btree", table.deactivatedAt.asc().nullsLast()),
		unique("users_username_key").on(table.username),
		unique("users_email_key").on(table.email),
		check("users_max_video_upload_size_mb_check", sql`max_video_upload_size_mb >= 0`),
	],
);

export const accountDeletionRequests = pgTable(
	"account_deletion_requests",
	{
		id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({
			name: "account_deletion_requests_id_seq",
			startWith: 1,
			increment: 1,
			minValue: 1,
			maxValue: 9223372036854775807,
			cache: 1,
		}),
		reason: text().notNull(),
		requestedAt: timestamp("requested_at", { withTimezone: true, mode: "string" }).notNull(),
		userId: text("user_id").notNull(),
	},
	(table) => [
		index("account_deletion_requests_user_id_idx").using("btree", table.userId.asc().nullsLast()),
		index("account_deletion_requests_user_requested_idx").using(
			"btree",
			table.userId.asc().nullsLast(),
			table.requestedAt.desc().nullsFirst(),
		),
		foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "account_deletion_requests_user_id_fkey",
		}).onDelete("cascade"),
	],
);

// ---------------------------------------------------------------------------
// Videos, groups, tags
// ---------------------------------------------------------------------------

export const videos = pgTable(
	"videos",
	{
		id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({
			name: "videos_id_seq",
			startWith: 1,
			increment: 1,
			minValue: 1,
			maxValue: 9223372036854775807,
			cache: 1,
		}),
		file: varchar({ length: 100 }).notNull(),
		title: varchar({ length: 255 }).notNull(),
		description: text().notNull(),
		uploadedAt: timestamp("uploaded_at", { withTimezone: true, mode: "string" }).notNull(),
		transcript: text().notNull(),
		status: varchar({ length: 20 }).notNull(),
		errorMessage: text("error_message").notNull(),
		userId: text("user_id").notNull(),
		sourceType: varchar("source_type", { length: 20 }).notNull(),
		sourceUrl: varchar("source_url", { length: 200 }).notNull(),
		youtubeVideoId: varchar("youtube_video_id", { length: 32 }).notNull(),
	},
	(table) => [
		index("videos_user_id_idx").using("btree", table.userId.asc().nullsLast()),
		index("videos_status_idx").using("btree", table.status.asc().nullsLast()),
		index("videos_uploaded_at_idx").using("btree", table.uploadedAt.asc().nullsLast()),
		index("videos_user_status_uploaded_idx").using(
			"btree",
			table.userId.asc().nullsLast(),
			table.status.asc().nullsLast(),
			table.uploadedAt.desc().nullsFirst(),
		),
		foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "videos_user_id_fkey",
		}).onDelete("cascade"),
	],
);

export const videoGroups = pgTable(
	"video_groups",
	{
		id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({
			name: "video_groups_id_seq",
			startWith: 1,
			increment: 1,
			minValue: 1,
			maxValue: 9223372036854775807,
			cache: 1,
		}),
		name: varchar({ length: 255 }).notNull(),
		description: text().notNull(),
		createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull(),
		userId: text("user_id").notNull(),
		shareSlug: varchar("share_slug", { length: 64 }),
		displayOrder: integer("display_order").notNull(),
	},
	(table) => [
		index("video_groups_user_id_idx").using("btree", table.userId.asc().nullsLast()),
		index("video_groups_share_slug_idx")
			.using("btree", table.shareSlug.asc().nullsLast())
			.where(sql`(share_slug IS NOT NULL)`),
		uniqueIndex("video_groups_share_slug_ci_uniq")
			.using("btree", sql`lower((share_slug)::text)`)
			.where(sql`(share_slug IS NOT NULL)`),
		foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "video_groups_user_id_fkey",
		}).onDelete("cascade"),
	],
);

export const videoGroupMembers = pgTable(
	"video_group_members",
	{
		id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({
			name: "video_group_members_id_seq",
			startWith: 1,
			increment: 1,
			minValue: 1,
			maxValue: 9223372036854775807,
			cache: 1,
		}),
		addedAt: timestamp("added_at", { withTimezone: true, mode: "string" }).notNull(),
		order: integer().notNull(),
		groupId: bigint("group_id", { mode: "number" }).notNull(),
		videoId: bigint("video_id", { mode: "number" }).notNull(),
	},
	(table) => [
		index("video_group_members_group_id_idx").using("btree", table.groupId.asc().nullsLast()),
		index("video_group_members_video_id_idx").using("btree", table.videoId.asc().nullsLast()),
		index("video_group_members_group_order_idx").using(
			"btree",
			table.groupId.asc().nullsLast(),
			table.order.asc().nullsLast(),
		),
		foreignKey({
			columns: [table.groupId],
			foreignColumns: [videoGroups.id],
			name: "video_group_members_group_id_fkey",
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.videoId],
			foreignColumns: [videos.id],
			name: "video_group_members_video_id_fkey",
		}).onDelete("cascade"),
		unique("video_group_members_group_video_uniq").on(table.groupId, table.videoId),
	],
);

export const tags = pgTable(
	"tags",
	{
		id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({
			name: "tags_id_seq",
			startWith: 1,
			increment: 1,
			minValue: 1,
			maxValue: 9223372036854775807,
			cache: 1,
		}),
		name: varchar({ length: 50 }).notNull(),
		color: varchar({ length: 20 }).notNull(),
		createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull(),
		userId: text("user_id").notNull(),
	},
	(table) => [
		index("tags_user_id_idx").using("btree", table.userId.asc().nullsLast()),
		foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "tags_user_id_fkey",
		}).onDelete("cascade"),
		unique("tags_user_id_name_uniq").on(table.name, table.userId),
	],
);

export const videoTags = pgTable(
	"video_tags",
	{
		id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({
			name: "video_tags_id_seq",
			startWith: 1,
			increment: 1,
			minValue: 1,
			maxValue: 9223372036854775807,
			cache: 1,
		}),
		addedAt: timestamp("added_at", { withTimezone: true, mode: "string" }).notNull(),
		tagId: bigint("tag_id", { mode: "number" }).notNull(),
		videoId: bigint("video_id", { mode: "number" }).notNull(),
	},
	(table) => [
		index("video_tags_tag_id_idx").using("btree", table.tagId.asc().nullsLast()),
		index("video_tags_video_id_idx").using("btree", table.videoId.asc().nullsLast()),
		foreignKey({
			columns: [table.tagId],
			foreignColumns: [tags.id],
			name: "video_tags_tag_id_fkey",
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.videoId],
			foreignColumns: [videos.id],
			name: "video_tags_video_id_fkey",
		}).onDelete("cascade"),
		unique("video_tags_video_tag_uniq").on(table.tagId, table.videoId),
	],
);

// ---------------------------------------------------------------------------
// Chat & evaluation
// ---------------------------------------------------------------------------

export const chatLogs = pgTable(
	"chat_logs",
	{
		id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({
			name: "chat_logs_id_seq",
			startWith: 1,
			increment: 1,
			minValue: 1,
			maxValue: 9223372036854775807,
			cache: 1,
		}),
		question: text().notNull(),
		answer: text().notNull(),
		citations: jsonb().notNull(),
		isSharedOrigin: boolean("is_shared_origin").notNull(),
		feedback: varchar({ length: 4 }),
		createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull(),
		userId: text("user_id").notNull(),
		groupId: bigint("group_id", { mode: "number" }).notNull(),
		retrievedContexts: jsonb("retrieved_contexts").notNull(),
	},
	(table) => [
		index("chat_logs_user_id_idx").using("btree", table.userId.asc().nullsLast()),
		index("chat_logs_group_id_idx").using("btree", table.groupId.asc().nullsLast()),
		index("chat_logs_group_created_idx").using(
			"btree",
			table.groupId.asc().nullsLast(),
			table.createdAt.desc().nullsFirst(),
		),
		foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "chat_logs_user_id_fkey",
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.groupId],
			foreignColumns: [videoGroups.id],
			name: "chat_logs_group_id_fkey",
		}).onDelete("cascade"),
	],
);

export const chatLogEvaluations = pgTable(
	"chat_log_evaluations",
	{
		id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({
			name: "chat_log_evaluations_id_seq",
			startWith: 1,
			increment: 1,
			minValue: 1,
			maxValue: 9223372036854775807,
			cache: 1,
		}),
		status: varchar({ length: 20 }).notNull(),
		faithfulness: doublePrecision(),
		answerRelevancy: doublePrecision("answer_relevancy"),
		contextPrecision: doublePrecision("context_precision"),
		errorMessage: text("error_message").notNull(),
		evaluatedAt: timestamp("evaluated_at", { withTimezone: true, mode: "string" }),
		createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull(),
		chatLogId: bigint("chat_log_id", { mode: "number" }).notNull(),
	},
	(table) => [
		index("chat_log_evaluations_status_idx").using("btree", table.status.asc().nullsLast()),
		foreignKey({
			columns: [table.chatLogId],
			foreignColumns: [chatLogs.id],
			name: "chat_log_evaluations_chat_log_id_fkey",
		}).onDelete("cascade"),
		unique("chat_log_evaluations_chat_log_id_key").on(table.chatLogId),
	],
);

export const groupEvaluationSnapshots = pgTable(
	"group_evaluation_snapshots",
	{
		id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({
			name: "group_evaluation_snapshots_id_seq",
			startWith: 1,
			increment: 1,
			minValue: 1,
			maxValue: 9223372036854775807,
			cache: 1,
		}),
		sampleCount: integer("sample_count").notNull(),
		faithfulnessMean: doublePrecision("faithfulness_mean"),
		answerRelevancyMean: doublePrecision("answer_relevancy_mean"),
		samples: jsonb().notNull(),
		createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull(),
		groupId: bigint("group_id", { mode: "number" }).notNull(),
		userId: text("user_id").notNull(),
		contextPrecisionMean: doublePrecision("context_precision_mean"),
	},
	(table) => [
		index("group_evaluation_snapshots_user_id_idx").using("btree", table.userId.asc().nullsLast()),
		foreignKey({
			columns: [table.groupId],
			foreignColumns: [videoGroups.id],
			name: "group_evaluation_snapshots_group_id_fkey",
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "group_evaluation_snapshots_user_id_fkey",
		}).onDelete("cascade"),
		unique("group_evaluation_snapshots_group_id_key").on(table.groupId),
	],
);

// ---------------------------------------------------------------------------
// Plog
// ---------------------------------------------------------------------------

export const plogBuildJobs = pgTable(
	"plog_build_jobs",
	{
		id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({
			name: "plog_build_jobs_id_seq",
			startWith: 1,
			increment: 1,
			minValue: 1,
			maxValue: 9223372036854775807,
			cache: 1,
		}),
		status: varchar({ length: 20 }).notNull(),
		errorMessage: text("error_message").notNull(),
		inputTokens: integer("input_tokens").notNull(),
		outputTokens: integer("output_tokens").notNull(),
		createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull(),
		finishedAt: timestamp("finished_at", { withTimezone: true, mode: "string" }),
		videoId: bigint("video_id", { mode: "number" }).notNull(),
	},
	(table) => [
		index("plog_build_jobs_video_id_idx").using("btree", table.videoId.asc().nullsLast()),
		index("plog_build_jobs_status_idx").using("btree", table.status.asc().nullsLast()),
		foreignKey({
			columns: [table.videoId],
			foreignColumns: [videos.id],
			name: "plog_build_jobs_video_id_fkey",
		}).onDelete("cascade"),
		check("plog_build_jobs_input_tokens_check", sql`input_tokens >= 0`),
		check("plog_build_jobs_output_tokens_check", sql`output_tokens >= 0`),
	],
);

export const plogSummaryNodes = pgTable(
	"plog_summary_nodes",
	{
		id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({
			name: "plog_summary_nodes_id_seq",
			startWith: 1,
			increment: 1,
			minValue: 1,
			maxValue: 9223372036854775807,
			cache: 1,
		}),
		level: smallint().notNull(),
		text: text().notNull(),
		startSec: doublePrecision("start_sec").notNull(),
		endSec: doublePrecision("end_sec").notNull(),
		sceneIndices: jsonb("scene_indices").notNull(),
		embedding: jsonb().notNull(),
		createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull(),
		parentId: bigint("parent_id", { mode: "number" }),
		videoId: bigint("video_id", { mode: "number" }).notNull(),
	},
	(table) => [
		index("plog_summary_nodes_video_id_idx").using("btree", table.videoId.asc().nullsLast()),
		index("plog_summary_nodes_parent_id_idx").using("btree", table.parentId.asc().nullsLast()),
		foreignKey({
			columns: [table.parentId],
			foreignColumns: [table.id],
			name: "plog_summary_nodes_parent_id_fkey",
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.videoId],
			foreignColumns: [videos.id],
			name: "plog_summary_nodes_video_id_fkey",
		}).onDelete("cascade"),
		check("plog_summary_nodes_level_check", sql`level >= 0`),
	],
);

export const plogConcepts = pgTable(
	"plog_concepts",
	{
		id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({
			name: "plog_concepts_id_seq",
			startWith: 1,
			increment: 1,
			minValue: 1,
			maxValue: 9223372036854775807,
			cache: 1,
		}),
		label: varchar({ length: 255 }).notNull(),
		nodeType: varchar("node_type", { length: 20 }).notNull(),
		introSec: doublePrecision("intro_sec").notNull(),
		sourceQuote: text("source_quote").notNull(),
		embedding: jsonb().notNull(),
		createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull(),
		videoId: bigint("video_id", { mode: "number" }).notNull(),
	},
	(table) => [
		index("plog_concepts_video_id_idx").using("btree", table.videoId.asc().nullsLast()),
		foreignKey({
			columns: [table.videoId],
			foreignColumns: [videos.id],
			name: "plog_concepts_video_id_fkey",
		}).onDelete("cascade"),
		unique("plog_concepts_label_video_uniq").on(table.label, table.videoId),
	],
);

export const plogEdges = pgTable(
	"plog_edges",
	{
		id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({
			name: "plog_edges_id_seq",
			startWith: 1,
			increment: 1,
			minValue: 1,
			maxValue: 9223372036854775807,
			cache: 1,
		}),
		edgeType: varchar("edge_type", { length: 32 }).notNull(),
		quote: text().notNull(),
		validationStatus: varchar("validation_status", { length: 20 }).notNull(),
		createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull(),
		sourceId: bigint("source_id", { mode: "number" }).notNull(),
		targetId: bigint("target_id", { mode: "number" }).notNull(),
		videoId: bigint("video_id", { mode: "number" }).notNull(),
	},
	(table) => [
		index("plog_edges_video_id_idx").using("btree", table.videoId.asc().nullsLast()),
		index("plog_edges_source_id_idx").using("btree", table.sourceId.asc().nullsLast()),
		index("plog_edges_target_id_idx").using("btree", table.targetId.asc().nullsLast()),
		foreignKey({
			columns: [table.sourceId],
			foreignColumns: [plogConcepts.id],
			name: "plog_edges_source_id_fkey",
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.targetId],
			foreignColumns: [plogConcepts.id],
			name: "plog_edges_target_id_fkey",
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.videoId],
			foreignColumns: [videos.id],
			name: "plog_edges_video_id_fkey",
		}).onDelete("cascade"),
		unique("plog_edges_typed_pair_uniq").on(table.edgeType, table.sourceId, table.targetId, table.videoId),
	],
);

export const plogLearningObjects = pgTable(
	"plog_learning_objects",
	{
		id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({
			name: "plog_learning_objects_id_seq",
			startWith: 1,
			increment: 1,
			minValue: 1,
			maxValue: 9223372036854775807,
			cache: 1,
		}),
		openingQuestion: text("opening_question").notNull(),
		hintLadder: jsonb("hint_ladder").notNull(),
		misconceptions: jsonb().notNull(),
		canonicalOrder: jsonb("canonical_order").notNull(),
		workedExamples: jsonb("worked_examples").notNull(),
		waypoints: jsonb().notNull(),
		createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull(),
		conceptId: bigint("concept_id", { mode: "number" }).notNull(),
	},
	(table) => [
		foreignKey({
			columns: [table.conceptId],
			foreignColumns: [plogConcepts.id],
			name: "plog_learning_objects_concept_id_fkey",
		}).onDelete("cascade"),
		unique("plog_learning_objects_concept_id_key").on(table.conceptId),
	],
);

export const learnerConceptStates = pgTable(
	"learner_concept_states",
	{
		id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({
			name: "learner_concept_states_id_seq",
			startWith: 1,
			increment: 1,
			minValue: 1,
			maxValue: 9223372036854775807,
			cache: 1,
		}),
		reached: boolean().notNull(),
		hintIndex: smallint("hint_index").notNull(),
		lastGrade: varchar("last_grade", { length: 32 }).notNull(),
		active: boolean().notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull(),
		createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull(),
		conceptId: bigint("concept_id", { mode: "number" }).notNull(),
		userId: text("user_id").notNull(),
	},
	(table) => [
		index("learner_concept_states_user_id_idx").using("btree", table.userId.asc().nullsLast()),
		index("learner_concept_states_concept_id_idx").using("btree", table.conceptId.asc().nullsLast()),
		foreignKey({
			columns: [table.conceptId],
			foreignColumns: [plogConcepts.id],
			name: "learner_concept_states_concept_id_fkey",
		}).onDelete("cascade"),
		foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "learner_concept_states_user_id_fkey",
		}).onDelete("cascade"),
		unique("learner_concept_states_concept_user_uniq").on(table.conceptId, table.userId),
		check("learner_concept_states_hint_index_check", sql`hint_index >= 0`),
	],
);

// ---------------------------------------------------------------------------
// Vector embeddings
// ---------------------------------------------------------------------------

export const sceneEmbeddings = pgTable(
	"scene_embeddings",
	{
		langchainId: uuid("langchain_id").primaryKey().notNull(),
		content: text().notNull(),
		embedding: vector({ dimensions: 1536 }).notNull(),
		userId: text("user_id").notNull(),
		videoId: bigint("video_id", { mode: "number" }).notNull(),
		langchainMetadata: json("langchain_metadata"),
	},
	(table) => [
		index("scene_embeddings_user_id_idx").on(table.userId),
		index("scene_embeddings_video_id_idx").on(table.videoId),
	],
);

