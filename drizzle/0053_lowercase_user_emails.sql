-- Email signup used to store addresses as typed ("Jane@Gmail.com") while Google login and every other
-- lookup uses lowercase, so those users couldn't log in with a lowercase email and Google created them
-- a second workspace. Normalize existing rows; skip any address that already has a lowercase twin
-- (those are real duplicate accounts and need a manual merge).
UPDATE "users" u SET "email" = lower(trim(u."email"))
WHERE u."email" <> lower(trim(u."email"))
  AND NOT EXISTS (
    SELECT 1 FROM "users" o WHERE o."id" <> u."id" AND lower(trim(o."email")) = lower(trim(u."email"))
  );
