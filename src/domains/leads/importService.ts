import { db } from "@/db";
import { UsageService } from "@/domains/billing/usageService";
import { emailKey, phoneKey } from "@/lib/leads/dedupKeys";
import { orgDialCode } from "@/lib/leads/orgDialCode";
import { leads, leadSources, leadStatusHistory, users } from "@/db/schema";
import { and, eq, isNull, inArray, or, sql } from "drizzle-orm";
import { phoneKeySql } from "@/lib/leads/dedupKeys";
import { eventBus } from "@/lib/events/emitter";
import { keepAlive } from "@/lib/keepAlive";
import { PlanService } from "@/domains/billing/planService";
import { normalizeEmail, normalizePhone } from "@/lib/leads/normalize";
import { CustomStatusSchemaService } from "@/domains/leads/customStatusSchemaService";
import { CustomFieldService, FieldValidationError } from "@/domains/customFields/service";

// Columns the importer understands. `name` is the only required one.
export const IMPORT_FIELDS = [
  { key: "name", label: "Name", required: true },
  { key: "email", label: "Email", required: false },
  { key: "phone", label: "Phone", required: false },
  { key: "company", label: "Company", required: false },
  { key: "status", label: "Status", required: false },
  { key: "expectedValue", label: "Expected value", required: false },
] as const;

export type ImportFieldKey = (typeof IMPORT_FIELDS)[number]["key"];

export interface ImportField {
  key: string;
  label: string;
  required: boolean;
  custom: boolean;
}

// The full column set the importer accepts for an org: the fixed lead fields plus every active
// (non-disabled) custom field. Admin-only custom fields are hidden from non-admin importers, same
// as the manual create form. This is what the wizard lists as "Supported columns".
export async function getImportFields(organizationId: string, isAdmin = true): Promise<ImportField[]> {
  const defs = await CustomFieldService.listCached(organizationId);
  const custom = defs
    .filter((d) => !d.disabled && (isAdmin || !d.adminOnly))
    .map((d) => ({ key: d.key, label: d.label, required: !!d.required, custom: true }));
  return [...IMPORT_FIELDS.map((f) => ({ ...f, custom: false })), ...custom];
}

export interface ImportRow {
  name?: string;
  email?: string;
  phone?: string;
  company?: string;
  status?: string;
  expectedValue?: string;
  // Raw custom-field values keyed by the field's `key` (all strings off the CSV). Validated and
  // coerced (numbers, dates, option checks) against the org's field defs before being stored.
  customData?: Record<string, unknown>;
}

export interface ImportConfig {
  sourceId?: string | null;
  ownerId?: string | null;
  fallbackStatus?: string;
}

export interface AnalyzedRow extends ImportRow {
  index: number;
  valid: boolean;
  duplicate: boolean;
  reason?: string;
  cleanedExpectedValue?: string | null;
  cleanedCustomData?: Record<string, unknown>;
}

export interface ImportAnalysis {
  total: number;
  newCount: number;
  duplicateCount: number;
  errorCount: number;
  rows: AnalyzedRow[];
}

const digits = (s?: string | null) => (s ?? "").replace(/\D/g, "");

function cleanNumericValue(val?: string | null): { valid: boolean; value: string | null } {
  if (!val || !val.trim()) return { valid: true, value: null };
  const cleaned = val.trim().replace(/[$€£₹, ]/g, "");
  if (!cleaned) return { valid: true, value: null };
  const num = Number(cleaned);
  if (isNaN(num) || num < 0 || !isFinite(num)) {
    return { valid: false, value: null };
  }
  return { valid: true, value: num.toFixed(2) };
}

// Imported leads go through the same new-lead pipeline as any other arrival (automations, webhook,
// distribution, enrichment, activity note) — but paced, so a 5,000-row file doesn't fire 5,000
// handlers at once and starve the DB pool. `source: "import"` tells the handler to skip Meta CAPI
// (historical leads aren't new ad conversions) and to not notify the owner once per row.
const ANNOUNCE_BATCH = 25;
const ANNOUNCE_GAP_MS = 500;
function announceImported(ids: string[], userId: string | null, sourceId?: string | null) {
  keepAlive(
    (async () => {
      for (let i = 0; i < ids.length; i += ANNOUNCE_BATCH) {
        for (const leadId of ids.slice(i, i + ANNOUNCE_BATCH)) {
          eventBus.emit("lead.created", { leadId, userId: userId ?? undefined, sourceId: sourceId ?? undefined, source: "import" });
        }
        if (i + ANNOUNCE_BATCH < ids.length) await new Promise((r) => setTimeout(r, ANNOUNCE_GAP_MS));
      }
    })(),
    "import lead.created events",
  );
}

