import { pgTable, bigint, varchar, timestamp, unique, integer, index, foreignKey, check, text, smallint, jsonb, boolean, uniqueIndex, uuid, vector, json, doublePrecision, customType, type AnyPgColumn } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

const bytea = customType<{ data: Buffer | null; driverData: Buffer | null }>({
	dataType() {
		return "bytea";
	},
});




export const djangoMigrations = pgTable("django_migrations", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({ name: "django_migrations_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	app: varchar({ length: 255 }).notNull(),
	name: varchar({ length: 255 }).notNull(),
	applied: timestamp({ withTimezone: true, mode: 'string' }).notNull(),
});

export const djangoContentType = pgTable("django_content_type", {
	id: integer().primaryKey().generatedByDefaultAsIdentity({ name: "django_content_type_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 2147483647, cache: 1 }),
	appLabel: varchar("app_label", { length: 100 }).notNull(),
	model: varchar({ length: 100 }).notNull(),
}, (table) => [
	unique("django_content_type_app_label_model_76bd3d3b_uniq").on(table.appLabel, table.model),
]);

export const authPermission = pgTable("auth_permission", {
	id: integer().primaryKey().generatedByDefaultAsIdentity({ name: "auth_permission_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 2147483647, cache: 1 }),
	name: varchar({ length: 255 }).notNull(),
	contentTypeId: integer("content_type_id").notNull(),
	codename: varchar({ length: 100 }).notNull(),
}, (table) => [
	index("auth_permission_content_type_id_2f476e4b").using("btree", table.contentTypeId.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.contentTypeId],
			foreignColumns: [djangoContentType.id],
			name: "auth_permission_content_type_id_2f476e4b_fk_django_co"
		}),
	unique("auth_permission_content_type_id_codename_01ab375a_uniq").on(table.contentTypeId, table.codename),
]);

export const authGroup = pgTable("auth_group", {
	id: integer().primaryKey().generatedByDefaultAsIdentity({ name: "auth_group_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 2147483647, cache: 1 }),
	name: varchar({ length: 150 }).notNull(),
}, (table) => [
	index("auth_group_name_a6ea08ec_like").using("btree", table.name.asc().nullsLast().op("varchar_pattern_ops")),
	unique("auth_group_name_key").on(table.name),
]);

export const authGroupPermissions = pgTable("auth_group_permissions", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({ name: "auth_group_permissions_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	groupId: integer("group_id").notNull(),
	permissionId: integer("permission_id").notNull(),
}, (table) => [
	index("auth_group_permissions_group_id_b120cbf9").using("btree", table.groupId.asc().nullsLast().op("int4_ops")),
	index("auth_group_permissions_permission_id_84c5c92e").using("btree", table.permissionId.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.groupId],
			foreignColumns: [authGroup.id],
			name: "auth_group_permissions_group_id_b120cbf9_fk_auth_group_id"
		}),
	foreignKey({
			columns: [table.permissionId],
			foreignColumns: [authPermission.id],
			name: "auth_group_permissio_permission_id_84c5c92e_fk_auth_perm"
		}),
	unique("auth_group_permissions_group_id_permission_id_0cd325b0_uniq").on(table.groupId, table.permissionId),
]);

export const appUserGroups = pgTable("app_user_groups", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({ name: "app_user_groups_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	userId: bigint("user_id", { mode: "number" }).notNull(),
	groupId: integer("group_id").notNull(),
}, (table) => [
	index("app_user_groups_group_id_e774d92c").using("btree", table.groupId.asc().nullsLast().op("int4_ops")),
	index("app_user_groups_user_id_e6f878f6").using("btree", table.userId.asc().nullsLast().op("int8_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [appUser.id],
			name: "app_user_groups_user_id_e6f878f6_fk_app_user_id"
		}),
	foreignKey({
			columns: [table.groupId],
			foreignColumns: [authGroup.id],
			name: "app_user_groups_group_id_e774d92c_fk_auth_group_id"
		}),
	unique("app_user_groups_user_id_group_id_73b8e940_uniq").on(table.userId, table.groupId),
]);

export const appUserUserPermissions = pgTable("app_user_user_permissions", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({ name: "app_user_user_permissions_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	userId: bigint("user_id", { mode: "number" }).notNull(),
	permissionId: integer("permission_id").notNull(),
}, (table) => [
	index("app_user_user_permissions_permission_id_4ef8e133").using("btree", table.permissionId.asc().nullsLast().op("int4_ops")),
	index("app_user_user_permissions_user_id_24780b52").using("btree", table.userId.asc().nullsLast().op("int8_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [appUser.id],
			name: "app_user_user_permissions_user_id_24780b52_fk_app_user_id"
		}),
	foreignKey({
			columns: [table.permissionId],
			foreignColumns: [authPermission.id],
			name: "app_user_user_permis_permission_id_4ef8e133_fk_auth_perm"
		}),
	unique("app_user_user_permissions_user_id_permission_id_7c8316ce_uniq").on(table.userId, table.permissionId),
]);

export const appVideogroupmember = pgTable("app_videogroupmember", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({ name: "app_videogroupmember_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	addedAt: timestamp("added_at", { withTimezone: true, mode: 'string' }).notNull(),
	order: integer().notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	groupId: bigint("group_id", { mode: "number" }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	videoId: bigint("video_id", { mode: "number" }).notNull(),
}, (table) => [
	index("app_videogr_group_i_d0eb57_idx").using("btree", table.groupId.asc().nullsLast().op("int4_ops"), table.order.asc().nullsLast().op("int8_ops")),
	index("app_videogr_video_i_f96db2_idx").using("btree", table.videoId.asc().nullsLast().op("int8_ops"), table.groupId.asc().nullsLast().op("int8_ops")),
	index("app_videogroupmember_added_at_8cb55549").using("btree", table.addedAt.asc().nullsLast().op("timestamptz_ops")),
	index("app_videogroupmember_group_id_49a71957").using("btree", table.groupId.asc().nullsLast().op("int8_ops")),
	index("app_videogroupmember_order_45f29711").using("btree", table.order.asc().nullsLast().op("int4_ops")),
	index("app_videogroupmember_video_id_80f96834").using("btree", table.videoId.asc().nullsLast().op("int8_ops")),
	foreignKey({
			columns: [table.groupId],
			foreignColumns: [appVideogroup.id],
			name: "app_videogroupmember_group_id_49a71957_fk_app_videogroup_id"
		}),
	foreignKey({
			columns: [table.videoId],
			foreignColumns: [appVideo.id],
			name: "app_videogroupmember_video_id_80f96834_fk_app_video_id"
		}),
	unique("app_videogroupmember_group_id_video_id_6ac1be60_uniq").on(table.groupId, table.videoId),
]);

export const djangoAdminLog = pgTable("django_admin_log", {
	id: integer().primaryKey().generatedByDefaultAsIdentity({ name: "django_admin_log_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 2147483647, cache: 1 }),
	actionTime: timestamp("action_time", { withTimezone: true, mode: 'string' }).notNull(),
	objectId: text("object_id"),
	objectRepr: varchar("object_repr", { length: 200 }).notNull(),
	actionFlag: smallint("action_flag").notNull(),
	changeMessage: text("change_message").notNull(),
	contentTypeId: integer("content_type_id"),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	userId: bigint("user_id", { mode: "number" }).notNull(),
}, (table) => [
	index("django_admin_log_content_type_id_c4bce8eb").using("btree", table.contentTypeId.asc().nullsLast().op("int4_ops")),
	index("django_admin_log_user_id_c564eba6").using("btree", table.userId.asc().nullsLast().op("int8_ops")),
	foreignKey({
			columns: [table.contentTypeId],
			foreignColumns: [djangoContentType.id],
			name: "django_admin_log_content_type_id_c4bce8eb_fk_django_co"
		}),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [appUser.id],
			name: "django_admin_log_user_id_c564eba6_fk_app_user_id"
		}),
	check("django_admin_log_action_flag_check", sql`action_flag >= 0`),
]);

export const appVideo = pgTable("app_video", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({ name: "app_video_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	file: varchar({ length: 100 }).notNull(),
	title: varchar({ length: 255 }).notNull(),
	description: text().notNull(),
	uploadedAt: timestamp("uploaded_at", { withTimezone: true, mode: 'string' }).notNull(),
	transcript: text().notNull(),
	status: varchar({ length: 20 }).notNull(),
	errorMessage: text("error_message").notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	userId: bigint("user_id", { mode: "number" }).notNull(),
	sourceType: varchar("source_type", { length: 20 }).notNull(),
	sourceUrl: varchar("source_url", { length: 200 }).notNull(),
	youtubeVideoId: varchar("youtube_video_id", { length: 32 }).notNull(),
}, (table) => [
	index("app_video_source_type_505add14").using("btree", table.sourceType.asc().nullsLast().op("text_ops")),
	index("app_video_source_type_505add14_like").using("btree", table.sourceType.asc().nullsLast().op("varchar_pattern_ops")),
	index("app_video_status_d35a7171").using("btree", table.status.asc().nullsLast().op("text_ops")),
	index("app_video_status_d35a7171_like").using("btree", table.status.asc().nullsLast().op("varchar_pattern_ops")),
	index("app_video_uploaded_at_39d6770e").using("btree", table.uploadedAt.asc().nullsLast().op("timestamptz_ops")),
	index("app_video_user_id_3ed4447b").using("btree", table.userId.asc().nullsLast().op("int8_ops")),
	index("app_video_user_id_9c7398_idx").using("btree", table.userId.asc().nullsLast().op("timestamptz_ops"), table.status.asc().nullsLast().op("timestamptz_ops"), table.uploadedAt.desc().nullsFirst().op("int8_ops")),
	index("app_video_user_id_d60748_idx").using("btree", table.userId.asc().nullsLast().op("text_ops"), table.title.asc().nullsLast().op("int8_ops")),
	index("app_video_user_id_de5bbd_idx").using("btree", table.userId.asc().nullsLast().op("timestamptz_ops"), table.sourceType.asc().nullsLast().op("timestamptz_ops"), table.uploadedAt.desc().nullsFirst().op("int8_ops")),
	index("app_video_youtube_video_id_30ca5041").using("btree", table.youtubeVideoId.asc().nullsLast().op("text_ops")),
	index("app_video_youtube_video_id_30ca5041_like").using("btree", table.youtubeVideoId.asc().nullsLast().op("varchar_pattern_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [appUser.id],
			name: "app_video_user_id_3ed4447b_fk_app_user_id"
		}),
]);

export const appChatlog = pgTable("app_chatlog", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({ name: "app_chatlog_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	question: text().notNull(),
	answer: text().notNull(),
	citations: jsonb().notNull(),
	isSharedOrigin: boolean("is_shared_origin").notNull(),
	feedback: varchar({ length: 4 }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	userId: bigint("user_id", { mode: "number" }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	groupId: bigint("group_id", { mode: "number" }).notNull(),
	retrievedContexts: jsonb("retrieved_contexts").notNull(),
}, (table) => [
	index("app_chatlog_created_at_f6c528b1").using("btree", table.createdAt.asc().nullsLast().op("timestamptz_ops")),
	index("app_chatlog_feedback_2b075392").using("btree", table.feedback.asc().nullsLast().op("text_ops")),
	index("app_chatlog_feedback_2b075392_like").using("btree", table.feedback.asc().nullsLast().op("varchar_pattern_ops")),
	index("app_chatlog_group_i_4bc6d0_idx").using("btree", table.groupId.asc().nullsLast().op("int8_ops"), table.createdAt.desc().nullsFirst().op("timestamptz_ops")),
	index("app_chatlog_group_id_89e804ad").using("btree", table.groupId.asc().nullsLast().op("int8_ops")),
	index("app_chatlog_is_shared_origin_4c3d7c4b").using("btree", table.isSharedOrigin.asc().nullsLast().op("bool_ops")),
	index("app_chatlog_user_id_15b02103").using("btree", table.userId.asc().nullsLast().op("int8_ops")),
	index("app_chatlog_user_id_727742_idx").using("btree", table.userId.asc().nullsLast().op("timestamptz_ops"), table.createdAt.desc().nullsFirst().op("timestamptz_ops")),
	index("chatlog_feedback_idx").using("btree", table.feedback.asc().nullsLast().op("text_ops")).where(sql`(feedback IS NOT NULL)`),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [appUser.id],
			name: "app_chatlog_user_id_15b02103_fk_app_user_id"
		}),
	foreignKey({
			columns: [table.groupId],
			foreignColumns: [appVideogroup.id],
			name: "app_chatlog_group_id_89e804ad_fk_app_videogroup_id"
		}),
]);

export const appVideogroup = pgTable("app_videogroup", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({ name: "app_videogroup_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	name: varchar({ length: 255 }).notNull(),
	description: text().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	userId: bigint("user_id", { mode: "number" }).notNull(),
	shareSlug: varchar("share_slug", { length: 64 }),
	displayOrder: integer("display_order").notNull(),
}, (table) => [
	index("app_videogr_user_id_dd31d1_idx").using("btree", table.userId.asc().nullsLast().op("int4_ops"), table.displayOrder.asc().nullsLast().op("timestamptz_ops"), table.createdAt.desc().nullsFirst().op("timestamptz_ops")),
	index("app_videogroup_created_at_ac4989dd").using("btree", table.createdAt.asc().nullsLast().op("timestamptz_ops")),
	index("app_videogroup_display_order_e3a863be").using("btree", table.displayOrder.asc().nullsLast().op("int4_ops")),
	index("app_videogroup_share_slug_4c4c8350").using("btree", table.shareSlug.asc().nullsLast().op("text_ops")),
	index("app_videogroup_share_slug_4c4c8350_like").using("btree", table.shareSlug.asc().nullsLast().op("varchar_pattern_ops")),
	index("app_videogroup_user_id_14cb0044").using("btree", table.userId.asc().nullsLast().op("int8_ops")),
	uniqueIndex("videogroup_share_slug_ci_uniq").using("btree", sql`lower((share_slug)::text)`).where(sql`(share_slug IS NOT NULL)`),
	index("videogroup_share_slug_idx").using("btree", table.shareSlug.asc().nullsLast().op("text_ops")).where(sql`(share_slug IS NOT NULL)`),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [appUser.id],
			name: "app_videogroup_user_id_14cb0044_fk_app_user_id"
		}),
]);

export const appTag = pgTable("app_tag", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({ name: "app_tag_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	name: varchar({ length: 50 }).notNull(),
	color: varchar({ length: 20 }).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	userId: bigint("user_id", { mode: "number" }).notNull(),
}, (table) => [
	index("app_tag_created_at_d1ea9b01").using("btree", table.createdAt.asc().nullsLast().op("timestamptz_ops")),
	index("app_tag_name_749da597").using("btree", table.name.asc().nullsLast().op("text_ops")),
	index("app_tag_name_749da597_like").using("btree", table.name.asc().nullsLast().op("varchar_pattern_ops")),
	index("app_tag_user_id_3eb7ac2a").using("btree", table.userId.asc().nullsLast().op("int8_ops")),
	index("app_tag_user_id_b053bd_idx").using("btree", table.userId.asc().nullsLast().op("int8_ops"), table.name.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [appUser.id],
			name: "app_tag_user_id_3eb7ac2a_fk_app_user_id"
		}),
	unique("app_tag_user_id_name_4d8bb7f5_uniq").on(table.name, table.userId),
]);

export const appVideotag = pgTable("app_videotag", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({ name: "app_videotag_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	addedAt: timestamp("added_at", { withTimezone: true, mode: 'string' }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	tagId: bigint("tag_id", { mode: "number" }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	videoId: bigint("video_id", { mode: "number" }).notNull(),
}, (table) => [
	index("app_videota_tag_id_94f309_idx").using("btree", table.tagId.asc().nullsLast().op("int8_ops"), table.addedAt.desc().nullsFirst().op("timestamptz_ops")),
	index("app_videota_video_i_3d974b_idx").using("btree", table.videoId.asc().nullsLast().op("int8_ops"), table.tagId.asc().nullsLast().op("int8_ops")),
	index("app_videotag_added_at_aadce5c2").using("btree", table.addedAt.asc().nullsLast().op("timestamptz_ops")),
	index("app_videotag_tag_id_ea4fed1c").using("btree", table.tagId.asc().nullsLast().op("int8_ops")),
	index("app_videotag_video_id_fbe1bc77").using("btree", table.videoId.asc().nullsLast().op("int8_ops")),
	foreignKey({
			columns: [table.tagId],
			foreignColumns: [appTag.id],
			name: "app_videotag_tag_id_ea4fed1c_fk_app_tag_id"
		}),
	foreignKey({
			columns: [table.videoId],
			foreignColumns: [appVideo.id],
			name: "app_videotag_video_id_fbe1bc77_fk_app_video_id"
		}),
	unique("app_videotag_video_id_tag_id_dc926f33_uniq").on(table.tagId, table.videoId),
]);

export const djangoSession = pgTable("django_session", {
	sessionKey: varchar("session_key", { length: 40 }).primaryKey().notNull(),
	sessionData: text("session_data").notNull(),
	expireDate: timestamp("expire_date", { withTimezone: true, mode: 'string' }).notNull(),
}, (table) => [
	index("django_session_expire_date_a5c62663").using("btree", table.expireDate.asc().nullsLast().op("timestamptz_ops")),
	index("django_session_session_key_c0390e0f_like").using("btree", table.sessionKey.asc().nullsLast().op("varchar_pattern_ops")),
]);

export const appAccountdeletionrequest = pgTable("app_accountdeletionrequest", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({ name: "app_accountdeletionrequest_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	reason: text().notNull(),
	requestedAt: timestamp("requested_at", { withTimezone: true, mode: 'string' }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	userId: bigint("user_id", { mode: "number" }).notNull(),
}, (table) => [
	index("app_account_user_id_8f2281_idx").using("btree", table.userId.asc().nullsLast().op("int8_ops"), table.requestedAt.desc().nullsFirst().op("timestamptz_ops")),
	index("app_accountdeletionrequest_requested_at_1b2b1cad").using("btree", table.requestedAt.asc().nullsLast().op("timestamptz_ops")),
	index("app_accountdeletionrequest_user_id_d8be8ff6").using("btree", table.userId.asc().nullsLast().op("int8_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [appUser.id],
			name: "app_accountdeletionrequest_user_id_d8be8ff6_fk_app_user_id"
		}),
]);

export const videoqScenes = pgTable("videoq_scenes", {
	langchainId: uuid("langchain_id").primaryKey().notNull(),
	content: text().notNull(),
	embedding: vector({ dimensions: 1024 }).notNull(),
	userId: integer("user_id"),
	videoId: integer("video_id"),
	langchainMetadata: json("langchain_metadata"),
});

export const appUserapikey = pgTable("app_userapikey", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({ name: "app_userapikey_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	name: varchar({ length: 100 }).notNull(),
	prefix: varchar({ length: 12 }).notNull(),
	hashedKey: varchar("hashed_key", { length: 64 }).notNull(),
	lastUsedAt: timestamp("last_used_at", { withTimezone: true, mode: 'string' }),
	revokedAt: timestamp("revoked_at", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	userId: bigint("user_id", { mode: "number" }).notNull(),
	accessLevel: varchar("access_level", { length: 20 }).notNull(),
}, (table) => [
	index("app_userapikey_hashed_key_ef4433cf_like").using("btree", table.hashedKey.asc().nullsLast().op("varchar_pattern_ops")),
	index("app_userapikey_prefix_e83c0375").using("btree", table.prefix.asc().nullsLast().op("text_ops")),
	index("app_userapikey_prefix_e83c0375_like").using("btree", table.prefix.asc().nullsLast().op("varchar_pattern_ops")),
	index("app_userapikey_revoked_at_962cc7a2").using("btree", table.revokedAt.asc().nullsLast().op("timestamptz_ops")),
	index("app_userapikey_user_id_fe6b52b7").using("btree", table.userId.asc().nullsLast().op("int8_ops")),
	uniqueIndex("unique_active_api_key_name_per_user").using("btree", table.userId.asc().nullsLast().op("text_ops"), table.name.asc().nullsLast().op("text_ops")).where(sql`(revoked_at IS NULL)`),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [appUser.id],
			name: "app_userapikey_user_id_fe6b52b7_fk_app_user_id"
		}),
	unique("app_userapikey_hashed_key_key").on(table.hashedKey),
]);

export const djangoCache = pgTable("django_cache", {
	cacheKey: varchar("cache_key", { length: 255 }).primaryKey().notNull(),
	value: text().notNull(),
	expires: timestamp({ withTimezone: true, mode: 'string' }).notNull(),
}, (table) => [
	index("django_cache_expires_idx").using("btree", table.expires.asc().nullsLast().op("timestamptz_ops")),
]);

export const appDocument = pgTable("app_document", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({ name: "app_document_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	title: varchar({ length: 255 }).notNull(),
	file: varchar({ length: 100 }).notNull(),
	mdTree: jsonb("md_tree").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	userId: bigint("user_id", { mode: "number" }).notNull(),
}, (table) => [
	index("app_documen_user_id_4575e2_idx").using("btree", table.userId.asc().nullsLast().op("timestamptz_ops"), table.createdAt.desc().nullsFirst().op("int8_ops")),
	index("app_document_created_at_071869b5").using("btree", table.createdAt.asc().nullsLast().op("timestamptz_ops")),
	index("app_document_user_id_ea8b83b8").using("btree", table.userId.asc().nullsLast().op("int8_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [appUser.id],
			name: "app_document_user_id_ea8b83b8_fk_app_user_id"
		}),
]);

export const appDocumentgroupmember = pgTable("app_documentgroupmember", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({ name: "app_documentgroupmember_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	addedAt: timestamp("added_at", { withTimezone: true, mode: 'string' }).notNull(),
	order: integer().notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	documentId: bigint("document_id", { mode: "number" }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	groupId: bigint("group_id", { mode: "number" }).notNull(),
}, (table) => [
	index("app_documen_group_i_c4a377_idx").using("btree", table.groupId.asc().nullsLast().op("int8_ops"), table.order.asc().nullsLast().op("int4_ops")),
	index("app_documentgroupmember_added_at_ce3de8ba").using("btree", table.addedAt.asc().nullsLast().op("timestamptz_ops")),
	index("app_documentgroupmember_document_id_250b9944").using("btree", table.documentId.asc().nullsLast().op("int8_ops")),
	index("app_documentgroupmember_group_id_51c58381").using("btree", table.groupId.asc().nullsLast().op("int8_ops")),
	index("app_documentgroupmember_order_abddc6a9").using("btree", table.order.asc().nullsLast().op("int4_ops")),
	foreignKey({
			columns: [table.documentId],
			foreignColumns: [appDocument.id],
			name: "app_documentgroupmember_document_id_250b9944_fk_app_document_id"
		}),
	foreignKey({
			columns: [table.groupId],
			foreignColumns: [appVideogroup.id],
			name: "app_documentgroupmember_group_id_51c58381_fk_app_videogroup_id"
		}),
	unique("app_documentgroupmember_group_id_document_id_86648044_uniq").on(table.documentId, table.groupId),
]);

export const appDocumenttag = pgTable("app_documenttag", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({ name: "app_documenttag_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	addedAt: timestamp("added_at", { withTimezone: true, mode: 'string' }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	documentId: bigint("document_id", { mode: "number" }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	tagId: bigint("tag_id", { mode: "number" }).notNull(),
}, (table) => [
	index("app_documen_documen_fde2b3_idx").using("btree", table.documentId.asc().nullsLast().op("int8_ops"), table.tagId.asc().nullsLast().op("int8_ops")),
	index("app_documen_tag_id_b66f22_idx").using("btree", table.tagId.asc().nullsLast().op("int8_ops"), table.addedAt.desc().nullsFirst().op("timestamptz_ops")),
	index("app_documenttag_added_at_08d9c140").using("btree", table.addedAt.asc().nullsLast().op("timestamptz_ops")),
	index("app_documenttag_document_id_dcf38c9e").using("btree", table.documentId.asc().nullsLast().op("int8_ops")),
	index("app_documenttag_tag_id_cbe22395").using("btree", table.tagId.asc().nullsLast().op("int8_ops")),
	foreignKey({
			columns: [table.documentId],
			foreignColumns: [appDocument.id],
			name: "app_documenttag_document_id_dcf38c9e_fk_app_document_id"
		}),
	foreignKey({
			columns: [table.tagId],
			foreignColumns: [appTag.id],
			name: "app_documenttag_tag_id_cbe22395_fk_app_tag_id"
		}),
	unique("app_documenttag_document_id_tag_id_866b55f0_uniq").on(table.documentId, table.tagId),
]);

export const appGroupevaluationsnapshot = pgTable("app_groupevaluationsnapshot", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({ name: "app_groupevaluationsnapshot_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	sampleCount: integer("sample_count").notNull(),
	faithfulnessMean: doublePrecision("faithfulness_mean"),
	answerRelevancyMean: doublePrecision("answer_relevancy_mean"),
	samples: jsonb().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	groupId: bigint("group_id", { mode: "number" }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	userId: bigint("user_id", { mode: "number" }).notNull(),
	contextPrecisionMean: doublePrecision("context_precision_mean"),
}, (table) => [
	index("app_groupev_user_id_e828b6_idx").using("btree", table.userId.asc().nullsLast().op("int8_ops"), table.updatedAt.desc().nullsFirst().op("timestamptz_ops")),
	index("app_groupevaluationsnapshot_created_at_85b64cef").using("btree", table.createdAt.asc().nullsLast().op("timestamptz_ops")),
	index("app_groupevaluationsnapshot_user_id_e206b1f1").using("btree", table.userId.asc().nullsLast().op("int8_ops")),
	foreignKey({
			columns: [table.groupId],
			foreignColumns: [appVideogroup.id],
			name: "app_groupevaluations_group_id_7bbb01cf_fk_app_video"
		}),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [appUser.id],
			name: "app_groupevaluationsnapshot_user_id_e206b1f1_fk_app_user_id"
		}),
	unique("app_groupevaluationsnapshot_group_id_key").on(table.groupId),
]);

export const appChatlogevaluation = pgTable("app_chatlogevaluation", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({ name: "app_chatlogevaluation_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	status: varchar({ length: 20 }).notNull(),
	faithfulness: doublePrecision(),
	answerRelevancy: doublePrecision("answer_relevancy"),
	contextPrecision: doublePrecision("context_precision"),
	errorMessage: text("error_message").notNull(),
	evaluatedAt: timestamp("evaluated_at", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	chatLogId: bigint("chat_log_id", { mode: "number" }).notNull(),
}, (table) => [
	index("app_chatlog_status_6ea271_idx").using("btree", table.status.asc().nullsLast().op("text_ops")),
	index("app_chatlogevaluation_status_26824a3d").using("btree", table.status.asc().nullsLast().op("text_ops")),
	index("app_chatlogevaluation_status_26824a3d_like").using("btree", table.status.asc().nullsLast().op("varchar_pattern_ops")),
	foreignKey({
			columns: [table.chatLogId],
			foreignColumns: [appChatlog.id],
			name: "app_chatlogevaluation_chat_log_id_a64c4808_fk_app_chatlog_id"
		}),
	unique("app_chatlogevaluation_chat_log_id_key").on(table.chatLogId),
]);

export const appUser = pgTable("app_user", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({ name: "app_user_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	password: varchar({ length: 128 }).notNull(),
	lastLogin: timestamp("last_login", { withTimezone: true, mode: 'string' }),
	isSuperuser: boolean("is_superuser").notNull(),
	username: varchar({ length: 150 }).notNull(),
	firstName: varchar("first_name", { length: 150 }).notNull(),
	lastName: varchar("last_name", { length: 150 }).notNull(),
	isStaff: boolean("is_staff").notNull(),
	isActive: boolean("is_active").notNull(),
	dateJoined: timestamp("date_joined", { withTimezone: true, mode: 'string' }).notNull(),
	email: varchar({ length: 254 }).notNull(),
	deactivatedAt: timestamp("deactivated_at", { withTimezone: true, mode: 'string' }),
	maxVideoUploadSizeMb: integer("max_video_upload_size_mb").notNull(),
	searchapiApiKeyEncrypted: bytea("searchapi_api_key_encrypted"),
	aiAnswersLimit: integer("ai_answers_limit"),
	isOverQuota: boolean("is_over_quota").notNull(),
	processingLimitMinutes: integer("processing_limit_minutes"),
	storageLimitGb: doublePrecision("storage_limit_gb"),
	usagePeriodStart: timestamp("usage_period_start", { withTimezone: true, mode: 'string' }),
	usedAiAnswers: integer("used_ai_answers").notNull(),
	usedProcessingSeconds: integer("used_processing_seconds").notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	usedStorageBytes: bigint("used_storage_bytes", { mode: "number" }).notNull(),
	pendingEmail: varchar("pending_email", { length: 254 }),
}, (table) => [
	index("app_user_date_jo_c41876_idx").using("btree", table.dateJoined.asc().nullsLast().op("int8_ops"), table.id.desc().nullsFirst().op("timestamptz_ops")),
	index("app_user_deactivated_at_9b55afc1").using("btree", table.deactivatedAt.asc().nullsLast().op("timestamptz_ops")),
	index("app_user_email_a838b5_idx").using("btree", table.email.asc().nullsLast().op("text_ops"), table.isActive.asc().nullsLast().op("bool_ops")),
	index("app_user_email_efde8896_like").using("btree", table.email.asc().nullsLast().op("varchar_pattern_ops")),
	index("app_user_pending_email_7dde5485").using("btree", table.pendingEmail.asc().nullsLast().op("text_ops")),
	index("app_user_pending_email_7dde5485_like").using("btree", table.pendingEmail.asc().nullsLast().op("varchar_pattern_ops")),
	index("app_user_username_9d6296ff_like").using("btree", table.username.asc().nullsLast().op("varchar_pattern_ops")),
	unique("app_user_username_key").on(table.username),
	unique("app_user_email_key").on(table.email),
	check("app_user_max_video_upload_size_mb_check", sql`max_video_upload_size_mb >= 0`),
]);

export const oauth2ProviderAccesstoken = pgTable("oauth2_provider_accesstoken", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({ name: "oauth2_provider_accesstoken_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	token: text().notNull(),
	expires: timestamp({ withTimezone: true, mode: 'string' }).notNull(),
	scope: text().notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	applicationId: bigint("application_id", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	userId: bigint("user_id", { mode: "number" }),
	created: timestamp({ withTimezone: true, mode: 'string' }).notNull(),
	updated: timestamp({ withTimezone: true, mode: 'string' }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	sourceRefreshTokenId: bigint("source_refresh_token_id", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	idTokenId: bigint("id_token_id", { mode: "number" }),
	tokenChecksum: varchar("token_checksum", { length: 64 }).notNull(),
}, (table) => [
	index("oauth2_provider_accesstoken_application_id_b22886e1").using("btree", table.applicationId.asc().nullsLast().op("int8_ops")),
	index("oauth2_provider_accesstoken_token_checksum_85319a26_like").using("btree", table.tokenChecksum.asc().nullsLast().op("varchar_pattern_ops")),
	index("oauth2_provider_accesstoken_user_id_6e4c9a65").using("btree", table.userId.asc().nullsLast().op("int8_ops")),
	// Circular FKs with refreshtoken/idtoken/application are declared in relations.ts.
	foreignKey({
			columns: [table.userId],
			foreignColumns: [appUser.id],
			name: "oauth2_provider_accesstoken_user_id_6e4c9a65_fk_app_user_id"
		}),
	unique("oauth2_provider_accesstoken_source_refresh_token_id_key").on(table.sourceRefreshTokenId),
	unique("oauth2_provider_accesstoken_id_token_id_key").on(table.idTokenId),
	unique("oauth2_provider_accesstoken_token_checksum_85319a26_uniq").on(table.tokenChecksum),
]);

export const oauth2ProviderIdtoken = pgTable("oauth2_provider_idtoken", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({ name: "oauth2_provider_idtoken_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	jti: uuid().notNull(),
	expires: timestamp({ withTimezone: true, mode: 'string' }).notNull(),
	scope: text().notNull(),
	created: timestamp({ withTimezone: true, mode: 'string' }).notNull(),
	updated: timestamp({ withTimezone: true, mode: 'string' }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	applicationId: bigint("application_id", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	userId: bigint("user_id", { mode: "number" }),
}, (table) => [
	index("oauth2_provider_idtoken_application_id_08c5ff4f").using("btree", table.applicationId.asc().nullsLast().op("int8_ops")),
	index("oauth2_provider_idtoken_user_id_dd512b59").using("btree", table.userId.asc().nullsLast().op("int8_ops")),
	foreignKey({
			columns: [table.applicationId],
			foreignColumns: [oauth2ProviderApplication.id],
			name: "oauth2_provider_idto_application_id_08c5ff4f_fk_oauth2_pr"
		}),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [appUser.id],
			name: "oauth2_provider_idtoken_user_id_dd512b59_fk_app_user_id"
		}),
	unique("oauth2_provider_idtoken_jti_key").on(table.jti),
]);

export const oauth2ProviderGrant = pgTable("oauth2_provider_grant", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({ name: "oauth2_provider_grant_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	code: varchar({ length: 255 }).notNull(),
	expires: timestamp({ withTimezone: true, mode: 'string' }).notNull(),
	redirectUri: text("redirect_uri").notNull(),
	scope: text().notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	applicationId: bigint("application_id", { mode: "number" }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	userId: bigint("user_id", { mode: "number" }).notNull(),
	created: timestamp({ withTimezone: true, mode: 'string' }).notNull(),
	updated: timestamp({ withTimezone: true, mode: 'string' }).notNull(),
	codeChallenge: varchar("code_challenge", { length: 128 }).notNull(),
	codeChallengeMethod: varchar("code_challenge_method", { length: 10 }).notNull(),
	nonce: varchar({ length: 255 }).notNull(),
	claims: text().notNull(),
}, (table) => [
	index("oauth2_provider_grant_application_id_81923564").using("btree", table.applicationId.asc().nullsLast().op("int8_ops")),
	index("oauth2_provider_grant_code_49ab4ddf_like").using("btree", table.code.asc().nullsLast().op("varchar_pattern_ops")),
	index("oauth2_provider_grant_user_id_e8f62af8").using("btree", table.userId.asc().nullsLast().op("int8_ops")),
	foreignKey({
			columns: [table.applicationId],
			foreignColumns: [oauth2ProviderApplication.id],
			name: "oauth2_provider_gran_application_id_81923564_fk_oauth2_pr"
		}),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [appUser.id],
			name: "oauth2_provider_grant_user_id_e8f62af8_fk_app_user_id"
		}),
	unique("oauth2_provider_grant_code_key").on(table.code),
]);

export const oauth2ProviderDevicegrant = pgTable("oauth2_provider_devicegrant", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({ name: "oauth2_provider_devicegrant_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	deviceCode: varchar("device_code", { length: 100 }).notNull(),
	userCode: varchar("user_code", { length: 100 }).notNull(),
	scope: varchar({ length: 64 }),
	interval: integer().notNull(),
	expires: timestamp({ withTimezone: true, mode: 'string' }).notNull(),
	status: varchar({ length: 64 }).notNull(),
	clientId: varchar("client_id", { length: 100 }).notNull(),
	lastChecked: timestamp("last_checked", { withTimezone: true, mode: 'string' }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	userId: bigint("user_id", { mode: "number" }),
}, (table) => [
	index("oauth2_provider_devicegrant_client_id_229dd06d").using("btree", table.clientId.asc().nullsLast().op("text_ops")),
	index("oauth2_provider_devicegrant_client_id_229dd06d_like").using("btree", table.clientId.asc().nullsLast().op("varchar_pattern_ops")),
	index("oauth2_provider_devicegrant_device_code_ab91e379_like").using("btree", table.deviceCode.asc().nullsLast().op("varchar_pattern_ops")),
	index("oauth2_provider_devicegrant_user_id_1cec5156").using("btree", table.userId.asc().nullsLast().op("int8_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [appUser.id],
			name: "oauth2_provider_devicegrant_user_id_1cec5156_fk_app_user_id"
		}),
	unique("oauth2_provider_devicegrant_unique_device_code").on(table.deviceCode),
]);

export const oauth2ProviderApplication = pgTable("oauth2_provider_application", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({ name: "oauth2_provider_application_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	clientId: varchar("client_id", { length: 100 }).notNull(),
	redirectUris: text("redirect_uris").notNull(),
	clientType: varchar("client_type", { length: 32 }).notNull(),
	authorizationGrantType: varchar("authorization_grant_type", { length: 44 }).notNull(),
	clientSecret: varchar("client_secret", { length: 255 }).notNull(),
	name: varchar({ length: 255 }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	userId: bigint("user_id", { mode: "number" }),
	skipAuthorization: boolean("skip_authorization").notNull(),
	created: timestamp({ withTimezone: true, mode: 'string' }).notNull(),
	updated: timestamp({ withTimezone: true, mode: 'string' }).notNull(),
	algorithm: varchar({ length: 5 }).notNull(),
	postLogoutRedirectUris: text("post_logout_redirect_uris").notNull(),
	hashClientSecret: boolean("hash_client_secret").notNull(),
	allowedOrigins: text("allowed_origins").notNull(),
}, (table) => [
	index("oauth2_provider_application_client_id_03f0cc84_like").using("btree", table.clientId.asc().nullsLast().op("varchar_pattern_ops")),
	index("oauth2_provider_application_client_secret_53133678").using("btree", table.clientSecret.asc().nullsLast().op("text_ops")),
	index("oauth2_provider_application_client_secret_53133678_like").using("btree", table.clientSecret.asc().nullsLast().op("varchar_pattern_ops")),
	index("oauth2_provider_application_user_id_79829054").using("btree", table.userId.asc().nullsLast().op("int8_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [appUser.id],
			name: "oauth2_provider_application_user_id_79829054_fk_app_user_id"
		}),
	unique("oauth2_provider_application_client_id_key").on(table.clientId),
]);

export const oauth2ProviderRefreshtoken = pgTable("oauth2_provider_refreshtoken", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({ name: "oauth2_provider_refreshtoken_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	token: varchar({ length: 255 }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	accessTokenId: bigint("access_token_id", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	applicationId: bigint("application_id", { mode: "number" }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	userId: bigint("user_id", { mode: "number" }).notNull(),
	created: timestamp({ withTimezone: true, mode: 'string' }).notNull(),
	updated: timestamp({ withTimezone: true, mode: 'string' }).notNull(),
	revoked: timestamp({ withTimezone: true, mode: 'string' }),
	tokenFamily: uuid("token_family"),
}, (table) => [
	index("oauth2_provider_refreshtoken_application_id_2d1c311b").using("btree", table.applicationId.asc().nullsLast().op("int8_ops")),
	index("oauth2_provider_refreshtoken_user_id_da837fce").using("btree", table.userId.asc().nullsLast().op("int8_ops")),
	// Circular FK to accesstoken is declared in relations.ts.
	foreignKey({
			columns: [table.applicationId],
			foreignColumns: [oauth2ProviderApplication.id],
			name: "oauth2_provider_refr_application_id_2d1c311b_fk_oauth2_pr"
		}),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [appUser.id],
			name: "oauth2_provider_refreshtoken_user_id_da837fce_fk_app_user_id"
		}),
	unique("oauth2_provider_refreshtoken_token_revoked_af8a5134_uniq").on(table.token, table.revoked),
	unique("oauth2_provider_refreshtoken_access_token_id_key").on(table.accessTokenId),
]);

export const appPlogbuildjob = pgTable("app_plogbuildjob", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({ name: "app_plogbuildjob_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	status: varchar({ length: 20 }).notNull(),
	errorMessage: text("error_message").notNull(),
	inputTokens: integer("input_tokens").notNull(),
	outputTokens: integer("output_tokens").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).notNull(),
	finishedAt: timestamp("finished_at", { withTimezone: true, mode: 'string' }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	videoId: bigint("video_id", { mode: "number" }).notNull(),
}, (table) => [
	index("app_plogbui_video_i_idx").using("btree", table.videoId.asc().nullsLast().op("int8_ops"), table.createdAt.desc().nullsFirst().op("int8_ops")),
	index("app_plogbuildjob_created_at_71482637").using("btree", table.createdAt.asc().nullsLast().op("timestamptz_ops")),
	index("app_plogbuildjob_status_08fd6815").using("btree", table.status.asc().nullsLast().op("text_ops")),
	index("app_plogbuildjob_status_08fd6815_like").using("btree", table.status.asc().nullsLast().op("varchar_pattern_ops")),
	index("app_plogbuildjob_video_id_e75c897e").using("btree", table.videoId.asc().nullsLast().op("int8_ops")),
	foreignKey({
			columns: [table.videoId],
			foreignColumns: [appVideo.id],
			name: "app_plogbuildjob_video_id_e75c897e_fk_app_video_id"
		}),
	check("app_plogbuildjob_input_tokens_check", sql`input_tokens >= 0`),
	check("app_plogbuildjob_output_tokens_check", sql`output_tokens >= 0`),
]);

export const appPlogsummarynode = pgTable("app_plogsummarynode", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({ name: "app_plogsummarynode_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	level: smallint().notNull(),
	text: text().notNull(),
	startSec: doublePrecision("start_sec").notNull(),
	endSec: doublePrecision("end_sec").notNull(),
	sceneIndices: jsonb("scene_indices").notNull(),
	embedding: jsonb().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	parentId: bigint("parent_id", { mode: "number" }),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	videoId: bigint("video_id", { mode: "number" }).notNull(),
}, (table) => [
	index("app_plogsum_video_i_idx").using("btree", table.videoId.asc().nullsLast().op("int2_ops"), table.level.asc().nullsLast().op("int2_ops")),
	index("app_plogsummarynode_level_c5b6008a").using("btree", table.level.asc().nullsLast().op("int2_ops")),
	index("app_plogsummarynode_parent_id_e7b13c0a").using("btree", table.parentId.asc().nullsLast().op("int8_ops")),
	index("app_plogsummarynode_video_id_9bcf5b47").using("btree", table.videoId.asc().nullsLast().op("int8_ops")),
	foreignKey({
			columns: [table.parentId],
			foreignColumns: [table.id],
			name: "app_plogsummarynode_parent_id_e7b13c0a_fk_app_plogs"
		}),
	foreignKey({
			columns: [table.videoId],
			foreignColumns: [appVideo.id],
			name: "app_plogsummarynode_video_id_9bcf5b47_fk_app_video_id"
		}),
	check("app_plogsummarynode_level_check", sql`level >= 0`),
]);

export const appPlogconcept = pgTable("app_plogconcept", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({ name: "app_plogconcept_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	label: varchar({ length: 255 }).notNull(),
	nodeType: varchar("node_type", { length: 20 }).notNull(),
	introSec: doublePrecision("intro_sec").notNull(),
	sourceQuote: text("source_quote").notNull(),
	embedding: jsonb().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	videoId: bigint("video_id", { mode: "number" }).notNull(),
}, (table) => [
	index("app_plogcon_video_i_idx").using("btree", table.videoId.asc().nullsLast().op("float8_ops"), table.introSec.asc().nullsLast().op("float8_ops")),
	index("app_plogconcept_video_id_81b10353").using("btree", table.videoId.asc().nullsLast().op("int8_ops")),
	foreignKey({
			columns: [table.videoId],
			foreignColumns: [appVideo.id],
			name: "app_plogconcept_video_id_81b10353_fk_app_video_id"
		}),
	unique("plog_concept_unique_label_per_video").on(table.label, table.videoId),
]);

export const appPlogedge = pgTable("app_plogedge", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({ name: "app_plogedge_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	edgeType: varchar("edge_type", { length: 32 }).notNull(),
	quote: text().notNull(),
	validationStatus: varchar("validation_status", { length: 20 }).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	sourceId: bigint("source_id", { mode: "number" }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	targetId: bigint("target_id", { mode: "number" }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	videoId: bigint("video_id", { mode: "number" }).notNull(),
}, (table) => [
	index("app_plogedg_video_i_idx").using("btree", table.videoId.asc().nullsLast().op("int8_ops"), table.edgeType.asc().nullsLast().op("int8_ops")),
	index("app_plogedg_video_i_idx2").using("btree", table.videoId.asc().nullsLast().op("text_ops"), table.validationStatus.asc().nullsLast().op("text_ops")),
	index("app_plogedge_source_id_2e1ccbe2").using("btree", table.sourceId.asc().nullsLast().op("int8_ops")),
	index("app_plogedge_target_id_0b853bc8").using("btree", table.targetId.asc().nullsLast().op("int8_ops")),
	index("app_plogedge_validation_status_36235281").using("btree", table.validationStatus.asc().nullsLast().op("text_ops")),
	index("app_plogedge_validation_status_36235281_like").using("btree", table.validationStatus.asc().nullsLast().op("varchar_pattern_ops")),
	index("app_plogedge_video_id_c0d24124").using("btree", table.videoId.asc().nullsLast().op("int8_ops")),
	foreignKey({
			columns: [table.sourceId],
			foreignColumns: [appPlogconcept.id],
			name: "app_plogedge_source_id_2e1ccbe2_fk_app_plogconcept_id"
		}),
	foreignKey({
			columns: [table.targetId],
			foreignColumns: [appPlogconcept.id],
			name: "app_plogedge_target_id_0b853bc8_fk_app_plogconcept_id"
		}),
	foreignKey({
			columns: [table.videoId],
			foreignColumns: [appVideo.id],
			name: "app_plogedge_video_id_c0d24124_fk_app_video_id"
		}),
	unique("plog_edge_unique_typed_pair").on(table.edgeType, table.sourceId, table.targetId, table.videoId),
]);

export const appPloglearningobject = pgTable("app_ploglearningobject", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({ name: "app_ploglearningobject_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	openingQuestion: text("opening_question").notNull(),
	hintLadder: jsonb("hint_ladder").notNull(),
	misconceptions: jsonb().notNull(),
	canonicalOrder: jsonb("canonical_order").notNull(),
	workedExamples: jsonb("worked_examples").notNull(),
	waypoints: jsonb().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	conceptId: bigint("concept_id", { mode: "number" }).notNull(),
}, (table) => [
	foreignKey({
			columns: [table.conceptId],
			foreignColumns: [appPlogconcept.id],
			name: "app_ploglearningobje_concept_id_77171d07_fk_app_plogc"
		}),
	unique("app_ploglearningobject_concept_id_key").on(table.conceptId),
]);

export const appLearnerconceptstate = pgTable("app_learnerconceptstate", {
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	id: bigint({ mode: "number" }).primaryKey().generatedByDefaultAsIdentity({ name: "app_learnerconceptstate_id_seq", startWith: 1, increment: 1, minValue: 1, maxValue: 9223372036854775807, cache: 1 }),
	reached: boolean().notNull(),
	hintIndex: smallint("hint_index").notNull(),
	lastGrade: varchar("last_grade", { length: 32 }).notNull(),
	active: boolean().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	conceptId: bigint("concept_id", { mode: "number" }).notNull(),
	// You can use { mode: "bigint" } if numbers are exceeding js number limitations
	userId: bigint("user_id", { mode: "number" }).notNull(),
}, (table) => [
	index("app_learner_user_id_idx").using("btree", table.userId.asc().nullsLast().op("int8_ops"), table.reached.asc().nullsLast().op("int8_ops")),
	index("app_learnerconceptstate_concept_id_e626a63f").using("btree", table.conceptId.asc().nullsLast().op("int8_ops")),
	index("app_learnerconceptstate_reached_e0b0973c").using("btree", table.reached.asc().nullsLast().op("bool_ops")),
	index("app_learnerconceptstate_user_id_640b1dc5").using("btree", table.userId.asc().nullsLast().op("int8_ops")),
	foreignKey({
			columns: [table.conceptId],
			foreignColumns: [appPlogconcept.id],
			name: "app_learnerconceptst_concept_id_e626a63f_fk_app_plogc"
		}),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [appUser.id],
			name: "app_learnerconceptstate_user_id_640b1dc5_fk_app_user_id"
		}),
	unique("learner_concept_state_unique").on(table.conceptId, table.userId),
	check("app_learnerconceptstate_hint_index_check", sql`hint_index >= 0`),
]);
