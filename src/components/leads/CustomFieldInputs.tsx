"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type CustomFieldDef = {
  id: string;
  key: string;
  label: string;
  type: string; // text | textarea | number | date | datetime | select | multiselect | checkbox | url
  options: string[] | null;
  required: boolean;
  defaultValue?: string | null;
  disabled?: boolean;
  adminOnly?: boolean;
  showOnTable?: boolean;
  section?: string | null;
  subsection?: string | null;
};

const NONE = "__none__";

// Seed a values map with each field's default (for new records). Skips disabled fields.
export function defaultCustomValues(defs: CustomFieldDef[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of defs) if (!f.disabled && f.defaultValue) out[f.key] = f.defaultValue;
  return out;
}

// Renders the org's defined custom fields as typed inputs bound to a values map.
// One place used by the Add form, Edit form, and lead detail so they stay consistent.
export function CustomFieldInputs({
  defs,
  values,
  onChange,
  isAdmin = true,
}: {
  defs: CustomFieldDef[];
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
  isAdmin?: boolean;
}) {
  const visible = defs.filter((f) => !f.disabled && (isAdmin || !f.adminOnly));
  if (visible.length === 0) return null;

  function renderField(f: CustomFieldDef) {
    const val = String(values[f.key] ?? "");
    const req = f.required;
    const id = `cf-${f.key}`;
    return (
      <div key={f.id} className="space-y-1.5">
        {f.type !== "checkbox" && (
          <Label htmlFor={id} className="text-sm">
            {f.label}{req && <span className="text-destructive"> *</span>}
          </Label>
        )}

        {f.type === "textarea" ? (
          <Textarea id={id} value={val} onChange={(e) => onChange(f.key, e.target.value)}
            className={req && !val.trim() ? "border-destructive/60" : ""} />
        ) : f.type === "select" ? (
          <Select value={val || NONE} onValueChange={(v) => onChange(f.key, v === NONE ? "" : v)}>
            <SelectTrigger id={id}><SelectValue placeholder="Select…" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>— none —</SelectItem>
              {(f.options ?? []).map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
              {/* A value whose option was later removed from the field — still shown, still kept. */}
              {val && !(f.options ?? []).includes(val) && <SelectItem value={val}>{val} (removed option)</SelectItem>}
            </SelectContent>
          </Select>
        ) : f.type === "multiselect" ? (
          <div className="flex flex-wrap gap-2">
            {[...(f.options ?? []), ...(val ? val.split(",").map((s) => s.trim()).filter((s) => s && !(f.options ?? []).includes(s)) : [])].map((o) => {
              const set = new Set((val ? val.split(",") : []).map((s) => s.trim()).filter(Boolean));
              const checked = set.has(o);
              return (
                <label key={o} className="flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs">
                  <input type="checkbox" checked={checked}
                    onChange={(e) => { if (e.target.checked) set.add(o); else set.delete(o); onChange(f.key, [...set].join(",")); }} />
                  {o}{!(f.options ?? []).includes(o) && " (removed)"}
                </label>
              );
            })}
          </div>
        ) : f.type === "checkbox" ? (
          <label htmlFor={id} className="flex items-center gap-2 text-sm">
            <input id={id} type="checkbox" checked={val === "true"}
              onChange={(e) => onChange(f.key, e.target.checked ? "true" : "")} className="h-4 w-4" />
            {f.label}{req && <span className="text-destructive"> *</span>}
          </label>
        ) : f.type === "currency" ? (
          // No hardcoded symbol — the field label carries the currency (e.g. "Budget (₹)"), so it
          // stays tenant/locale-agnostic. Decimal keypad on mobile, tabular figures, right-aligned.
          <Input
            id={id}
            inputMode="decimal"
            value={val}
            onChange={(e) => onChange(f.key, e.target.value.replace(/[^0-9.]/g, ""))}
            placeholder="0.00"
            className={`text-right tabular-nums ${req && !val.trim() ? "border-destructive/60" : ""}`}
          />
        ) : (
          <Input
            id={id}
            // URL uses type=text (not type=url): the server accepts bare domains like "example.com"
            // and adds the scheme, so the browser must not hard-reject them on submit.
            type={f.type === "number" ? "number" : f.type === "date" ? "date" : f.type === "datetime" ? "datetime-local" : "text"}
            inputMode={f.type === "url" ? "url" : undefined}
            value={val}
            onChange={(e) => onChange(f.key, e.target.value)}
            className={req && !val.trim() ? "border-destructive/60" : ""}
          />
        )}
      </div>
    );
  }

  // Group into tab (section) → sub-tab (subsection). Ungrouped fields render first with no heading,
  // preserving the flat layout for orgs that don't use sections. Order within a group follows `defs`.
  const ungrouped = visible.filter((f) => !f.section);
  const sections: string[] = [];
  for (const f of visible) if (f.section && !sections.includes(f.section)) sections.push(f.section);

  return (
    <div className="space-y-5">
      {ungrouped.length > 0 && <div className="space-y-3">{ungrouped.map(renderField)}</div>}

      {sections.map((section) => {
        const inSection = visible.filter((f) => f.section === section);
        const subs: (string | null)[] = [];
        for (const f of inSection) {
          const key = f.subsection || null;
          if (!subs.includes(key)) subs.push(key);
        }
        return (
          <div key={section} className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground border-b border-border pb-1">{section}</h4>
            {subs.map((sub) => (
              <div key={sub ?? "_"} className="space-y-3">
                {sub && <p className="text-xs font-medium text-foreground/70">{sub}</p>}
                {inSection.filter((f) => (f.subsection || null) === sub).map(renderField)}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
