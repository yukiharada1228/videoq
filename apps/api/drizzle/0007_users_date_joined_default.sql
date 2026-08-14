-- Drizzle schema already documents defaultNow() on date_joined (0006 snapshot),
-- but 0001 created the column as NOT NULL with no database default.
-- Better Auth omits dateJoined, so Drizzle emits SQL DEFAULT. Postgres then
-- inserts NULL and raises 23502 (unable_to_create_user on Google signup).
ALTER TABLE "users" ALTER COLUMN "date_joined" SET DEFAULT now();
--> statement-breakpoint
-- Same gap for other 0001 NOT NULL columns that the TS schema treats as defaulted.
ALTER TABLE "users" ALTER COLUMN "first_name" SET DEFAULT '';
--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "last_name" SET DEFAULT '';
--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "is_superuser" SET DEFAULT false;
--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "is_staff" SET DEFAULT false;
--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "is_active" SET DEFAULT true;
