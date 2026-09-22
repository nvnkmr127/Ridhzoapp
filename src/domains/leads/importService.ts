import { db } from "@/db";
import { leads, leadSources, users } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
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

export class LeadImportService {
  // Validates each row and flags duplicates — both against existing org leads and earlier
  // rows in the same file. Pure read; used by both the simulate and commit paths.
  static async analyze(organizationId: string, rows: ImportRow[], opts: { isAdmin?: boolean } = {}): Promise<ImportAnalysis> {
    const existing = await db
      .select({ email: leads.email, phone: leads.phone })
      .from(leads)
      .where(and(eq(leads.organizationId, organizationId), isNull(leads.deletedAt)));

    const existingEmails = new Set(existing.map((e) => e.email?.toLowerCase()).filter(Boolean));
    const existingPhones = new Set(existing.map((e) => digits(e.phone)).filter((d) => d.length >= 6));

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
          cleanedCustomData = CustomFieldService.validateWith(customDefs, r.customData ?? {}, opts);
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
        const emailDup = !!email && (existingEmails.has(email) || seenEmail.has(email));
        const phoneDup = phone.length >= 6 && (existingPhones.has(phone) || seenPhone.has(phone));
        if (emailDup || phoneDup) {
          duplicate = true;
          reason = "Duplicate of an existing lead";
        }
      }

      if (email) seenEmail.add(email);
      if (phone.length >= 6) seenPhone.add(phone);

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
      await PlanService.assertCanAddLead(organizationId);

      // Canonicalize contact keys the same way every other ingestion path does, so imported leads
      // dedup against manual/webhook leads and the DB unique index actually applies to them.
      // Only accept a status that exists in this tenant's schema — otherwise fall back — so an import
      // can't strand leads on a status key with no config (raw label, no category).
      const validStatuses = new Set((await CustomStatusSchemaService.getTenantStatusSchema(organizationId)).map((s) => s.key));
      const fallbackStatus = (config.fallbackStatus && validStatuses.has(config.fallbackStatus)) ? config.fallbackStatus : "new";

      // Batch in chunks of 250 rows to avoid exceeding Postgres parameter limits
      const CHUNK_SIZE = 250;
      for (let i = 0; i < toInsert.length; i += CHUNK_SIZE) {
        const chunk = toInsert.slice(i, i + CHUNK_SIZE);
        await db.insert(leads).values(
          chunk.map((r) => {
            const wanted = r.status?.trim().toLowerCase().slice(0, 50);
            return {
              organizationId,
              name: r.name!.trim().slice(0, 255),
              email: normalizeEmail(r.email)?.slice(0, 255) || null,
              phone: normalizePhone(r.phone)?.slice(0, 255) || null,
              company: r.company?.trim().slice(0, 255) || null,
              status: wanted && validStatuses.has(wanted) ? wanted : fallbackStatus,
              sourceId: config.sourceId || null,
              ownerId: config.ownerId || userId || null,
              expectedValue: r.cleanedExpectedValue || null,
              customData: r.cleanedCustomData ?? {},
            };
          })
        );
      }
    }

    return { imported: toInsert.length, skipped: analysis.duplicateCount + analysis.errorCount };
  }
}
