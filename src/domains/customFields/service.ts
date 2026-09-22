import { db } from "@/db";
import { customFieldDefs } from "@/db/schema";
import { and, asc, eq, max } from "drizzle-orm";
import { unstable_cache } from "next/cache";

// Cache tag for an org's custom-field defs. Mutations (create/update/reorder/remove) revalidate it
// so cached reads refresh immediately instead of after the TTL.
export const customFieldsTag = (organizationId: string) => `custom-fields:${organizationId}`;

export type CustomFieldType =
  | "text" | "textarea" | "number" | "currency" | "date" | "datetime"
  | "select" | "multiselect" | "checkbox" | "url";

const OPTION_TYPES: CustomFieldType[] = ["select", "multiselect"];

// Thrown by validate() for a user-caused bad value. Callers map this to 422 / a VALIDATION
// result instead of a 500, and its message is safe to show the user.
export class FieldValidationError extends Error {
  readonly code = "VALIDATION";
  constructor(message: string) {
    super(message);
    this.name = "FieldValidationError";
  }
}

function slugify(label: string) {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 50) || "field";
}

export class CustomFieldService {
  static async list(organizationId: string) {
    return db
      .select()
      .from(customFieldDefs)
      .where(eq(customFieldDefs.organizationId, organizationId))
      .orderBy(asc(customFieldDefs.orderIndex), asc(customFieldDefs.createdAt));
  }

  // Cached read of an org's field defs, for the many UI surfaces that fetch them on open (add/edit
  // form, lead profile, import wizard, mapping editors). Defs change rarely, so serving them from
  // Next's data cache removes a ~300ms remote round-trip from every one of those opens. Invalidated
  // on any mutation via customFieldsTag(orgId).
  static async listCached(organizationId: string) {
    try {
      return await unstable_cache(
        () => this.list(organizationId),
        ["custom-fields", organizationId],
        { tags: [customFieldsTag(organizationId)], revalidate: 300 },
      )();
    } catch {
      // unstable_cache needs a Next request context; outside one (workers, tests) read directly.
      return this.list(organizationId);
    }
  }

  // A key unique within the org. Falls back to base_2, base_3… on collision so two fields never
  // share a key (which would make a lead's custom_data value for that key ambiguous).
  private static async uniqueKey(organizationId: string, base: string) {
    const existing = new Set(
      (await db
        .select({ key: customFieldDefs.key })
        .from(customFieldDefs)
        .where(eq(customFieldDefs.organizationId, organizationId))
      ).map((r) => r.key),
    );
    if (!existing.has(base)) return base;
    for (let i = 2; ; i++) {
      const candidate = `${base.slice(0, 47)}_${i}`;
      if (!existing.has(candidate)) return candidate;
    }
  }

  static async create(
    organizationId: string,
    input: {
      label: string; type: CustomFieldType; options?: string[]; required?: boolean;
      defaultValue?: string | null; disabled?: boolean; adminOnly?: boolean; showOnTable?: boolean;
      section?: string | null; subsection?: string | null;
    },
  ) {
    const key = await this.uniqueKey(organizationId, slugify(input.label));
    // Append to the end of the current order rather than colliding at index 0.
    const [{ maxIndex } = { maxIndex: null }] = await db
      .select({ maxIndex: max(customFieldDefs.orderIndex) })
      .from(customFieldDefs)
      .where(eq(customFieldDefs.organizationId, organizationId));
    const [row] = await db
      .insert(customFieldDefs)
      .values({
        organizationId,
        key,
        orderIndex: (maxIndex ?? -1) + 1,
        label: input.label,
        type: input.type,
        options: OPTION_TYPES.includes(input.type) ? (input.options ?? []) : [],
        required: input.required ?? false,
        defaultValue: input.defaultValue ?? null,
        disabled: input.disabled ?? false,
        adminOnly: input.adminOnly ?? false,
        showOnTable: input.showOnTable ?? false,
        section: input.section || null,
        subsection: input.subsection || null,
      })
      .returning();
    return row;
  }

  // Edit a field's label / required / select options. Key and type stay fixed so stored values
  // in leads.customData never orphan or need coercion.
  static async update(
    organizationId: string,
    id: string,
    input: {
      label?: string; required?: boolean; options?: string[];
      defaultValue?: string | null; disabled?: boolean; adminOnly?: boolean; showOnTable?: boolean;
      section?: string | null; subsection?: string | null;
    },
  ) {
    const patch: Record<string, unknown> = {};
    if (input.label !== undefined) patch.label = input.label;
    if (input.required !== undefined) patch.required = input.required;
    if (input.options !== undefined) patch.options = input.options;
    if (input.defaultValue !== undefined) patch.defaultValue = input.defaultValue;
    if (input.disabled !== undefined) patch.disabled = input.disabled;
    if (input.adminOnly !== undefined) patch.adminOnly = input.adminOnly;
    if (input.showOnTable !== undefined) patch.showOnTable = input.showOnTable;
    if (input.section !== undefined) patch.section = input.section || null;
    if (input.subsection !== undefined) patch.subsection = input.subsection || null;
    const [row] = await db
      .update(customFieldDefs)
      .set(patch)
      .where(and(eq(customFieldDefs.id, id), eq(customFieldDefs.organizationId, organizationId)))
      .returning();
    return row;
  }