export class LeadImportService {
  // Validates each row and flags duplicates — both against existing org leads and earlier
  // rows in the same file. Pure read; used by both the simulate and commit paths.
  static async analyze(organizationId: string, rows: ImportRow[], opts: { isAdmin?: boolean } = {}): Promise<ImportAnalysis> {
    // Only look up the emails/phones that appear in the file (in chunks) — not every lead the
    // workspace has. Same-person rule as every other duplicate check (lib/leads/dedupKeys).
    const fileEmails = [...new Set(rows.map((r) => emailKey(r.email)).filter(Boolean))];
    const filePhones = [...new Set(rows.map((r) => phoneKey(digits(r.phone))).filter(Boolean))];
    const existingEmails = new Set<string>();
    const existingPhones = new Set<string>();
    const LOOKUP_CHUNK = 2000;
    for (let i = 0; i < Math.max(fileEmails.length, filePhones.length); i += LOOKUP_CHUNK) {
      const es = fileEmails.slice(i, i + LOOKUP_CHUNK);
      const ps = filePhones.slice(i, i + LOOKUP_CHUNK);
      const conds = [
        es.length ? inArray(sql`lower(trim(${leads.email}))`, es) : undefined,
        ps.length ? inArray(phoneKeySql, ps) : undefined,
      ].filter((c): c is NonNullable<typeof c> => !!c);
      const found = await db
        .select({ email: leads.email, phone: leads.phone })
        .from(leads)
        .where(and(eq(leads.organizationId, organizationId), isNull(leads.deletedAt), or(...conds)));
      for (const e of found) {
        const ek = emailKey(e.email);
        const pk = phoneKey(e.phone);
        if (ek) existingEmails.add(ek);
        if (pk) existingPhones.add(pk);
      }
    }

    // Fetch custom-field defs ONCE, then validate every row against them in memory.
    const customDefs = await CustomFieldService.list(organizationId);

    const seenEmail = new Set<string>();
    const seenPhone = new Set<string>();

    const analyzed: AnalyzedRow[] = rows.map((r, index) => {
      const name = (r.name ?? "").trim().slice(0, 255);
      const email = (r.email ?? "").trim().toLowerCase().slice(0, 255);
      const phone = digits(r.phone).slice(0, 50);
      const numCheck = cleanNumericValue(r.expectedValue);

      let valid = true;
      let duplicate = false;
      let reason: string | undefined;
      let cleanedCustomData: Record<string, unknown> | undefined;

      // Validate + coerce custom-field values (required, number, date, option checks). A bad value
      // fails the row with the field's own message, just like the manual create form.
      if (customDefs.length > 0) {
        try {
          cleanedCustomData = CustomFieldService.validateWith(customDefs, r.customData ?? {}, { ...opts, isNew: true });
        } catch (e) {
          if (e instanceof FieldValidationError) {
            valid = false;
            reason = e.message;
          } else {
            throw e;
          }
        }
      }

      if (!valid) {
        // custom-field error already set above
      } else if (!name) {
        valid = false;
        reason = "Missing required name";
      } else if (!numCheck.valid) {
        valid = false;
        reason = `Invalid expected value: "${r.expectedValue}"`;
      } else {
        const pKey = phoneKey(phone);
        const emailDup = !!email && (existingEmails.has(email) || seenEmail.has(email));
        const phoneDup = !!pKey && (existingPhones.has(pKey) || seenPhone.has(pKey));
        if (emailDup || phoneDup) {
          duplicate = true;
          reason = "Duplicate of an existing lead";
        }
      }

      if (email) seenEmail.add(email);
      if (phoneKey(phone)) seenPhone.add(phoneKey(phone));

      return {
        ...r,
        index,
        valid,
        duplicate,
        reason,
        cleanedExpectedValue: numCheck.value,
        cleanedCustomData,
      };
    });

    return {
      total: analyzed.length,
      newCount: analyzed.filter((r) => r.valid && !r.duplicate).length,
      duplicateCount: analyzed.filter((r) => r.duplicate).length,
      errorCount: analyzed.filter((r) => !r.valid).length,
      rows: analyzed,
    };
  }

