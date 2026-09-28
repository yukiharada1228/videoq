ALTER TABLE "chat_logs" ALTER COLUMN "response" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_logs" DROP COLUMN "answer";--> statement-breakpoint
ALTER TABLE "chat_logs" DROP COLUMN "citations";