  // Persist a new display order. Index = position in the passed id list.
  static async reorder(organizationId: string, orderedIds: string[]) {
    for (let i = 0; i < orderedIds.length; i++) {
      await db
        .update(customFieldDefs)
        .set({ orderIndex: i })
        .where(and(eq(customFieldDefs.id, orderedIds[i]), eq(customFieldDefs.organizationId, organizationId)));
    }
    return { ok: true };
  }

  static async remove(organizationId: string, id: string) {
    await db.delete(customFieldDefs).where(and(eq(customFieldDefs.id, id), eq(customFieldDefs.organizationId, organizationId)));
  }

  // Validates a custom_data payload against this org's field defs. Returns cleaned values.
  // `isAdmin` (default true, e.g. API keys) gates admin-only fields: a non-admin caller cannot
  // set them (any admin-only key they send is ignored) and isn't required to fill them.
  static async validate(
    organizationId: string,
    data: Record<string, unknown> = {},
    opts: { isAdmin?: boolean } = {},
  ) {
    const defs = await this.list(organizationId);
    return this.validateWith(defs, data, opts);
  }

  // Same rules as validate() but against already-fetched defs — so a bulk caller (CSV import) can
  // load the org's field defs ONCE and validate thousands of rows without a query per row.
  // `lenient` (used by inbound ingestion) never throws: a bad or missing custom value is skipped so
  // a real inbound lead is never dropped over a malformed field — the caller keeps the raw value.
  static validateWith(
    defs: Awaited<ReturnType<typeof CustomFieldService.list>>,
    data: Record<string, unknown> = {},
    opts: { isAdmin?: boolean; lenient?: boolean } = {},
  ) {
    const isAdmin = opts.isAdmin ?? true;
    const clean: Record<string, unknown> = {};
    for (const def of defs) {
      if (def.disabled) continue; // disabled fields aren't captured
      if (def.adminOnly && !isAdmin) continue; // non-admins can't see or set admin-only fields
      try {
      const raw = data[def.key];
      const options = def.options ?? [];

      // Emptiness depends on type: [] for multiselect, unchecked for checkbox.
      const isEmpty =
        raw === undefined || raw === null || raw === "" ||
        (def.type === "multiselect" && Array.isArray(raw) && raw.length === 0);
      if (isEmpty) {
        if (def.required) throw new FieldValidationError(`Missing required field: ${def.label}`);
        continue;
      }

      switch (def.type) {
        case "number":
        case "currency": {
          // Currency shares number's coercion (strip currency symbols + thousands separators) so
          // amounts are stored numerically, not as free text — sortable and aggregatable.
          const trimmed = typeof raw === "string" ? raw.trim().replace(/[$€£₹,\s]/g, "") : raw;
          const num = Number(trimmed);
          if (trimmed === "" || isNaN(num)) throw new FieldValidationError(`${def.label} must be a number`);
          clean[def.key] = num;
          break;
        }
        case "checkbox":
          clean[def.key] = raw === true || raw === "true" || raw === "on" || raw === "1";
          break;
        case "date": {
          const s = String(raw);
          if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || isNaN(Date.parse(s))) throw new FieldValidationError(`${def.label} must be a valid date`);
          clean[def.key] = s;
          break;
        }
        case "datetime": {
          const s = String(raw);
          // datetime-local shape: YYYY-MM-DDTHH:mm (seconds optional).
          if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(s) || isNaN(Date.parse(s))) throw new FieldValidationError(`${def.label} must be a valid date and time`);
          clean[def.key] = s;
          break;
        }
        case "url": {
          const s = String(raw);
          let parsed: URL;
          try { parsed = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`); } catch { throw new FieldValidationError(`${def.label} must be a valid URL`); }
          if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new FieldValidationError(`${def.label} must be an http(s) URL`);
          clean[def.key] = s;
          break;
        }
        case "select":
          if (options.length && !options.includes(String(raw))) throw new FieldValidationError(`${def.label} must be one of: ${options.join(", ")}`);
          clean[def.key] = raw;
          break;
        case "multiselect": {
          const arr = Array.isArray(raw) ? raw.map(String) : String(raw).split(",").map((s) => s.trim()).filter(Boolean);
          if (options.length) {
            const bad = arr.find((v) => !options.includes(v));
            if (bad) throw new FieldValidationError(`${def.label} has an invalid option: ${bad}`);
          }
          clean[def.key] = arr;
          break;
        }
        default: // text, textarea
          clean[def.key] = raw;
      }
      } catch (e) {
        if (opts.lenient && e instanceof FieldValidationError) continue; // skip bad/missing field
        throw e;
      }
    }
    return clean;
  }
}
