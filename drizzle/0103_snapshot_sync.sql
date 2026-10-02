-- Snapshot catch-up: migrations 0088-0102 were written by hand, so drizzle-kit's snapshot (meta/*_snapshot.json) had
-- fallen behind the real schema. This entry carries the up-to-date snapshot so the NEXT `db:generate` diffs
-- against reality instead of re-emitting changes already applied. Intentionally no SQL.
SELECT 1;