  // Inserts the valid, non-duplicate rows. Duplicates and invalid rows are skipped.
  static async commit(
    organizationId: string,
    userId: string | null,
    rows: ImportRow[],
    config: ImportConfig,
    opts: { isAdmin?: boolean } = {}
  ): Promise<{ imported: number; skipped: number }> {
    const analysis = await this.analyze(organizationId, rows, opts);
    const toInsert = analysis.rows.filter((r) => r.valid && !r.duplicate);

    // Never trust the client-supplied owner/source ids: a crafted request could otherwise attach
    // imported leads to a user or source in ANOTHER tenant (dangling owner → misfired assignment
    // notifications, corrupted attribution). Verify both belong to this org before inserting.
    if (config.ownerId) {
      const [owner] = await db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.id, config.ownerId), eq(users.organizationId, organizationId), isNull(users.deletedAt)))
        .limit(1);
      if (!owner) throw new Error("Selected owner is not a member of this organization.");
    }
    if (config.sourceId) {
      const [src] = await db
        .select({ id: leadSources.id })
        .from(leadSources)
        .where(and(eq(leadSources.id, config.sourceId), eq(leadSources.organizationId, organizationId)))
        .limit(1);
      if (!src) throw new Error("Selected source does not belong to this organization.");
    }

    if (toInsert.length > 0) {
      // The whole batch must fit the plan, not just the first lead.
      const dialCode = await orgDialCode(organizationId);

      // Canonicalize contact keys the same way every other ingestion path does, so imported leads
      // dedup against manual/webhook leads and the DB unique index actually applies to them.
      // Only accept a status that exists in this tenant's schema — otherwise fall back — so an import
      // can't strand leads on a status key with no config (raw label, no category).
      const validStatuses = new Set((await CustomStatusSchemaService.getTenantStatusSchema(organizationId)).map((s) => s.key));
      const fallbackStatus = (config.fallbackStatus && validStatuses.has(config.fallbackStatus)) ? config.fallbackStatus : "new";

      // Batch in chunks of 250 rows to avoid exceeding Postgres parameter limits. A row that loses a
      // race with a concurrent create (or maps to an existing key differently formatted) is skipped
      // by ON CONFLICT DO NOTHING instead of aborting the chunks already saved; the count is real.
      const created = await PlanService.serialized(organizationId, "leads", async () => {
        // The whole batch must fit the plan, checked under the lock (see PlanService.serialized).
        await PlanService.assertCanAddLead(organizationId, toInsert.length);
      await UsageService.consume(organizationId, "import_rows", toInsert.length);
      const CHUNK_SIZE = 250;
      const created: { id: string; ownerId: string | null }[] = [];
      for (let i = 0; i < toInsert.length; i += CHUNK_SIZE) {
        const chunk = toInsert.slice(i, i + CHUNK_SIZE);
        const inserted = await db.insert(leads).values(
          chunk.map((r) => {
            const wanted = r.status?.trim().toLowerCase().slice(0, 50);
            return {
              organizationId,
              name: r.name!.trim().slice(0, 255),
              email: normalizeEmail(r.email)?.slice(0, 255) || null,
              phone: normalizePhone(r.phone, dialCode)?.slice(0, 255) || null,
              company: r.company?.trim().slice(0, 255) || null,
              status: wanted && validStatuses.has(wanted) ? wanted : fallbackStatus,
              sourceId: config.sourceId || null,
              ownerId: config.ownerId || userId || null,
              expectedValue: r.cleanedExpectedValue || null,
              customData: r.cleanedCustomData ?? {},
            };
          })
        ).onConflictDoNothing().returning({ id: leads.id, ownerId: leads.ownerId, status: leads.status });

        // Opening status, like a hand-created lead, so "time in first status" analytics see it.
        if (inserted.length) {
          await db.insert(leadStatusHistory).values(
            inserted.map((l) => ({ leadId: l.id, oldStatus: null, newStatus: l.status, changedById: userId })),
          );
        }
        created.push(...inserted);
      }

        return created;
      });
      // Rows that were skipped (lost a race / conflicted) don't use up the month's import allowance.
      if (created.length < toInsert.length) await UsageService.refund(organizationId, "import_rows", toInsert.length - created.length).catch(() => {});
      announceImported(created.map((l) => l.id), userId, config.sourceId);
      return { imported: created.length, skipped: analysis.duplicateCount + analysis.errorCount + (toInsert.length - created.length) };
    }

    return { imported: toInsert.length, skipped: analysis.duplicateCount + analysis.errorCount };
  }
}
