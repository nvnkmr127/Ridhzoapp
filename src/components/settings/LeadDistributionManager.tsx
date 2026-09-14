"use client";

import * as React from "react";
import { Trash2, Plus, Share2, X, Mail, Bell, MessageCircle, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  createDistributionRuleAction,
  updateDistributionRuleAction,
  deleteDistributionRuleAction,
  toggleDistributionRuleAction,
} from "@/lib/actions/leadDistribution";

type Source = { id: string; name: string };
type User = { id: string; name: string };
type Channel = "email" | "in_app" | "whatsapp";
type Recipient = { channel: Channel; value: string };
type Condition = { field: string; operator: string; value: string };
type Rule = {
  id: string;
  sourceId: string | null;
  conditions: Condition[];
  recipients: Recipient[];
  mode: string;
  skipSave: number;
  isActive: number;
};

const ANY_SOURCE = "__any__";
const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
const OPERATORS = [
  { v: "equals", l: "equals" },
  { v: "not_equals", l: "not equals" },
  { v: "contains", l: "contains" },
  { v: "does_not_contain", l: "does not contain" },
  { v: "greater_than", l: "greater than" },
  { v: "less_than", l: "less than" },
];
const CHANNELS: { v: Channel; l: string; Icon: typeof Mail }[] = [
  { v: "email", l: "Email", Icon: Mail },
  { v: "in_app", l: "In-app", Icon: Bell },
  { v: "whatsapp", l: "WhatsApp", Icon: MessageCircle },
];

const emptyForm = { id: null as string | null, sourceId: ANY_SOURCE, conditions: [] as Condition[], recipients: [] as Recipient[], mode: "all" as "all" | "round_robin", skipSave: false };

