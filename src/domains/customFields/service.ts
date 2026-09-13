import { db } from "@/db";
import { customFieldDefs } from "@/db/schema";
import { and, asc, eq } from "drizzle-orm";

export type CustomFieldType =
  | "text" | "textarea" | "number" | "currency" | "date" | "datetime"
  | "select" | "multiselect" | "checkbox" | "url";

const OPTION_TYPES: CustomFieldType[] = ["select", "multiselect"];

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

  static async create(
    organizationId: string,
    input: {
      label: string; type: CustomFieldType; options?: string[]; required?: boolean;
      defaultValue?: string | null; disabled?: boolean; adminOnly?: boolean; showOnTable?: boolean;
      section?: string | null; subsection?: string | null;
    },
  ) {
    const [row] = await db
      .insert(customFieldDefs)
      .values({
        organizationId,
        key: slugify(input.label),
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
  static async validate(organizationId: string, data: Record<string, unknown> = {}) {
    const defs = await this.list(organizationId);
    const clean: Record<string, unknown> = {};
    for (const def of defs) {
      if (def.disabled) continue; // disabled fields aren't captured
      const raw = data[def.key];
      const opts = def.options ?? [];

      // Emptiness depends on type: [] for multiselect, unchecked for checkbox.
      const isEmpty =
        raw === undefined || raw === null || raw === "" ||
        (def.type === "multiselect" && Array.isArray(raw) && raw.length === 0);
      if (isEmpty) {
        if (def.required) throw new Error(`Missing required field: ${def.label}`);
        continue;
      }

      switch (def.type) {
        case "number": {
          const trimmed = typeof raw === "string" ? raw.trim().replace(/^[$,€£₹]/, "").replace(/,/g, "") : raw;
          const num = Number(trimmed);
          if (trimmed === "" || isNaN(num)) throw new Error(`${def.label} must be a number`);
          clean[def.key] = num;
          break;
        }
        case "checkbox":
          clean[def.key] = raw === true || raw === "true" || raw === "on" || raw === "1";
          break;
        case "url": {
          const s = String(raw);
          try { new URL(s.startsWith("http") ? s : `https://${s}`); } catch { throw new Error(`${def.label} must be a valid URL`); }
          clean[def.key] = s;
          break;
        }
        case "select":
          if (opts.length && !opts.includes(String(raw))) throw new Error(`${def.label} must be one of: ${opts.join(", ")}`);
          clean[def.key] = raw;
          break;
        case "multiselect": {
          const arr = Array.isArray(raw) ? raw.map(String) : String(raw).split(",").map((s) => s.trim()).filter(Boolean);
          if (opts.length) {
            const bad = arr.find((v) => !opts.includes(v));
            if (bad) throw new Error(`${def.label} has an invalid option: ${bad}`);
          }
          clean[def.key] = arr;
          break;
        }
        default: // text, textarea, date, datetime
          clean[def.key] = raw;
      }
    }
    return clean;
  }
}
