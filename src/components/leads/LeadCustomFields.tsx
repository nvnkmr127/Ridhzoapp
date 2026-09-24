"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { updateCustomDataAction } from "@/lib/actions/leads";
import { listCustomFieldsAction } from "@/lib/actions/customFields";
import { CustomFieldInputs, type CustomFieldDef } from "@/components/leads/CustomFieldInputs";
import { isInternalKey } from "@/lib/leads/formAnswers";

function toStr(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
}

// Renders the org's DEFINED custom fields as typed inputs bound to this lead's customData. Undefined
// keys (raw form answers) are shown in the "Lead's answers" card instead; internal keys are preserved
// untouched on save.
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
        <div className="space-y-2 text-xs text-muted-foreground">
          <p>Track extra details on every lead — e.g. budget, property type, preferred location.</p>
          <Button asChild variant="outline" size="sm" className="h-9">
            <Link href="/settings/custom-fields">Set up fields</Link>
          </Button>
        </div>
      ) : (
        <CustomFieldInputs defs={defs} values={values} onChange={(k, v) => setValues((s) => ({ ...s, [k]: v }))} />
      )}


      {defs.length > 0 && (
        <div className="flex justify-end">
          <Button size="sm" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
        </div>
      )}
    </div>
  );
}
