-- Phone sign-ups no longer get a made-up @phone.ridhzo.com address: email becomes optional.
-- UNIQUE stays (Postgres allows many NULLs), so real addresses are still one-per-account.
ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL;
-- Clear the old made-up addresses, but only where the person has a phone number to log in with.
UPDATE "users" SET "email" = NULL WHERE "email" LIKE '%@phone.ridhzo.com' AND "phone" IS NOT NULL;
