-- One live account per phone number (last 10 digits, the same key password/OTP login uses). The app-level
-- check in UserService.create / linkPhoneAction was racy and let two accounts share a number, which makes
-- phone sign-in ambiguous. Created only if the data is already clean — otherwise it is skipped with a
-- notice and must be re-run after the duplicates are resolved (SELECT right(regexp_replace(phone,'\D','','g'),10), count(*) FROM users WHERE deleted_at IS NULL AND phone IS NOT NULL GROUP BY 1 HAVING count(*) > 1).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM users
    WHERE deleted_at IS NULL AND phone IS NOT NULL AND length(regexp_replace(phone, '\D', '', 'g')) >= 7
    GROUP BY right(regexp_replace(phone, '\D', '', 'g'), 10)
    HAVING count(*) > 1
  ) THEN
    RAISE NOTICE 'users_phone_live_unique NOT created: duplicate live phone numbers exist';
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS "users_phone_live_unique"
      ON "users" ((right(regexp_replace("phone", '\D', '', 'g'), 10)))
      WHERE "deleted_at" IS NULL AND "phone" IS NOT NULL AND length(regexp_replace("phone", '\D', '', 'g')) >= 7;
  END IF;
END $$;
