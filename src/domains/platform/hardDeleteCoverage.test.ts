import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import * as schema from "@/db/schema";

// hardDeleteTenant wipes a tenant table by table. Any table whose FK to a wiped table is NO ACTION
// (no cascade / set null) must be deleted explicitly, or Postgres rejects the whole transaction —
// which is exactly how hard delete silently broke for every tenant with a tag or a notification.
// This fails the moment someone adds such a table without adding it to the wipe.
describe("hardDeleteTenant covers every blocking table", () => {
  it("deletes each table that has a NO ACTION FK to organizations/users/leads (transitively)", () => {
    const source = readFileSync(join(__dirname, "service.ts"), "utf8");
    const wiped = new Set([...source.matchAll(/tx\s*\.delete\((\w+)\)/g)].map((m) => m[1]));

    const tables = Object.entries(schema).filter(([, v]) => v instanceof PgTable) as [string, PgTable][];
    const nameOf = new Map(tables.map(([n, t]) => [t, n]));
    const blockers = new Map<string, Set<string>>(); // child -> parents it blocks
    for (const [name, t] of tables) {
      for (const fk of getTableConfig(t).foreignKeys) {
        if (fk.onDelete === "cascade" || fk.onDelete === "set null") continue;
        const parent = nameOf.get(fk.reference().foreignTable);
        if (parent && parent !== name) (blockers.get(name) ?? blockers.set(name, new Set()).get(name)!).add(parent);
      }
    }

    // Everything reachable from the tenant roots must be wiped.
    const mustWipe = new Set(["organizations", "users", "leads"]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const [child, parents] of blockers) {
        if (!mustWipe.has(child) && [...parents].some((p) => mustWipe.has(p))) {
          mustWipe.add(child);
          grew = true;
        }
      }
    }
    const missing = [...mustWipe].filter((t) => !wiped.has(t));
    expect(missing).toEqual([]);
  });
});
