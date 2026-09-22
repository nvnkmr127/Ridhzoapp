"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GripVertical, Plus, Trash2, ArrowUp, ArrowDown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { updateSourceFormAction } from "@/lib/actions/sources";
import { listCustomFieldsAction } from "@/lib/actions/customFields";
import type { CustomFieldDef } from "@/components/leads/CustomFieldInputs";
import {
  resolveFormFields,
  isStandard,
  MAX_STEPS,
  type FormField,
  type FormFieldType,
} from "@/lib/leads/formFields";

const TYPES: FormFieldType[] = ["text", "email", "tel", "number", "textarea", "select", "date", "url"];

// Map a custom-field def's type to the closest web-form input type, so inserting a field renders the
// right control and (via the shared key) validates on ingestion.
function defTypeToFormType(t: string): FormFieldType {
  switch (t) {
    case "number": case "currency": return "number";
    case "select": case "multiselect": return "select";
    case "date": case "datetime": return "date";
    case "url": return "url";
    case "textarea": return "textarea";
    default: return "text";
  }
}

// Per-webform field builder. Reorders, adds, removes and edits fields; standard keys map to lead
// columns, custom ones to custom_data. Saves the schema onto the source's config.
export function FormFieldsEditor({ sourceId, initialConfig }: { sourceId: string; initialConfig: unknown }) {
  const { toast } = useToast();
  const [fields, setFields] = React.useState<FormField[]>(() => resolveFormFields(initialConfig));
  const [customDefs, setCustomDefs] = React.useState<CustomFieldDef[]>([]);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    listCustomFieldsAction().then((r) => setCustomDefs((r as CustomFieldDef[]).filter((f) => !f.disabled))).catch(() => {});
  }, []);

  // Append a form field bound to an org custom field: same key (so ingestion writes + validates it),
  // matching input type and options. This is how a web/multi-step form captures a real custom field.
  function addFromCustomField(def: CustomFieldDef) {
    setFields((fs) => {
      if (fs.some((f) => f.key === def.key)) {
        toast({ title: "Already added", description: `"${def.label}" is already on the form.` });
        return fs;
      }
      const type = defTypeToFormType(def.type);
      return [...fs, {
        key: def.key,
        label: def.label,
        type,
        required: !!def.required,
        step: Math.max(1, ...fs.map((f) => f.step)),
        ...(type === "select" && def.options?.length ? { options: def.options } : {}),
      }];
    });
  }

  const update = (i: number, patch: Partial<FormField>) =>
    setFields((fs) => fs.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));
  const remove = (i: number) => setFields((fs) => fs.filter((_, idx) => idx !== i));
  const move = (i: number, dir: -1 | 1) =>
    setFields((fs) => {
      const j = i + dir;
      if (j < 0 || j >= fs.length) return fs;
      const copy = [...fs];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });
  const add = () =>
    setFields((fs) => [...fs, { key: `field_${fs.length + 1}`, label: "New field", type: "text", required: false, step: 1 }]);

  const stepCount = Math.max(1, ...fields.map((f) => f.step));

  async function save() {
    setSaving(true);
    try {
      const res = await updateSourceFormAction(sourceId, fields);
      if (!res.ok) {
        toast({ variant: "destructive", title: "Couldn't save form", description: res.message });
        return;
      }
      setFields(res.data.fields);
      toast({ title: "Form fields saved" });
    } catch {
      toast({ variant: "destructive", title: "Couldn't save form", description: "We couldn't reach the server." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3 border-t pt-3">
      <p className="text-xs text-muted-foreground">
        Fields shown on the hosted form. <strong>Name, Email, Phone, Company</strong> fill lead
        fields; anything else is saved as a custom field. Every submission still needs an email or phone.
        Set <strong>Step</strong> to split the form into pages{stepCount > 1 ? ` (currently ${stepCount})` : ""}.
      </p>
      <div className="space-y-2">
        {fields.map((f, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2 rounded-xl border bg-muted/40 p-2">
            <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
            <Input
              className="h-8 flex-1 min-w-[120px]"
              value={f.label}
              placeholder="Field label"
              onChange={(e) => update(i, { label: e.target.value })}
            />
            <select
              className="h-8 rounded-md border bg-background px-2 text-sm"
              value={f.type}
              disabled={isStandard(f.key)}
              onChange={(e) => update(i, { type: e.target.value as FormFieldType })}
              title={isStandard(f.key) ? "Standard field type is fixed" : "Field type"}
            >
              {TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            {f.type === "select" && (
              <Input
                className="h-8 flex-1 min-w-[160px]"
                value={(f.options ?? []).join(", ")}
                placeholder="Options (comma-separated)"
                onChange={(e) => update(i, { options: e.target.value.split(",").map((o) => o.trim()).filter(Boolean) })}
              />
            )}
            <label className="flex items-center gap-1 text-xs text-muted-foreground">
              <input type="checkbox" checked={f.required} onChange={(e) => update(i, { required: e.target.checked })} />
              Required
            </label>
            <label className="flex items-center gap-1 text-xs text-muted-foreground">
              Step
              <Input
                type="number"
                min={1}
                max={MAX_STEPS}
                className="h-8 w-14"
                value={f.step}
                onChange={(e) => update(i, { step: Math.min(MAX_STEPS, Math.max(1, Math.floor(Number(e.target.value)) || 1)) })}
              />
            </label>
            <span className="text-[10px] font-mono text-muted-foreground">{isStandard(f.key) ? f.key : `custom:${f.key}`}</span>
            <div className="flex items-center gap-0.5 ml-auto">
              <Button type="button" variant="ghost" size="icon" aria-label="Move field up" className="h-7 w-7" onClick={() => move(i, -1)} disabled={i === 0}><ArrowUp className="h-3.5 w-3.5" /></Button>
              <Button type="button" variant="ghost" size="icon" aria-label="Move field down" className="h-7 w-7" onClick={() => move(i, 1)} disabled={i === fields.length - 1}><ArrowDown className="h-3.5 w-3.5" /></Button>
              <Button type="button" variant="ghost" size="icon" aria-label="Remove field" className="h-7 w-7 text-destructive" onClick={() => remove(i)}><Trash2 className="h-3.5 w-3.5" /></Button>
            </div>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" className="gap-1" onClick={add}><Plus className="h-3.5 w-3.5" /> Add field</Button>
        {customDefs.length > 0 && (
          <select
            value=""
            onChange={(e) => { const d = customDefs.find((c) => c.key === e.target.value); if (d) addFromCustomField(d); }}
            className="h-8 rounded-md border bg-background px-2 text-xs"
            title="Add a field bound to one of your custom fields"
          >
            <option value="">+ Add from custom field…</option>
            {customDefs.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
          </select>
        )}
        <Button type="button" size="sm" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save fields"}</Button>
      </div>
    </div>
  );
}
