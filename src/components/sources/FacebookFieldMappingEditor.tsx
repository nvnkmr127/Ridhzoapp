"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Loader2, RefreshCw } from "lucide-react";
import { listFacebookFormFieldsAction, updateSourceFieldMappingsAction } from "@/lib/actions/sources";
import { listCustomFieldsAction } from "@/lib/actions/customFields";
import type { CustomFieldDef } from "@/components/leads/CustomFieldInputs";

type Rule = { facebookFieldKey: string; targetField: "name" | "email" | "phone" | "expectedValue" | "customData"; customDataKey?: string };
type FbField = { key: string; label: string };

// The fixed lead-field targets a Facebook question can map to. "" = leave in customData under its
// raw Facebook key (the default behaviour when unmapped).
const STANDARD_TARGETS: { value: string; label: string }[] = [
  { value: "", label: "— Leave as raw data —" },
  { value: "name", label: "Name" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "expectedValue", label: "Expected value" },
];

// Encodes a rule's target as a single <select> value: "std:email" for a lead field, or "cf:<key>"
// for a custom field. Keeps one dropdown per Facebook question.
function ruleToValue(r?: Rule): string {
  if (!r) return "";
  if (r.targetField === "customData") return r.customDataKey ? `cf:${r.customDataKey}` : "";
  return `std:${r.targetField}`;
}

export function FacebookFieldMappingEditor({
  sourceId,
  initialConfig,
}: {
  sourceId: string;
  initialConfig: unknown;
}) {
  const { toast } = useToast();
  const [fbFields, setFbFields] = React.useState<FbField[]>([]);
  const [customFields, setCustomFields] = React.useState<CustomFieldDef[]>([]);
  const [rules, setRules] = React.useState<Rule[]>(
    () => (((initialConfig as any)?.fieldMappings ?? []) as Rule[]),
  );
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  const loadFields = React.useCallback(async () => {
    setLoading(true);
    try {
      const [fbRes, cfRes] = await Promise.all([
        listFacebookFormFieldsAction(sourceId),
        listCustomFieldsAction(),
      ]);
      setCustomFields((cfRes as CustomFieldDef[]).filter((f) => !f.disabled));
      if (fbRes.ok) {
        setFbFields(fbRes.data.fields);
      } else {
        toast({ variant: "destructive", title: "Couldn't load Facebook questions", description: fbRes.message });
      }
    } catch {
      toast({ variant: "destructive", title: "Couldn't load Facebook questions", description: "Please try again." });
    } finally {
      setLoading(false);
    }
  }, [sourceId, toast]);

  React.useEffect(() => { void loadFields(); }, [loadFields]);

  // Show every discovered Facebook question, plus any already-mapped key that wasn't rediscovered
  // (e.g. a form was since edited) so a saved rule is never silently hidden.
  const rows = React.useMemo(() => {
    const map = new Map<string, string>(fbFields.map((f) => [f.key, f.label]));
    for (const r of rules) if (!map.has(r.facebookFieldKey)) map.set(r.facebookFieldKey, r.facebookFieldKey);
    return [...map.entries()].map(([key, label]) => ({ key, label }));
  }, [fbFields, rules]);

  function setTarget(fbKey: string, value: string) {
    setRules((cur) => {
      const rest = cur.filter((r) => r.facebookFieldKey !== fbKey);
      if (!value) return rest; // unmapped → no rule (raw customData)
      if (value.startsWith("cf:")) {
        return [...rest, { facebookFieldKey: fbKey, targetField: "customData", customDataKey: value.slice(3) }];
      }
      return [...rest, { facebookFieldKey: fbKey, targetField: value.slice(4) as Rule["targetField"] }];
    });
  }

  async function save() {
    setSaving(true);
    try {
      const res = await updateSourceFieldMappingsAction({ sourceId, fieldMappings: rules });
      if (!res.ok) { toast({ variant: "destructive", title: "Couldn't save mapping", description: res.message }); return; }
      toast({ title: "Field mapping saved", description: "New Facebook leads will use these mappings." });
    } catch {
      toast({ variant: "destructive", title: "Couldn't save mapping", description: "Please try again." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-2 rounded-xl border bg-muted/30 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-medium">Map form questions to fields</p>
        <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => void loadFields()} disabled={loading}>
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />} Reload
        </Button>
      </div>

      {loading && rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">Loading questions from Facebook…</p>
      ) : rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No questions found. Select the forms to capture above, then reload. Unmapped questions are still
          stored on the lead as raw data.
        </p>
      ) : (
        <div className="space-y-1.5">
          {rows.map((row) => (
            <div key={row.key} className="grid grid-cols-2 items-center gap-2">
              <span className="truncate text-xs" title={row.key}>{row.label}</span>
              <select
                value={ruleToValue(rules.find((r) => r.facebookFieldKey === row.key))}
                onChange={(e) => setTarget(row.key, e.target.value)}
                className="h-8 rounded-md border bg-background px-2 text-xs"
              >
                {STANDARD_TARGETS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                {customFields.length > 0 && (
                  <optgroup label="Custom fields">
                    {customFields.map((cf) => <option key={cf.key} value={`cf:${cf.key}`}>{cf.label}</option>)}
                  </optgroup>
                )}
              </select>
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 flex justify-end">
        <Button size="sm" className="h-8 text-xs" onClick={save} disabled={saving || loading}>
          {saving ? "Saving…" : "Save mapping"}
        </Button>
      </div>
    </div>
  );
}
