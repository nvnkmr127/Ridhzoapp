"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { createCustomFieldAction, deleteCustomFieldAction, updateCustomFieldAction, reorderCustomFieldsAction } from "@/lib/actions/customFields";
import { Plus, Trash2, Pencil, ArrowUp, ArrowDown, Check, X } from "lucide-react";

type Field = {
  id: string;
  key: string;
  label: string;
  type: string;
  options: string[] | null;
  required: boolean;
  defaultValue?: string | null;
  disabled?: boolean;
  adminOnly?: boolean;
  showOnTable?: boolean;
  section?: string | null;
  subsection?: string | null;
};

const TYPES = ["text", "textarea", "number", "currency", "date", "datetime", "select", "multiselect", "checkbox", "url"] as const;
const HAS_OPTIONS = (t: string) => t === "select" || t === "multiselect";

export function CustomFieldsManager({ initial }: { initial: Field[] }) {
  const { toast } = useToast();
  const [fields, setFields] = React.useState<Field[]>(initial);
  const [label, setLabel] = React.useState("");
  const [type, setType] = React.useState<(typeof TYPES)[number]>("text");
  const [options, setOptions] = React.useState("");
  const [defaultValue, setDefaultValue] = React.useState("");
  const [section, setSection] = React.useState("");
  const [subsection, setSubsection] = React.useState("");
  const [required, setRequired] = React.useState(false);
  const [disabled, setDisabled] = React.useState(false);
  const [adminOnly, setAdminOnly] = React.useState(false);
  const [showOnTable, setShowOnTable] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  async function create() {
    if (!label.trim()) return;
    setSaving(true);
    try {
      const res = await createCustomFieldAction({
        label: label.trim(),
        type,
        required,
        options: HAS_OPTIONS(type) ? options.split(",").map((o) => o.trim()).filter(Boolean) : [],
        defaultValue: defaultValue.trim() || null,
        disabled, adminOnly, showOnTable,
        section: section.trim() || null,
        subsection: subsection.trim() || null,
      });
      if (!res.ok) {
        toast({ variant: "destructive", title: "Could not add field", description: res.message });
        return;
      }
      setFields((prev) => [...prev, res.data as Field]);
      setLabel(""); setOptions(""); setDefaultValue(""); setSection(""); setSubsection(""); setRequired(false); setDisabled(false); setAdminOnly(false); setShowOnTable(false); setType("text");
      toast({ title: "Field added" });
    } catch {
      toast({ variant: "destructive", title: "Could not add field", description: "We couldn't reach the server. Please try again." });
    } finally {
      setSaving(false);
    }
  }

  async function remove(f: Field) {
    if (!confirm(`Delete field "${f.label}"?`)) return;
    const prev = fields;
    setFields((p) => p.filter((x) => x.id !== f.id));
    try {
      const res = await deleteCustomFieldAction(f.id);
      if (!res.ok) {
        setFields(prev);
        toast({ variant: "destructive", title: "Could not delete", description: res.message });
      }
    } catch {
      setFields(prev);
      toast({ variant: "destructive", title: "Could not delete", description: "We couldn't reach the server. Please try again." });
    }
  }

  // Inline edit state
  const [editId, setEditId] = React.useState<string | null>(null);
  const [editLabel, setEditLabel] = React.useState("");
  const [editRequired, setEditRequired] = React.useState(false);
  const [editOptions, setEditOptions] = React.useState("");
  const [editShowOnTable, setEditShowOnTable] = React.useState(false);
  const [editAdminOnly, setEditAdminOnly] = React.useState(false);
  const [editDisabled, setEditDisabled] = React.useState(false);
  const [editSection, setEditSection] = React.useState("");
  const [editSubsection, setEditSubsection] = React.useState("");

  function startEdit(f: Field) {
    setEditId(f.id); setEditLabel(f.label); setEditRequired(f.required); setEditOptions((f.options ?? []).join(", "));
    setEditShowOnTable(!!f.showOnTable); setEditAdminOnly(!!f.adminOnly); setEditDisabled(!!f.disabled);
    setEditSection(f.section ?? ""); setEditSubsection(f.subsection ?? "");
  }

  async function saveEdit(f: Field) {
    const options = HAS_OPTIONS(f.type) ? editOptions.split(",").map((o) => o.trim()).filter(Boolean) : undefined;
    const patch = { label: editLabel.trim(), required: editRequired, showOnTable: editShowOnTable, adminOnly: editAdminOnly, disabled: editDisabled, section: editSection.trim() || null, subsection: editSubsection.trim() || null };
    const prev = fields;
    setFields((p) => p.map((x) => (x.id === f.id ? { ...x, ...patch, label: patch.label || x.label, options: options ?? x.options } : x)));
    setEditId(null);
    try {
      const res = await updateCustomFieldAction({ id: f.id, options, ...patch });
      if (!res.ok) {
        setFields(prev);
        toast({ variant: "destructive", title: "Could not update", description: res.message });
        return;
      }
      toast({ title: "Field updated" });
    } catch {
      setFields(prev);
      toast({ variant: "destructive", title: "Could not update", description: "We couldn't reach the server. Please try again." });
    }
  }

  async function move(index: number, dir: -1 | 1) {
    const j = index + dir;
    if (j < 0 || j >= fields.length) return;
    const next = [...fields];
    [next[index], next[j]] = [next[j], next[index]];
    setFields(next);
    try {
      const res = await reorderCustomFieldsAction(next.map((f) => f.id));
      if (!res.ok) toast({ variant: "destructive", title: "Could not reorder", description: res.message });
    } catch {
      toast({ variant: "destructive", title: "Could not reorder", description: "We couldn't reach the server. Please try again." });
    }
  }

  // Existing groups, offered as datalist suggestions so fields reuse the same tab/sub-tab names.
  const knownSections = React.useMemo(
    () => [...new Set(fields.map((f) => f.section).filter((s): s is string => !!s))].sort(),
    [fields],
  );
  const knownSubsections = React.useMemo(
    () => [...new Set(fields.map((f) => f.subsection).filter((s): s is string => !!s))].sort(),
    [fields],
  );

  return (
    <div className="space-y-4">
      <div className="border rounded-2xl p-6 bg-card space-y-3">
        <h3 className="font-semibold">Add a custom field</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input placeholder="Field label (e.g. Budget)" value={label} onChange={(e) => setLabel(e.target.value)} />
          <select value={type} onChange={(e) => setType(e.target.value as any)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
            {TYPES.map((t) => <option key={t} value={t} className="capitalize">{t}</option>)}
          </select>
          {HAS_OPTIONS(type) && (
            <Input placeholder="Options, comma-separated" value={options} onChange={(e) => setOptions(e.target.value)} className="sm:col-span-2" />
          )}
          {type !== "checkbox" && type !== "multiselect" && (
            <Input placeholder="Default value (optional)" value={defaultValue} onChange={(e) => setDefaultValue(e.target.value)} className="sm:col-span-2" />
          )}
          <Input list="cf-sections" placeholder="Tab / section (optional, e.g. Deal Details)" value={section} onChange={(e) => setSection(e.target.value)} />
          <Input list="cf-subsections" placeholder="Sub-tab (optional, e.g. Budget)" value={subsection} onChange={(e) => setSubsection(e.target.value)} />
          <datalist id="cf-sections">{knownSections.map((s) => <option key={s} value={s} />)}</datalist>
          <datalist id="cf-subsections">{knownSubsections.map((s) => <option key={s} value={s} />)}</datalist>
        </div>
        <p className="text-xs text-muted-foreground">Tab &amp; sub-tab group this field on the lead detail page. Leave blank to keep it under the default “Custom Attributes”.</p>
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} className="h-4 w-4" /> Required</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={showOnTable} onChange={(e) => setShowOnTable(e.target.checked)} className="h-4 w-4" /> Show on table</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={adminOnly} onChange={(e) => setAdminOnly(e.target.checked)} className="h-4 w-4" /> Admin only</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={disabled} onChange={(e) => setDisabled(e.target.checked)} className="h-4 w-4" /> Disabled</label>
        </div>
        <div className="flex justify-end">
          <Button onClick={create} disabled={saving || !label.trim()} className="gap-1">
            <Plus className="h-4 w-4" /> Add field
          </Button>
        </div>
      </div>

      <div className="border rounded-2xl bg-card divide-y">
        {fields.length === 0 && <div className="p-6 text-sm text-muted-foreground">No custom fields yet.</div>}
        {fields.map((f, i) => (
          <div key={f.id} className="flex items-center justify-between gap-3 p-4">
            {editId === f.id ? (
              <div className="flex flex-1 flex-wrap items-center gap-2">
                <Input value={editLabel} onChange={(e) => setEditLabel(e.target.value)} className="h-8 w-44" />
                {HAS_OPTIONS(f.type) && (
                  <Input value={editOptions} onChange={(e) => setEditOptions(e.target.value)} placeholder="Options, comma-separated" className="h-8 flex-1 min-w-[12rem]" />
                )}
                <Input list="cf-sections" value={editSection} onChange={(e) => setEditSection(e.target.value)} placeholder="Tab" className="h-8 w-32" />
                <Input list="cf-subsections" value={editSubsection} onChange={(e) => setEditSubsection(e.target.value)} placeholder="Sub-tab" className="h-8 w-32" />
                <label className="flex items-center gap-1.5 text-xs">
                  <input type="checkbox" checked={editRequired} onChange={(e) => setEditRequired(e.target.checked)} className="h-4 w-4" /> Required
                </label>
                <label className="flex items-center gap-1.5 text-xs">
                  <input type="checkbox" checked={editShowOnTable} onChange={(e) => setEditShowOnTable(e.target.checked)} className="h-4 w-4" /> On table
                </label>
                <label className="flex items-center gap-1.5 text-xs">
                  <input type="checkbox" checked={editAdminOnly} onChange={(e) => setEditAdminOnly(e.target.checked)} className="h-4 w-4" /> Admin only
                </label>
                <label className="flex items-center gap-1.5 text-xs">
                  <input type="checkbox" checked={editDisabled} onChange={(e) => setEditDisabled(e.target.checked)} className="h-4 w-4" /> Disabled
                </label>
              </div>
            ) : (
              <div className="flex flex-1 items-center gap-3">
                <span className="font-medium">{f.label}</span>
                <span className="text-xs font-mono text-muted-foreground">{f.key}</span>
                <Badge variant="secondary" className="capitalize">{f.type}</Badge>
                {f.section && <Badge variant="outline">{f.section}{f.subsection ? ` › ${f.subsection}` : ""}</Badge>}
                {f.required && <Badge>Required</Badge>}
                {f.showOnTable && <Badge variant="outline">On table</Badge>}
                {f.adminOnly && <Badge variant="outline">Admin only</Badge>}
                {f.disabled && <Badge variant="outline" className="opacity-60">Disabled</Badge>}
                {HAS_OPTIONS(f.type) && f.options?.length ? (
                  <span className="text-xs text-muted-foreground">{f.options.join(", ")}</span>
                ) : null}
              </div>
            )}
            <div className="flex items-center gap-0.5">
              {editId === f.id ? (
                <>
                  <Button variant="ghost" size="icon" onClick={() => saveEdit(f)} title="Save"><Check className="h-4 w-4 text-emerald-500" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => setEditId(null)} title="Cancel"><X className="h-4 w-4" /></Button>
                </>
              ) : (
                <>
                  <Button variant="ghost" size="icon" disabled={i === 0} onClick={() => move(i, -1)} title="Move up"><ArrowUp className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" disabled={i === fields.length - 1} onClick={() => move(i, 1)} title="Move down"><ArrowDown className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => startEdit(f)} title="Edit"><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => remove(f)} title="Delete"><Trash2 className="h-4 w-4 text-white" /></Button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
