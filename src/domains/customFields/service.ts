import { db } from "@/db";
import { customFieldDefs, leads, leadSources, leadDistributionRules, automations, automationConditions } from "@/db/schema";
import { and, asc, eq, max, sql } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { hasOptions, hasDefault, type CustomFieldType } from "@/lib/customFields/types";

export type { CustomFieldType };

// Cache tag for an org's custom-field defs. Mutations (create/update/reorder/remove) revalidate it
// so cached reads refresh immediately instead of after the TTL.
export const customFieldsTag = (organizationId: string) => `custom-fields:${organizationId}`;

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

// Compare a submitted value with a stored one across their shapes (form strings vs stored numbers /
// arrays): "1000" ≡ 1000, "a,b" ≡ ["a","b"], "" ≡ null.
function normalized(v: unknown): string {
  if (v === undefined || v === null) return "";
  return Array.isArray(v) ? v.map(String).join(",") : String(v);
}

// Trimmed, de-duplicated options. Select types need at least one; commas are reserved because
// multiple-choice values travel comma-joined through forms and CSV.
function cleanOptions(type: string, options: string[] | undefined): string[] {
  if (!hasOptions(type)) return [];
  const out = [...new Set((options ?? []).map((o) => o.trim()).filter(Boolean))];
  if (out.length === 0) throw new FieldValidationError("Add at least one option.");
  if (out.some((o) => o.includes(","))) throw new FieldValidationError("Options can't contain commas.");
  return out;
}

