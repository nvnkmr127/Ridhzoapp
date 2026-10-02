ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "push_opt_out" jsonb DEFAULT '[]'::jsonb NOT NULL;
