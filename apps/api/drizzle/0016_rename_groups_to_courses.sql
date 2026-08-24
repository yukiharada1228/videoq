-- Rename video groups to courses (講座). Data-preserving RENAME only.
-- Objects below still exist after 0006 / 0008. Missing indexes are created at the end.
ALTER TABLE "video_groups" RENAME TO "video_courses";--> statement-breakpoint
ALTER TABLE "video_group_members" RENAME TO "video_course_members";--> statement-breakpoint
ALTER TABLE "video_group_invitations" RENAME TO "video_course_invitations";--> statement-breakpoint
ALTER TABLE "video_group_memberships" RENAME TO "video_course_memberships";--> statement-breakpoint
ALTER TABLE "group_evaluation_snapshots" RENAME TO "course_evaluation_snapshots";--> statement-breakpoint
ALTER SEQUENCE "video_groups_id_seq" RENAME TO "video_courses_id_seq";--> statement-breakpoint
ALTER SEQUENCE "video_group_members_id_seq" RENAME TO "video_course_members_id_seq";--> statement-breakpoint
ALTER SEQUENCE "video_group_invitations_id_seq" RENAME TO "video_course_invitations_id_seq";--> statement-breakpoint
ALTER SEQUENCE "video_group_memberships_id_seq" RENAME TO "video_course_memberships_id_seq";--> statement-breakpoint
ALTER SEQUENCE "group_evaluation_snapshots_id_seq" RENAME TO "course_evaluation_snapshots_id_seq";--> statement-breakpoint
ALTER TABLE "video_course_members" RENAME COLUMN "group_id" TO "course_id";--> statement-breakpoint
ALTER TABLE "video_course_invitations" RENAME COLUMN "group_id" TO "course_id";--> statement-breakpoint
ALTER TABLE "video_course_memberships" RENAME COLUMN "group_id" TO "course_id";--> statement-breakpoint
ALTER TABLE "chat_logs" RENAME COLUMN "group_id" TO "course_id";--> statement-breakpoint
ALTER TABLE "course_evaluation_snapshots" RENAME COLUMN "group_id" TO "course_id";--> statement-breakpoint
ALTER INDEX "video_group_members_group_id_idx" RENAME TO "video_course_members_course_id_idx";--> statement-breakpoint
ALTER INDEX "video_group_invitations_group_status_idx" RENAME TO "video_course_invitations_course_status_idx";--> statement-breakpoint
ALTER INDEX "video_group_invitations_email_idx" RENAME TO "video_course_invitations_email_idx";--> statement-breakpoint
ALTER INDEX "video_group_invitations_pending_email_uniq" RENAME TO "video_course_invitations_pending_email_uniq";--> statement-breakpoint
ALTER INDEX "video_group_memberships_group_id_idx" RENAME TO "video_course_memberships_course_id_idx";--> statement-breakpoint
ALTER INDEX "video_group_memberships_user_id_idx" RENAME TO "video_course_memberships_user_id_idx";--> statement-breakpoint
ALTER INDEX "chat_logs_group_id_idx" RENAME TO "chat_logs_course_id_idx";--> statement-breakpoint
ALTER TABLE "video_courses" RENAME CONSTRAINT "video_groups_user_id_fkey" TO "video_courses_user_id_fkey";--> statement-breakpoint
ALTER TABLE "video_course_members" RENAME CONSTRAINT "video_group_members_group_id_fkey" TO "video_course_members_course_id_fkey";--> statement-breakpoint
ALTER TABLE "video_course_members" RENAME CONSTRAINT "video_group_members_video_id_fkey" TO "video_course_members_video_id_fkey";--> statement-breakpoint
ALTER TABLE "video_course_members" RENAME CONSTRAINT "video_group_members_group_video_uniq" TO "video_course_members_course_video_uniq";--> statement-breakpoint
ALTER TABLE "video_course_invitations" RENAME CONSTRAINT "video_group_invitations_group_id_fkey" TO "video_course_invitations_course_id_fkey";--> statement-breakpoint
ALTER TABLE "video_course_invitations" RENAME CONSTRAINT "video_group_invitations_invited_by_user_id_fkey" TO "video_course_invitations_invited_by_user_id_fkey";--> statement-breakpoint
ALTER TABLE "video_course_invitations" RENAME CONSTRAINT "video_group_invitations_accepted_by_user_id_fkey" TO "video_course_invitations_accepted_by_user_id_fkey";--> statement-breakpoint
ALTER TABLE "video_course_invitations" RENAME CONSTRAINT "video_group_invitations_token_hash_key" TO "video_course_invitations_token_hash_key";--> statement-breakpoint
ALTER TABLE "video_course_invitations" RENAME CONSTRAINT "video_group_invitations_status_check" TO "video_course_invitations_status_check";--> statement-breakpoint
ALTER TABLE "video_course_invitations" RENAME CONSTRAINT "video_group_invitations_delivery_status_check" TO "video_course_invitations_delivery_status_check";--> statement-breakpoint
ALTER TABLE "video_course_invitations" RENAME CONSTRAINT "video_group_invitations_send_attempts_check" TO "video_course_invitations_send_attempts_check";--> statement-breakpoint
ALTER TABLE "video_course_memberships" RENAME CONSTRAINT "video_group_memberships_group_id_fkey" TO "video_course_memberships_course_id_fkey";--> statement-breakpoint
ALTER TABLE "video_course_memberships" RENAME CONSTRAINT "video_group_memberships_user_id_fkey" TO "video_course_memberships_user_id_fkey";--> statement-breakpoint
ALTER TABLE "video_course_memberships" RENAME CONSTRAINT "video_group_memberships_invitation_id_fkey" TO "video_course_memberships_invitation_id_fkey";--> statement-breakpoint
ALTER TABLE "video_course_memberships" RENAME CONSTRAINT "video_group_memberships_group_user_uniq" TO "video_course_memberships_course_user_uniq";--> statement-breakpoint
ALTER TABLE "video_course_memberships" RENAME CONSTRAINT "video_group_memberships_invitation_id_key" TO "video_course_memberships_invitation_id_key";--> statement-breakpoint
ALTER TABLE "chat_logs" RENAME CONSTRAINT "chat_logs_group_id_fkey" TO "chat_logs_course_id_fkey";--> statement-breakpoint
ALTER TABLE "course_evaluation_snapshots" RENAME CONSTRAINT "group_evaluation_snapshots_group_id_fkey" TO "course_evaluation_snapshots_course_id_fkey";--> statement-breakpoint
ALTER TABLE "course_evaluation_snapshots" RENAME CONSTRAINT "group_evaluation_snapshots_user_id_fkey" TO "course_evaluation_snapshots_user_id_fkey";--> statement-breakpoint
ALTER TABLE "course_evaluation_snapshots" RENAME CONSTRAINT "group_evaluation_snapshots_group_id_key" TO "course_evaluation_snapshots_course_id_key";--> statement-breakpoint
-- Create indexes that are absent at this point in the migration history.
-- video_groups_user_id_idx was created by 0001, then dropped implicitly when
-- 0006 replaced video_groups.user_id with a text column.
CREATE INDEX "video_courses_user_id_idx" ON "video_courses" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "video_courses_share_slug_idx" ON "video_courses" USING btree ("share_slug") WHERE (share_slug IS NOT NULL);--> statement-breakpoint
CREATE UNIQUE INDEX "video_courses_share_slug_ci_uniq" ON "video_courses" USING btree (lower((share_slug)::text)) WHERE (share_slug IS NOT NULL);--> statement-breakpoint
CREATE INDEX "video_course_members_video_id_idx" ON "video_course_members" USING btree ("video_id");--> statement-breakpoint
CREATE INDEX "video_course_members_course_order_idx" ON "video_course_members" USING btree ("course_id", "order");--> statement-breakpoint
CREATE INDEX "chat_logs_course_created_idx" ON "chat_logs" USING btree ("course_id", "created_at" DESC);--> statement-breakpoint
CREATE INDEX "course_evaluation_snapshots_user_id_idx" ON "course_evaluation_snapshots" USING btree ("user_id");
