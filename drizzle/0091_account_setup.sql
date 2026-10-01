-- Account completion for phone-registered users: how they signed up, which logins are verified/linked,
-- and the pending "add email" verification tokens.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "signup_method" varchar(10);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email_verified_at" timestamp;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "google_linked_at" timestamp;

UPDATE "users" SET "signup_method" = 'phone' WHERE "email" LIKE '%@phone.ridhzo.com' AND "signup_method" IS NULL;
-- Existing real emails were accepted at signup / via Google; count them as verified.
UPDATE "users" SET "email_verified_at" = "created_at" WHERE "email" NOT LIKE '%@phone.ridhzo.com' AND "email_verified_at" IS NULL;

CREATE TABLE IF NOT EXISTS "email_verifications" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "email" varchar(255) NOT NULL,
  "token_hash" varchar(64) NOT NULL UNIQUE,
  "expires_at" timestamp NOT NULL,
  "used_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "email_verifications_user_idx" ON "email_verifications" ("user_id");
