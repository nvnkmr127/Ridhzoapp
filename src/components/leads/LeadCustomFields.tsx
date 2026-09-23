"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { updateCustomDataAction } from "@/lib/actions/leads";
import { listCustomFieldsAction } from "@/lib/actions/customFields";
import { CustomFieldInputs, type CustomFieldDef } from "@/components/leads/CustomFieldInputs";

function toStr(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
}

// Internal bookkeeping we stash in customData (lead scoring, ingestion provenance, attribution).
// Never show these as "captured data" or let a Save stringify them — preserve them untouched.
const INTERNAL_EXTRA_KEYS = new Set(["leadSource", "expectedValue", "facebook_lead_id"]);
const isInternalKey = (k: string) => k.startsWith("_") || INTERNAL_EXTRA_KEYS.has(k);

// Renders the org's DEFINED custom fields as typed inputs bound to this lead's customData.
// Any extra keys (e.g. raw webhook payload) are shown read-only so nothing is hidden.
export function LeadCustomFields({ leadId, initialData, initialDefs }: { leadId: string; initialData: Record<string, unknown>; initialDefs?: CustomFieldDef[] }) {
  const router = useRouter();
  const { toast } = useToast();
  // Seed from the server-provided defs so the fields paint immediately; still refresh in the
  // background in case they changed since render.
  const [defs, setDefs] = React.useState<CustomFieldDef[]>(() => (initialDefs ?? []).filter((f) => !f.disabled));
  const [values, setValues] = React.useState<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(initialData || {})) {
      if (isInternalKey(k)) continue; // don't expose or stringify internal keys
      out[k] = toStr(v);
    }
    return out;
  });
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!initialDefs || initialDefs.length === 0) {
      listCustomFieldsAction().then((r) => setDefs((r as CustomFieldDef[]).filter((f) => !f.disabled))).catch(() => {});
    }
  }, [initialDefs]);

  const definedKeys = new Set(defs.map((d) => d.key));
  const extraKeys = Object.keys(initialData || {}).filter((k) => !definedKeys.has(k) && !isInternalKey(k));

  async function save() {
    setSaving(true);
    try {
      const activeDefs = defs.filter((d) => !d.disabled);
      const missing = activeDefs.filter((d) => d.required && !(String(values[d.key] ?? "")).trim());
      if (missing.length) {
        toast({ variant: "destructive", title: "Required field missing", description: missing.map((m) => m.label).join(", ") });
        return;
      }
      // updateCustomData replaces customData wholesale, so carry the hidden internal keys back with
      // their original (un-stringified) values, or Save would drop / corrupt _scoreFactors etc.
      const preserved: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(initialData || {})) if (isInternalKey(k)) preserved[k] = v;
      const res = await updateCustomDataAction(leadId, { ...preserved, ...values });
      if (!res.ok) {
        toast({ variant: "destructive", title: "Could not save details", description: res.message });
        return;
      }
      toast({ title: "Details saved" });
      router.refresh();
    } catch {
      toast({ variant: "destructive", title: "Could not save details", description: "We couldn't reach the server. Please try again." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      {defs.length === 0 ? (
        <div className="text-xs text-muted-foreground">
          No custom fields defined.{" "}
          <Link href="/settings/custom-fields" className="underline underline-offset-2">Add some</Link>.
        </div>
      ) : (
        <CustomFieldInputs defs={defs} values={values} onChange={(k, v) => setValues((s) => ({ ...s, [k]: v }))} />
      )}

      {extraKeys.length > 0 && (
        <div className="rounded-lg border border-dashed p-2 space-y-1">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Other captured data</p>
          {extraKeys.map((k) => (
            <div key={k} className="flex justify-between gap-2 text-xs">
              <span className="text-muted-foreground">{k}</span>
              <span className="truncate">{toStr(initialData[k])}</span>
            </div>
          ))}
        </div>
      )}

      {defs.length > 0 && (
        <div className="flex justify-end">
          <Button size="sm" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
        </div>
      )}
    </div>
  );
}