export function LeadDistributionManager({ initial, sources, users }: { initial: Rule[]; sources: Source[]; users: User[] }) {
  const { toast } = useToast();
  const [rules, setRules] = React.useState<Rule[]>(initial);
  const [form, setForm] = React.useState(emptyForm);
  const [chanDraft, setChanDraft] = React.useState<Channel>("email");
  const [valDraft, setValDraft] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const editing = form.id !== null;

  const sourceName = (id: string | null) => (id ? sources.find((s) => s.id === id)?.name ?? "Unknown source" : "Any source");
  const userName = (id: string) => users.find((u) => u.id === id)?.name ?? "Unknown user";
  // Tolerate legacy rows where a recipient was a bare email string, not { channel, value }.
  const norm = (r: any): Recipient => (typeof r === "string" ? { channel: "email", value: r } : r);
  const recipientLabel = (r: Recipient) => (r.channel === "in_app" ? userName(r.value) : r.value);

  function addRecipient() {
    const value = valDraft.trim();
    if (!value) return;
    if (chanDraft === "email" && !isEmail(value)) {
      toast({ variant: "destructive", title: "Invalid email", description: `"${value}" isn't a valid address.` });
      return;
    }
    if (form.recipients.some((r) => r.channel === chanDraft && r.value === value)) {
      setValDraft("");
      return;
    }
    setForm((f) => ({ ...f, recipients: [...f.recipients, { channel: chanDraft, value }] }));
    setValDraft("");
  }

  function edit(r: Rule) {
    setForm({
      id: r.id,
      sourceId: r.sourceId ?? ANY_SOURCE,
      conditions: r.conditions ?? [],
      recipients: (r.recipients ?? []).map(norm),
      mode: r.mode === "round_robin" ? "round_robin" : "all",
      skipSave: r.skipSave === 1,
    });
    setValDraft("");
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function save() {
    // Fold a half-typed recipient in so users don't lose it by forgetting to press Add.
    let recipients = form.recipients;
    const pending = valDraft.trim();
    if (pending && !(chanDraft === "email" && !isEmail(pending))) {
      if (!recipients.some((r) => r.channel === chanDraft && r.value === pending)) {
        recipients = [...recipients, { channel: chanDraft, value: pending }];
      }
    }
    if (recipients.length === 0) {
      toast({ variant: "destructive", title: "Add a recipient", description: "Add at least one recipient to the rule." });
      return;
    }
    const payload = {
      sourceId: form.sourceId === ANY_SOURCE ? null : form.sourceId,
      conditions: form.conditions.filter((c) => c.field.trim()),
      recipients,
      mode: form.mode,
      skipSave: form.skipSave,
    };
    setSaving(true);
    try {
      const res = editing ? await updateDistributionRuleAction(form.id!, payload) : await createDistributionRuleAction(payload);
      if (!res.ok) {
        toast({ variant: "destructive", title: editing ? "Couldn't save rule" : "Couldn't create rule", description: res.message });
        return;
      }
      const row = res.data as Rule;
      setRules((prev) => (editing ? prev.map((x) => (x.id === row.id ? row : x)) : [...prev, row]));
      setForm(emptyForm);
      setValDraft("");
      toast({ title: editing ? "Rule saved" : "Rule created" });
    } catch {
      toast({ variant: "destructive", title: "Something went wrong", description: "We couldn't reach the server. Please try again." });
    } finally {
      setSaving(false);
    }
  }

  async function toggle(r: Rule) {
    const next = r.isActive ? 0 : 1;
    setRules((prev) => prev.map((x) => (x.id === r.id ? { ...x, isActive: next } : x)));
    try {
      const res = await toggleDistributionRuleAction(r.id, next === 1);
      if (!res.ok) {
        setRules((prev) => prev.map((x) => (x.id === r.id ? { ...x, isActive: r.isActive } : x)));
        toast({ variant: "destructive", title: "Couldn't update rule", description: res.message });
      }
    } catch {
      setRules((prev) => prev.map((x) => (x.id === r.id ? { ...x, isActive: r.isActive } : x)));
      toast({ variant: "destructive", title: "Couldn't update rule", description: "We couldn't reach the server." });
    }
  }

  async function remove(r: Rule) {
    if (!confirm("Delete this distribution rule?")) return;
    const prev = rules;
    setRules((p) => p.filter((x) => x.id !== r.id));
    if (form.id === r.id) setForm(emptyForm);
    try {
      const res = await deleteDistributionRuleAction(r.id);
      if (!res.ok) {
        setRules(prev);
        toast({ variant: "destructive", title: "Couldn't delete", description: res.message });
      }
    } catch {
      setRules(prev);
      toast({ variant: "destructive", title: "Couldn't delete", description: "We couldn't reach the server." });
    }
  }

  const ChannelIcon = ({ channel }: { channel: Channel }) => {
    const Icon = CHANNELS.find((c) => c.v === channel)?.Icon ?? Mail;
    return <Icon className="h-3.5 w-3.5 shrink-0" />;
  };

  return (
    <div className="space-y-8">
      {/* New / edit rule form */}
      <div className="rounded-2xl border bg-card divide-y">
        {editing && (
          <div className="px-4 py-2 text-xs font-medium text-primary bg-primary/5">Editing rule</div>
        )}

        {/* Criteria */}
        <div className="p-4 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">When new leads match</p>
          <Select value={form.sourceId} onValueChange={(v) => setForm((f) => ({ ...f, sourceId: v }))}>
            <SelectTrigger><SelectValue placeholder="Select lead source…" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY_SOURCE}>Any lead source</SelectItem>
              {sources.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>

          {form.conditions.map((c, i) => (
            <div key={i} className="flex flex-col sm:flex-row gap-2">
              <Input
                placeholder="Field (e.g. status, company, customData.plan)"
                value={c.field}
                onChange={(e) => setForm((f) => ({ ...f, conditions: f.conditions.map((x, j) => (j === i ? { ...x, field: e.target.value } : x)) }))}
              />
              <Select value={c.operator} onValueChange={(v) => setForm((f) => ({ ...f, conditions: f.conditions.map((x, j) => (j === i ? { ...x, operator: v } : x)) }))}>
                <SelectTrigger className="sm:w-[170px]"><SelectValue /></SelectTrigger>
                <SelectContent>{OPERATORS.map((o) => <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>)}</SelectContent>
              </Select>
              <Input
                placeholder="Value"
                value={c.value}
                onChange={(e) => setForm((f) => ({ ...f, conditions: f.conditions.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)) }))}
              />
              <Button variant="ghost" size="icon" className="shrink-0 text-destructive hover:text-destructive" onClick={() => setForm((f) => ({ ...f, conditions: f.conditions.filter((_, j) => j !== i) }))}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            className="gap-1"
            onClick={() => setForm((f) => ({ ...f, conditions: [...f.conditions, { field: "", operator: "equals", value: "" }] }))}
          >
            <Plus className="h-3.5 w-3.5" /> Add criterion
          </Button>
        </div>

        {/* Recipients */}
        <div className="p-4 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Distribution settings</p>
          <p className="text-sm text-muted-foreground">Add recipients below to share these leads with them.</p>
          <div className="flex flex-col sm:flex-row gap-2">
            <Select value={chanDraft} onValueChange={(v) => { setChanDraft(v as Channel); setValDraft(""); }}>
              <SelectTrigger className="sm:w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>{CHANNELS.map((c) => <SelectItem key={c.v} value={c.v}>{c.l}</SelectItem>)}</SelectContent>
            </Select>
            {chanDraft === "in_app" ? (
              <Select value={valDraft} onValueChange={setValDraft}>
                <SelectTrigger className="flex-1"><SelectValue placeholder="Select team member…" /></SelectTrigger>
                <SelectContent>{users.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}</SelectContent>
              </Select>
            ) : (
              <Input
                className="flex-1"
                placeholder={chanDraft === "email" ? "recipient@example.com" : "+15551234567"}
                value={valDraft}
                onChange={(e) => setValDraft(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addRecipient())}
              />
            )}
            <Button variant="outline" onClick={addRecipient} className="gap-1 shrink-0"><Plus className="h-4 w-4" /> Add</Button>
          </div>
          {form.recipients.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {form.recipients.map((r, i) => (
                <span key={`${r.channel}-${r.value}`} className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-xs">
                  <ChannelIcon channel={r.channel} />
                  {recipientLabel(r)}
                  <button type="button" onClick={() => setForm((f) => ({ ...f, recipients: f.recipients.filter((_, j) => j !== i) }))} aria-label="Remove recipient">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="pt-1">
            <p className="text-xs font-medium text-muted-foreground mb-1.5">Distribution mode</p>
            <Select value={form.mode} onValueChange={(v) => setForm((f) => ({ ...f, mode: v as "all" | "round_robin" }))}>
              <SelectTrigger className="sm:w-[260px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Send to all recipients</SelectItem>
                <SelectItem value="round_robin">Round-robin (one recipient per lead)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Account settings */}
        <div className="p-4 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">My account settings</p>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4 rounded border-input" checked={form.skipSave} onChange={(e) => setForm((f) => ({ ...f, skipSave: e.target.checked }))} />
            Don&apos;t save leads matching this rule into my account
          </label>
          <p className="text-xs text-muted-foreground">By default all matching leads are saved into your account. Check this to forward them only.</p>
        </div>

        <div className="p-4 flex justify-end gap-2">
          <Button variant="outline" onClick={() => { setForm(emptyForm); setValDraft(""); }} disabled={saving}>{editing ? "Cancel" : "Clear"}</Button>
          <Button onClick={save} disabled={saving} className="gap-2">
            <Plus className="h-4 w-4" /> {saving ? "Saving…" : editing ? "Save rule" : "Create rule"}
          </Button>
        </div>
      </div>

      {/* Existing rules */}
      <div className="space-y-2">
        <p className="text-sm font-medium">Rules</p>
        {rules.length === 0 ? (
          <p className="text-sm text-muted-foreground">No rules yet. Create one above to forward matching new leads.</p>
        ) : (
          rules.map((r) => (
            <div key={r.id} className="rounded-xl border p-3 flex items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <p className="text-sm font-medium flex items-center gap-2 flex-wrap">
                  {sourceName(r.sourceId)}
                  {r.mode === "round_robin" && <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-normal">Round-robin</span>}
                  {(r.conditions?.length ?? 0) > 0 && <span className="text-xs font-normal text-muted-foreground">+{r.conditions.length} criteria</span>}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {(r.recipients ?? []).map(norm).map((rc) => (
                    <span key={`${rc.channel}-${rc.value}`} className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <ChannelIcon channel={rc.channel} />{recipientLabel(rc)}
                    </span>
                  ))}
                  {(r.recipients?.length ?? 0) === 0 && <span className="text-xs text-muted-foreground">no recipients</span>}
                </div>
                {r.skipSave === 1 && <p className="text-xs text-amber-600 dark:text-amber-400">Forward only — not saved to account</p>}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button variant="outline" size="sm" onClick={() => toggle(r)}>{r.isActive ? "Active" : "Paused"}</Button>
                <Button variant="ghost" size="icon" onClick={() => edit(r)} aria-label="Edit rule"><Pencil className="h-4 w-4" /></Button>
                <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => remove(r)} aria-label="Delete rule"><Trash2 className="h-4 w-4" /></Button>
              </div>
            </div>
          ))
        )}
      </div>

      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
        <Share2 className="h-3.5 w-3.5" />
        Recipients get each matching new lead the moment it&apos;s created, with a link back to the lead.
      </p>
    </div>
  );
}
