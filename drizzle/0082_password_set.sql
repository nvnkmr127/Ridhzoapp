ALTER TABLE "users" ADD COLUMN "password_set" boolean DEFAULT true NOT NULL;--> statement-breakpoint
-- WhatsApp signups got a random hash under a synthetic email (PHONE_EMAIL_DOMAIN). Google signups can't
-- be told apart, so they stay true and use the emailed "reset password" link.
UPDATE "users" SET "password_set" = false WHERE "email" LIKE '%@phone.ridhzo.com';
