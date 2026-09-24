import postgres from "postgres";
import { readMigrationFiles } from "drizzle-orm/migrator";

// Marks migrations as already applied on a database whose schema was created with `db:push`
// (so drizzle.__drizzle_migrations is empty and `db:migrate` tries to replay everything from 0000).
// It writes ONLY bookkeeping rows — no schema change. Afterwards `db:migrate` applies just the
// migrations newer than the baseline.
//
//   npm run db:baseline                       # dry run: shows what would be recorded
//   npm run db:baseline -- --apply            # record every migration in drizzle/ as applied
//   npm run db:baseline -- --apply --up-to 0055_sequence_enrollment_pause
//
// Before --apply, make sure the database really has those changes (e.g. `npx drizzle-kit push`
// reports no changes). Refuses to run if the table already has rows.

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const upToIdx = args.indexOf("--up-to");
const upTo = upToIdx >= 0 ? args[upToIdx + 1] : undefined;

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");

  const { default: journal } = await import("../../drizzle/meta/_journal.json", { with: { type: "json" } });
  const tags: string[] = journal.entries.map((e: { tag: string }) => e.tag);
  const migrations = readMigrationFiles({ migrationsFolder: "./drizzle" }).map((m, i) => ({ ...m, tag: tags[i] }));
  const stop = upTo ? migrations.findIndex((m) => m.tag === upTo) : migrations.length - 1;
  if (stop < 0) throw new Error(`No migration tagged "${upTo}"`);
  const toRecord = migrations.slice(0, stop + 1);

  const sql = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await sql`create schema if not exists drizzle`;
    await sql`create table if not exists drizzle.__drizzle_migrations (id serial primary key, hash text not null, created_at bigint)`;
    const [{ count }] = await sql<{ count: string }[]>`select count(*)::text as count from drizzle.__drizzle_migrations`;
    if (Number(count) > 0) {
      console.log(`drizzle.__drizzle_migrations already has ${count} rows — nothing to baseline. Use npm run db:migrate.`);
      return;
    }

    console.log(`${apply ? "Recording" : "Would record"} ${toRecord.length} migrations as applied (through ${toRecord.at(-1)!.tag}).`);
    if (!apply) {
      console.log("Dry run. Re-run with --apply to write.");
      return;
    }
    await sql.begin(async (tx) => {
      for (const m of toRecord) {
        await tx`insert into drizzle.__drizzle_migrations (hash, created_at) values (${m.hash}, ${m.folderMillis})`;
      }
    });
    console.log("Done. `npm run db:migrate` will now apply only newer migrations.");
  } finally {
    await sql.end();
  }
}

main().catch((e) => {
  console.error("[baseline]", e.message);
  process.exit(1);
});
