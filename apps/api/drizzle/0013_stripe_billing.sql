CREATE TABLE "stripe_events" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "stripe_customer_id" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "stripe_subscription_id" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "plan_code" text DEFAULT 'free' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "subscription_status" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "quota_source" text DEFAULT 'plan' NOT NULL;--> statement-breakpoint
CREATE INDEX "users_stripe_customer_id_idx" ON "users" USING btree ("stripe_customer_id");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_stripe_customer_id_key" UNIQUE("stripe_customer_id");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_stripe_subscription_id_key" UNIQUE("stripe_subscription_id");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_plan_code_check" CHECK (plan_code IN ('free', 'basic', 'pro'));--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_quota_source_check" CHECK (quota_source IN ('plan', 'admin'));
