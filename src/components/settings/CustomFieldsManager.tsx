"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { StatusMessage, type Status } from "@/components/ui/status-message";
import { useToast } from "@/hooks/use-toast";
import {
  createCustomFieldAction, deleteCustomFieldAction, updateCustomFieldAction, reorderCustomFieldsAction, customFieldUsageAction,
} from "@/lib/actions/customFields";
import type { CustomFieldDef } from "@/components/leads/CustomFieldInputs";
import { CUSTOM_FIELD_TYPES, CUSTOM_FIELD_TYPE_LABELS, hasOptions, hasDefault, type CustomFieldType } from "@/lib/customFields/types";
import { Plus, Trash2, Pencil, ArrowUp, ArrowDown } from "lucide-react";

type Field = CustomFieldDef;
const typeLabel = (t: string) => CUSTOM_FIELD_TYPE_LABELS[t as CustomFieldType] ?? t;
const lines = (s: string) => s.split("\n").map((o) => o.trim()).filter(Boolean);

// ── Create / edit dialog ─────────────────────────────────────────────────────────────────────────
function FieldDialog({ field, fields, onClose, onSaved }: { field: Field | "new"; fields: Field[]; onClose: () => void; onSaved: (f: Field) => void }) {
  const isNew = field === "new";
  const init = isNew ? null : field;
  const [label, setLabel] = React.useState(init?.label ?? "");
  const [type, setType] = React.useState<CustomFieldType>((init?.type as CustomFieldType) ?? "text");
  const [options, setOptions] = React.useState((init?.options ?? []).join("\n"));
  const [defaultValue, setDefaultValue] = React.useState(init?.defaultValue ?? "");
  const [section, setSection] = React.useState(init?.section ?? "");
  const [subsection, setSubsection] = React.useState(init?.subsection ?? "");
  const [required, setRequired] = React.useState(init?.required ?? false);
  const [showOnTable, setShowOnTable] = React.useState(init?.showOnTable ?? false);
  const [adminOnly, setAdminOnly] = React.useState(init?.adminOnly ?? false);
  const [disabled, setDisabled] = React.useState(init?.disabled ?? false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [status, setStatus] = React.useState<Status>(null);
  const [saving, setSaving] = React.useState(false);

  const sections = [...new Set(fields.map((f) => f.section).filter((s): s is string => !!s))].sort();
  const subsections = [...new Set(fields.map((f) => f.subsection).filter((s): s is string => !!s))].sort();
  const optionList = lines(options);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus(null);
    const opts = hasOptions(type) ? optionList : [];
    const common = {
      label: label.trim(), required, showOnTable, adminOnly,
      defaultValue: hasDefault(type) ? defaultValue.trim() || null : null,
      section: section.trim() || null, subsection: subsection.trim() || null,
    };
    // Removing options: say how many leads hold them (they keep the value until someone edits it).
    if (init && hasOptions(type)) {
      const removed = (init.options ?? []).filter((o) => !opts.includes(o));
      if (removed.length) {
        const u = await customFieldUsageAction(init.id, removed);
        if (u.ok && u.data.leadsWithRemovedOptions > 0 &&
          !window.confirm(`${u.data.leadsWithRemovedOptions} lead(s) use ${removed.map((r) => `"${r}"`).join(", ")}. They'll keep that value (marked "removed") until someone changes it. Continue?`)) return;
      }
    }
    setSaving(true);
    try {
      const res = isNew
        ? await createCustomFieldAction({ ...common, type, options: opts })
        : await updateCustomFieldAction({ id: init!.id, ...common, disabled, ...(hasOptions(type) ? { options: opts } : {}) });
      if (!res.ok) {
        setErrors(res.fieldErrors ?? {});
        setStatus({ kind: "error", text: res.message });
        return;
      }
      onSaved(res.data as Field);
    } catch {
      setStatus({ kind: "error", text: "We couldn't reach the server. Please try again." });
    } finally {
      setSaving(false);
    }
  }

  // Default input matches the field's type so it can't be typed in the wrong shape.
  const defaultInput =
    type === "select" ? (
      <select id="cf-default" value={defaultValue} onChange={(e) => setDefaultValue(e.target.value)}
        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
        <option value="">— none —</option>
        {optionList.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    ) : (
      <Input id="cf-default" value={defaultValue} onChange={(e) => setDefaultValue(e.target.value)}
        type={type === "number" ? "number" : type === "date" ? "date" : type === "datetime" ? "datetime-local" : "text"}
        inputMode={type === "currency" ? "decimal" : undefined} aria-invalid={!!errors.defaultValue || undefined} />
    );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isNew ? "Add a custom field" : `Edit “${init!.label}”`}</DialogTitle>
          <DialogDescription>Shown on the lead add/edit forms and the lead page.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <StatusMessage status={status} />
          <div className="space-y-1">
            <Label htmlFor="cf-label">Label</Label>
            <Input id="cf-label" autoFocus value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Budget" aria-invalid={!!errors.label || undefined} />
            {errors.label && <p className="text-xs text-destructive">{errors.label}</p>}
          </div>
          <div className="space-y-1">
            <Label htmlFor="cf-type">Type</Label>
            <select id="cf-type" value={type} disabled={!isNew} onChange={(e) => setType(e.target.value as CustomFieldType)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm disabled:opacity-60">
              {CUSTOM_FIELD_TYPES.map((t) => <option key={t} value={t}>{typeLabel(t)}</option>)}
            </select>
            {!isNew && <p className="text-xs text-muted-foreground">The type can&apos;t be changed after the field is created, so existing values stay valid.</p>}
          </div>
          {hasOptions(type) && (
            <div className="space-y-1">
              <Label htmlFor="cf-options">Options (one per line)</Label>
              <Textarea id="cf-options" rows={4} value={options} onChange={(e) => setOptions(e.target.value)} placeholder={"Small\nMedium\nLarge"} aria-invalid={!!errors.options || undefined} />
            </div>
          )}
          {hasDefault(type) && (
            <div className="space-y-1">
              <Label htmlFor="cf-default">Default value (optional)</Label>
              {defaultInput}
              <p className="text-xs text-muted-foreground">Filled in on new leads when no value is given.</p>
            </div>
          )}

          <details className="rounded-md border px-3 py-2" open={!isNew && !!(section || subsection || required || showOnTable || adminOnly || disabled)}>
            <summary className="cursor-pointer text-sm font-medium">More options</summary>
            <div className="mt-3 space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="cf-section">Section</Label>
                  <Input id="cf-section" list="cf-sections" value={section} onChange={(e) => setSection(e.target.value)} placeholder="e.g. Deal details" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="cf-subsection">Sub-section</Label>
                  <Input id="cf-subsection" list="cf-subsections" value={subsection} onChange={(e) => setSubsection(e.target.value)} placeholder="e.g. Budget" />
                </div>
                <datalist id="cf-sections">{sections.map((s) => <option key={s} value={s} />)}</datalist>
                <datalist id="cf-subsections">{subsections.map((s) => <option key={s} value={s} />)}</datalist>
              </div>
              <p className="text-xs text-muted-foreground">Groups the field under a heading on the lead page. Leave blank for the default group.</p>
              <div className="space-y-2 text-sm">
                <label className="flex items-start gap-2"><input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} className="mt-0.5 h-4 w-4" />
                  <span>Required <span className="block text-xs text-muted-foreground">Must be filled when a lead is added. Existing leads aren&apos;t blocked.</span></span></label>
                <label className="flex items-start gap-2"><input type="checkbox" checked={showOnTable} onChange={(e) => setShowOnTable(e.target.checked)} className="mt-0.5 h-4 w-4" />
                  <span>Show as a column in the leads list</span></label>
                <label className="flex items-start gap-2"><input type="checkbox" checked={adminOnly} onChange={(e) => setAdminOnly(e.target.checked)} className="mt-0.5 h-4 w-4" />
                  <span>Admins only <span className="block text-xs text-muted-foreground">Only people who can manage settings see or edit it.</span></span></label>
                {!isNew && (
                  <label className="flex items-start gap-2"><input type="checkbox" checked={disabled} onChange={(e) => setDisabled(e.target.checked)} className="mt-0.5 h-4 w-4" />
                    <span>Hidden <span className="block text-xs text-muted-foreground">Removed from forms and no longer captured. Existing values are kept.</span></span></label>
                )}
              </div>
            </div>
          </details>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving || !label.trim()}>{saving ? "Saving…" : isNew ? "Add field" : "Save"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Delete dialog: shows what the delete touches and offers Hide instead ────────────────────────
type Usage = { key: string; leads: number; references: string[] };
function DeleteDialog({ field, onClose, onDeleted, onHidden }: { field: Field; onClose: () => void; onDeleted: () => void; onHidden: (f: Field) => void }) {
  const [usage, setUsage] = React.useState<Usage | null>(null);
  const [status, setStatus] = React.useState<Status>(null);
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => {
    customFieldUsageAction(field.id)
      .then((r) => (r.ok ? setUsage(r.data) : setStatus({ kind: "error", text: r.message })))
      .catch(() => setStatus({ kind: "error", text: "We couldn't reach the server. Please try again." }));
  }, [field.id]);

  async function act(kind: "delete" | "hide") {
    setBusy(true);
    try {
      const res = kind === "delete" ? await deleteCustomFieldAction(field.id) : await updateCustomFieldAction({ id: field.id, disabled: true });
      if (!res.ok) return setStatus({ kind: "error", text: res.message });
      if (kind === "delete") onDeleted(); else onHidden(res.data as Field);
    } catch {
      setStatus({ kind: "error", text: "We couldn't reach the server. Please try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete “{field.label}”?</DialogTitle>
          <DialogDescription>This permanently removes the field and its value from every lead.</DialogDescription>
        </DialogHeader>
        <StatusMessage status={status} />
        {!usage && !status && <p className="text-sm text-muted-foreground">Checking where it&apos;s used…</p>}
        {usage && (
          <div className="space-y-2 text-sm">
            <p><b>{usage.leads}</b> lead{usage.leads === 1 ? "" : "s"} have a value that will be deleted.</p>
            {usage.references.length > 0 && (
              <div>
                <p>These may still use it and should be updated:</p>
                <ul className="mt-1 list-disc pl-5 text-muted-foreground">{usage.references.map((r) => <li key={r}>{r}</li>)}</ul>
              </div>
            )}
            {!field.disabled && <p className="text-muted-foreground">To stop using it but keep the data, hide it instead.</p>}
          </div>
        )}
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          {!field.disabled && <Button variant="outline" disabled={busy} onClick={() => act("hide")}>Hide instead</Button>}
          <Button variant="destructive" disabled={busy || !usage} onClick={() => act("delete")}>Delete field and data</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── List ────────────────────────────────────────────────────────────────────────────────────────
export function CustomFieldsManager({ initial }: { initial: Field[] }) {
  const { toast } = useToast();
  const [fields, setFields] = React.useState<Field[]>(initial);
  const [editing, setEditing] = React.useState<Field | "new" | null>(null);
  const [deleting, setDeleting] = React.useState<Field | null>(null);
  const [reordering, setReordering] = React.useState(false);

  async function move(index: number, dir: -1 | 1) {
    const j = index + dir;
    if (reordering || j < 0 || j >= fields.length) return;
    const prev = fields;
    const next = [...fields];
    [next[index], next[j]] = [next[j], next[index]];
    setFields(next);
    setReordering(true);
    try {
      const res = await reorderCustomFieldsAction(next.map((f) => f.id));
      if (!res.ok) {
        setFields(prev);
        toast({ variant: "destructive", title: "Could not reorder", description: res.message });
      }
    } catch {
      setFields(prev);
      toast({ variant: "destructive", title: "Could not reorder", description: "We couldn't reach the server. Please try again." });
    } finally {
      setReordering(false);
    }
  }

  const replace = (f: Field) => setFields((p) => p.map((x) => (x.id === f.id ? f : x)));

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setEditing("new")} className="gap-1"><Plus className="h-4 w-4" /> Add field</Button>
      </div>

      <div className="border rounded-2xl bg-card divide-y">
        {fields.length === 0 && (
          <div className="p-6 text-sm text-muted-foreground">
            No custom fields yet. Add one to capture details like budget, location or product interest on every lead.
          </div>
        )}
        {fields.map((f, i) => (
          <div key={f.id} className={`flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between ${f.disabled ? "opacity-60" : ""}`}>
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-medium break-words">{f.label}</span>
                <span className="text-xs font-mono text-muted-foreground" title="Key used by the API, web forms, imports and exports">{f.key}</span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge variant="secondary">{typeLabel(f.type)}</Badge>
                {f.section && <Badge variant="outline">{f.section}{f.subsection ? ` › ${f.subsection}` : ""}</Badge>}
                {f.required && <Badge>Required</Badge>}
                {f.showOnTable && <Badge variant="outline">Column in list</Badge>}
                {f.adminOnly && <Badge variant="outline">Admins only</Badge>}
                {f.disabled && <Badge variant="outline">Hidden</Badge>}
                {hasOptions(f.type) && f.options?.length ? (
                  <span className="text-xs text-muted-foreground break-words">{f.options.join(", ")}</span>
                ) : null}
              </div>
            </div>
            <div className="flex items-center gap-0.5 self-end sm:self-auto">
              <Button variant="ghost" size="icon" disabled={i === 0 || reordering} onClick={() => move(i, -1)} aria-label={`Move ${f.label} up`}><ArrowUp className="h-4 w-4" /></Button>
              <Button variant="ghost" size="icon" disabled={i === fields.length - 1 || reordering} onClick={() => move(i, 1)} aria-label={`Move ${f.label} down`}><ArrowDown className="h-4 w-4" /></Button>
              <Button variant="ghost" size="icon" onClick={() => setEditing(f)} aria-label={`Edit ${f.label}`}><Pencil className="h-4 w-4" /></Button>
              <Button variant="ghost" size="icon" onClick={() => setDeleting(f)} aria-label={`Delete ${f.label}`}><Trash2 className="h-4 w-4 text-white" /></Button>
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <FieldDialog
          field={editing}
          fields={fields}
          onClose={() => setEditing(null)}
          onSaved={(f) => {
            if (editing === "new") setFields((p) => [...p, f]); else replace(f);
            toast({ title: editing === "new" ? "Field added" : "Field updated" });
            setEditing(null);
          }}
        />
      )}
      {deleting && (
        <DeleteDialog
          field={deleting}
          onClose={() => setDeleting(null)}
          onDeleted={() => { setFields((p) => p.filter((x) => x.id !== deleting.id)); toast({ title: "Field deleted" }); setDeleting(null); }}
          onHidden={(f) => { replace(f); toast({ title: "Field hidden", description: "Existing values are kept." }); setDeleting(null); }}
        />
      )}
    </div>
  );
}
