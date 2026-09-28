ALTER TABLE "chat_logs" DROP CONSTRAINT "chat_logs_user_id_fkey";
--> statement-breakpoint
ALTER TABLE "course_evaluation_snapshots" DROP CONSTRAINT "course_evaluation_snapshots_user_id_fkey";
--> statement-breakpoint
ALTER TABLE "tags" DROP CONSTRAINT "tags_user_id_fkey";
--> statement-breakpoint
ALTER TABLE "video_courses" DROP CONSTRAINT "video_courses_user_id_fkey";
--> statement-breakpoint
ALTER TABLE "videos" DROP CONSTRAINT "videos_user_id_fkey";
--> statement-breakpoint
ALTER TABLE "chat_logs" ADD CONSTRAINT "chat_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_evaluation_snapshots" ADD CONSTRAINT "course_evaluation_snapshots_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_courses" ADD CONSTRAINT "video_courses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "videos" ADD CONSTRAINT "videos_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;