type Def = typeof customFieldDefs.$inferSelect;

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
    const options = cleanOptions(input.type, input.options);
    const defaultValue = this.checkDefault({ label: input.label, type: input.type, options }, input.defaultValue);
    // Two admins adding the same label at once both pick the same free key; the unique index
    // rejects the loser, which then retries with the next suffix.
    for (let attempt = 0; ; attempt++) {
      const key = await this.uniqueKey(organizationId, slugify(input.label));
      // Append to the end of the current order rather than colliding at index 0.
      const [{ maxIndex } = { maxIndex: null }] = await db
        .select({ maxIndex: max(customFieldDefs.orderIndex) })
        .from(customFieldDefs)
        .where(eq(customFieldDefs.organizationId, organizationId));
      try {
        const [row] = await db
          .insert(customFieldDefs)
          .values({
            organizationId,
            key,
            orderIndex: (maxIndex ?? -1) + 1,
            label: input.label,
            type: input.type,
            options,
            required: input.required ?? false,
            defaultValue,
            disabled: input.disabled ?? false,
            adminOnly: input.adminOnly ?? false,
            showOnTable: input.showOnTable ?? false,
            section: input.section || null,
            subsection: input.subsection || null,
          })
          .returning();
        return row;
      } catch (e) {
        if ((e as { code?: string })?.code !== "23505" || attempt >= 2) throw e;
      }
    }
  }

  // A default must be a value the field would accept, or every new lead starts out invalid.
  private static checkDefault(def: { label: string; type: string; options: string[] }, value: string | null | undefined): string | null {
    const v = value?.trim();
    if (!v || !hasDefault(def.type)) return null;
    try {
      this.validateWith([{ ...def, key: "_", required: false, disabled: false, adminOnly: false } as unknown as Def], { _: v });
    } catch (e) {
      if (e instanceof FieldValidationError) throw new FieldValidationError(`Default value: ${e.message}`);
      throw e;
    }
    return v;
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
    const [current] = await db
      .select()
      .from(customFieldDefs)
      .where(and(eq(customFieldDefs.id, id), eq(customFieldDefs.organizationId, organizationId)))
      .limit(1);
    if (!current) return null;
    const options = input.options !== undefined ? cleanOptions(current.type, input.options) : current.options ?? [];
    const label = input.label ?? current.label;
    const patch: Record<string, unknown> = {};
    if (input.label !== undefined) patch.label = input.label;
    if (input.required !== undefined) patch.required = input.required;
    if (input.options !== undefined) patch.options = options;
    // Re-check the default when it or the options change (an option removal can orphan it).
    if (input.defaultValue !== undefined || input.options !== undefined) {
      patch.defaultValue = this.checkDefault({ label, type: current.type, options }, input.defaultValue !== undefined ? input.defaultValue : current.defaultValue);
    }
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
    return row ?? null;
  }

  // Persist a new display order. Index = position in the passed id list. One transaction, so a
  // failure part-way can't leave a half-applied order.
  static async reorder(organizationId: string, orderedIds: string[]) {
    await db.transaction(async (tx) => {
      for (let i = 0; i < orderedIds.length; i++) {
        await tx
          .update(customFieldDefs)
          .set({ orderIndex: i })
          .where(and(eq(customFieldDefs.id, orderedIds[i]), eq(customFieldDefs.organizationId, organizationId)));
      }
    });
    return { ok: true };
  }

  // What a delete (or option removal) would touch: leads holding a value, and config that refers to
  // the key (web forms / field mappings, routing rules, automations). References are a text match on
  // the stored JSON — a "may use" list for the confirm dialog, not a guarantee.
  static async usage(organizationId: string, id: string, removedOptions: string[] = []) {
    const [def] = await db
      .select()
      .from(customFieldDefs)
      .where(and(eq(customFieldDefs.id, id), eq(customFieldDefs.organizationId, organizationId)))
      .limit(1);
    if (!def) return null;
    const k = def.key;
    const inOrg = eq(leads.organizationId, organizationId);
    const [[{ n: leadCount }], [{ n: optionLeadCount }], sources, rules, autos] = await Promise.all([
      db.select({ n: sql<number>`count(*)::int` }).from(leads).where(and(inOrg, sql`jsonb_exists(${leads.customData}, ${k})`)),
      removedOptions.length
        ? db.select({ n: sql<number>`count(*)::int` }).from(leads).where(and(inOrg,
            sql`jsonb_exists_any(${leads.customData}->${k}, ARRAY[${sql.join(removedOptions.map((o) => sql`${o}`), sql`, `)}]::text[])`))
        : Promise.resolve([{ n: 0 }]),
      db.select({ name: leadSources.name }).from(leadSources)
        .where(and(eq(leadSources.organizationId, organizationId), sql`strpos(${leadSources.config}::text, ${`"${k}"`}) > 0`)),
      db.select({ name: leadDistributionRules.name }).from(leadDistributionRules)
        .where(and(eq(leadDistributionRules.organizationId, organizationId), sql`strpos(${leadDistributionRules.conditions}::text, ${`customData.${k}"`}) > 0`)),
      db.selectDistinct({ name: automations.name }).from(automationConditions)
        .innerJoin(automations, eq(automations.id, automationConditions.automationId))
        .where(and(eq(automations.organizationId, organizationId), sql`strpos(${automationConditions.config}::text, ${k}) > 0`)),
    ]);
    return {
      key: k,
      leads: leadCount,
      leadsWithRemovedOptions: optionLeadCount,
      references: [
        ...sources.map((s) => `Lead source: ${s.name}`),
        ...rules.map((r) => `New-lead alert rule${r.name ? `: ${r.name}` : ""}`),
        ...autos.map((a) => `Automation: ${a.name}`),
      ],
    };
  }

  // Deletes the definition AND its values on every lead, in one transaction — otherwise a later
  // field with the same label would reuse the freed key and inherit the old (possibly wrong-typed)
  // values. Returns false if there was nothing to delete.
  static async remove(organizationId: string, id: string) {
    return db.transaction(async (tx) => {
      const [def] = await tx
        .delete(customFieldDefs)
        .where(and(eq(customFieldDefs.id, id), eq(customFieldDefs.organizationId, organizationId)))
        .returning({ key: customFieldDefs.key });
      if (!def) return false;
      await tx
        .update(leads)
        .set({ customData: sql`${leads.customData} - ${def.key}` })
        .where(and(eq(leads.organizationId, organizationId), sql`jsonb_exists(${leads.customData}, ${def.key})`));
      return true;
    });
  }

  // Default values for a NEW lead's empty fields (server-side, so API / import / inbound leads get
  // them too — not just the web Add form).
  static withDefaults(defs: Def[], data: Record<string, unknown> = {}) {
    const out = { ...data };
    for (const d of defs) {
      if (d.disabled || !d.defaultValue) continue;
      if (normalized(out[d.key]) === "") out[d.key] = d.defaultValue;
    }
    return out;
  }

  // Validates a custom_data payload against this org's field defs. Returns cleaned values.
  // `isAdmin` (default true, e.g. API keys) gates admin-only fields: a non-admin caller cannot
  // set them (any admin-only key they send is ignored) and isn't required to fill them.
  static async validate(
    organizationId: string,
    data: Record<string, unknown> = {},
    opts: { isAdmin?: boolean; existing?: Record<string, unknown>; isNew?: boolean } = {},
  ) {
    const defs = await this.list(organizationId);
    return this.validateWith(defs, data, opts);
  }

  // Same rules as validate() but against already-fetched defs — so a bulk caller (CSV import) can
  // load the org's field defs ONCE and validate thousands of rows without a query per row.
  // `lenient` (used by inbound ingestion) never throws: a bad or missing custom value is skipped so
  // a real inbound lead is never dropped over a malformed field — the caller keeps the raw value.
  // `existing` (edits): a value the user didn't change is kept as stored without re-checking, so a
  // lead isn't locked by a later settings change (an option removed, a field made required).
  // `isNew` (creates): empty fields take their default value first.
  static validateWith(
    defs: Awaited<ReturnType<typeof CustomFieldService.list>>,
    data: Record<string, unknown> = {},
    opts: { isAdmin?: boolean; lenient?: boolean; existing?: Record<string, unknown>; isNew?: boolean } = {},
  ) {
    const isAdmin = opts.isAdmin ?? true;
    if (opts.isNew) data = this.withDefaults(defs, data);
    const clean: Record<string, unknown> = {};
    for (const def of defs) {
      if (def.disabled) continue; // disabled fields aren't captured
      if (def.adminOnly && !isAdmin) continue; // non-admins can't see or set admin-only fields
      try {
      const raw = data[def.key];
      if (opts.existing && normalized(raw) === normalized(opts.existing[def.key])) {
        const stored = opts.existing[def.key];
        if (normalized(stored) !== "") clean[def.key] = stored;
        continue;
      }
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
