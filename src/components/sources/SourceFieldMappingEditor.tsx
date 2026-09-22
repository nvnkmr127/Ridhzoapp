"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Loader2, RefreshCw, Plus } from "lucide-react";
import {
  listFacebookFormFieldsAction,
  listSourceLeadFieldsAction,
  updateSourceFieldMappingsAction,
} from "@/lib/actions/sources";
import { listCustomFieldsAction } from "@/lib/actions/customFields";
import type { CustomFieldDef } from "@/components/leads/CustomFieldInputs";

type Rule = { facebookFieldKey: string; targetField: "name" | "email" | "phone" | "expectedValue" | "customData"; customDataKey?: string };
type SourceField = { key: string; label: string };

// The fixed lead-field targets a question can map to. "" = leave in customData under its raw key
// (the default when unmapped).
const STANDARD_TARGETS: { value: string; label: string }[] = [
  { value: "", label: "— Leave as raw data —" },
  { value: "name", label: "Name" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "expectedValue", label: "Expected value" },
];

// Encodes a rule's target as a single <select> value: "std:email" for a lead field, "cf:<key>" for
// a custom field. Keeps one dropdown per question.
function ruleToValue(r?: Rule): string {
  if (!r) return "";
  if (r.targetField === "customData") return r.customDataKey ? `cf:${r.customDataKey}` : "";
  return `std:${r.targetField}`;
}

export function SourceFieldMappingEditor({
  sourceId,
  initialConfig,
  provider,
}: {
  sourceId: string;
  initialConfig: unknown;
  provider: "facebook" | "google";
}) {
  const { toast } = useToast();
  const [sourceFields, setSourceFields] = React.useState<SourceField[]>([]);
  const [customFields, setCustomFields] = React.useState<CustomFieldDef[]>([]);
  const [rules, setRules] = React.useState<Rule[]>(
    () => (((initialConfig as any)?.fieldMappings ?? []) as Rule[]),
  );
  const [manualKey, setManualKey] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  const loadFields = React.useCallback(async () => {
    setLoading(true);
    try {
      const fieldsPromise = provider === "facebook"
        ? listFacebookFormFieldsAction(sourceId)
        : listSourceLeadFieldsAction(sourceId);
      const [fieldsRes, cfRes] = await Promise.all([fieldsPromise, listCustomFieldsAction()]);
      setCustomFields((cfRes as CustomFieldDef[]).filter((f) => !f.disabled));
      if (fieldsRes.ok) {
        setSourceFields(fieldsRes.data.fields);
      } else {
        toast({ variant: "destructive", title: "Couldn't load form questions", description: fieldsRes.message });
      }
    } catch {
      toast({ variant: "destructive", title: "Couldn't load form questions", description: "Please try again." });
    } finally {
      setLoading(false);
    }
  }, [sourceId, provider, toast]);

  React.useEffect(() => { void loadFields(); }, [loadFields]);

  // Show every discovered question, plus any already-mapped or manually-added key not rediscovered,
  // so a saved rule is never silently hidden.
  const rows = React.useMemo(() => {
    const map = new Map<string, string>(sourceFields.map((f) => [f.key, f.label]));
    for (const r of rules) if (!map.has(r.facebookFieldKey)) map.set(r.facebookFieldKey, r.facebookFieldKey);
    return [...map.entries()].map(([key, label]) => ({ key, label }));
  }, [sourceFields, rules]);

  function setTarget(fieldKey: string, value: string) {
    setRules((cur) => {
      const rest = cur.filter((r) => r.facebookFieldKey !== fieldKey);
      if (!value) return rest; // unmapped → no rule (raw customData)
      if (value.startsWith("cf:")) {
        return [...rest, { facebookFieldKey: fieldKey, targetField: "customData", customDataKey: value.slice(3) }];
      }
      return [...rest, { facebookFieldKey: fieldKey, targetField: value.slice(4) as Rule["targetField"] }];
    });
  }

  function addManualKey() {
    const key = manualKey.trim();
    if (!key) return;
    if (!sourceFields.some((f) => f.key === key)) setSourceFields((cur) => [...cur, { key, label: key }]);
    setManualKey("");
  }

  async function save() {
    setSaving(true);
    try {
      const res = await updateSourceFieldMappingsAction({ sourceId, fieldMappings: rules });
      if (!res.ok) { toast({ variant: "destructive", title: "Couldn't save mapping", description: res.message }); return; }
      toast({ title: "Field mapping saved", description: "New leads from this source will use these mappings." });
    } catch {
      toast({ variant: "destructive", title: "Couldn't save mapping", description: "Please try again." });
    } finally {
      setSaving(false);
    }
  }

  const emptyHint = provider === "facebook"
    ? "No questions found. Select the forms to capture above, then reload."
    : "No questions seen yet — they appear after the first Google lead arrives. Add a column key by hand below to map it ahead of time.";

  return (
    <div className="mt-2 rounded-xl border bg-muted/30 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-medium">Map form questions to fields</p>
        <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => void loadFields()} disabled={loading}>
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />} Reload
        </Button>
      </div>

      {loading && rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">Loading questions…</p>
      ) : rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">{emptyHint} Unmapped questions are still stored on the lead as raw data.</p>
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

      <div className="mt-2 flex items-center gap-2">
        <Input
          value={manualKey}
          onChange={(e) => setManualKey(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addManualKey(); } }}
          placeholder="Add a question / column key…"
          className="h-8 text-xs"
        />
        <Button variant="outline" size="sm" className="h-8 gap-1 text-xs" onClick={addManualKey} disabled={!manualKey.trim()}>
          <Plus className="h-3 w-3" /> Add
        </Button>
      </div>

      <div className="mt-3 flex justify-end">
        <Button size="sm" className="h-8 text-xs" onClick={save} disabled={saving || loading}>
          {saving ? "Saving…" : "Save mapping"}
        </Button>
      </div>
    </div>
  );
}
