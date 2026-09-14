"use client";

import * as React from "react";
import { Trash2, Plus, Share2, X, Mail, Bell, MessageCircle, Pencil, Send, ScrollText, CheckCircle2, XCircle, MinusCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  createDistributionRuleAction,
  updateDistributionRuleAction,
  deleteDistributionRuleAction,
  toggleDistributionRuleAction,
  testDistributionRuleAction,
  listDistributionDeliveriesAction,
} from "@/lib/actions/leadDistribution";

type Source = { id: string; name: string };
type User = { id: string; name: string };
type Channel = "email" | "in_app" | "whatsapp";
type Recipient = { channel: Channel; value: string };
type Condition = { field: string; operator: string; value: string };
type ConditionGroup = { type: "AND" | "OR"; conditions: Condition[] };
type Rule = {
  id: string;
  name: string | null;
  sourceId: string | null;
  conditions: ConditionGroup | Condition[];
  recipients: Recipient[];
  mode: string;
  skipSave: number;
  isActive: number;
};
type Delivery = { id: string; channel: string; recipient: string; status: string; error: string | null; isTest: number; createdAt: string | Date };

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
const FIELD_SUGGESTIONS = ["status", "company", "email", "phone", "score", "expectedValue", "tag", "customData."];
const CHANNELS: { v: Channel; l: string; Icon: typeof Mail }[] = [
  { v: "email", l: "Email", Icon: Mail },
  { v: "in_app", l: "In-app", Icon: Bell },
  { v: "whatsapp", l: "WhatsApp", Icon: MessageCircle },
];

const emptyForm = {
  id: null as string | null,
  name: "",
  sourceId: ANY_SOURCE,
  matchType: "AND" as "AND" | "OR",
  conditions: [] as Condition[],
  recipients: [] as Recipient[],
  mode: "all" as "all" | "round_robin",
  skipSave: false,
};

const toGroup = (c: Rule["conditions"]): ConditionGroup =>
  Array.isArray(c) ? { type: "AND", conditions: c } : c ?? { type: "AND", conditions: [] };

export function LeadDistributionManager({
  initial,
  sources,
  users,
  deliveryCounts,
}: {
  initial: Rule[];
  sources: Source[];
  users: User[];
  deliveryCounts: Record<string, number>;
}) {
  const { toast } = useToast();
  const [rules, setRules] = React.useState<Rule[]>(initial);
  const [form, setForm] = React.useState(emptyForm);
  const [chanDraft, setChanDraft] = React.useState<Channel>("email");
  const [valDraft, setValDraft] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [openLog, setOpenLog] = React.useState<string | null>(null);
  const [logs, setLogs] = React.useState<Record<string, Delivery[]>>({});
  const editing = form.id !== null;

  const sourceName = (id: string | null) => (id ? sources.find((s) => s.id === id)?.name ?? "Unknown source" : "Any source");
  const userName = (id: string) => users.find((u) => u.id === id)?.name ?? "Unknown user";
  const norm = (r: any): Recipient => (typeof r === "string" ? { channel: "email", value: r } : r);
  const recipientLabel = (r: Recipient) => (r.channel === "in_app" ? userName(r.value) : r.value);

  function addRecipient() {
    const value = valDraft.trim();
    if (!value) return;
    if (chanDraft === "email" && !isEmail(value)) {
      toast({ variant: "destructive", title: "Invalid email", description: `"${value}" isn't a valid address.` });
      return;
    }
    if (form.recipients.some((r) => r.channel === chanDraft && r.value === value)) return setValDraft("");
    setForm((f) => ({ ...f, recipients: [...f.recipients, { channel: chanDraft, value }] }));
    setValDraft("");
  }

  function edit(r: Rule) {
    const g = toGroup(r.conditions);
    setForm({
      id: r.id,
      name: r.name ?? "",
      sourceId: r.sourceId ?? ANY_SOURCE,
      matchType: g.type,
      conditions: g.conditions ?? [],
      recipients: (r.recipients ?? []).map(norm),
      mode: r.mode === "round_robin" ? "round_robin" : "all",
      skipSave: r.skipSave === 1,
    });
    setValDraft("");
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function save() {
    let recipients = form.recipients;
    const pending = valDraft.trim();
    if (pending && !(chanDraft === "email" && !isEmail(pending)) && !recipients.some((r) => r.channel === chanDraft && r.value === pending)) {
      recipients = [...recipients, { channel: chanDraft, value: pending }];
    }
    if (recipients.length === 0) {
      toast({ variant: "destructive", title: "Add a recipient", description: "Add at least one recipient to the rule." });
      return;
    }
    const payload = {
      name: form.name.trim() || null,
      sourceId: form.sourceId === ANY_SOURCE ? null : form.sourceId,
      conditions: { type: form.matchType, conditions: form.conditions.filter((c) => c.field.trim()) },
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
      setRules((prev) => (editing ? prev.map((x) => (x.id === row.id ? row : x)) : [row, ...prev]));
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

  async function test(r: Rule) {
    setBusyId(r.id);
    try {
      const res = await testDistributionRuleAction(r.id);
      if (!res.ok) {
        toast({ variant: "destructive", title: "Test failed", description: res.message });
      } else {
        toast({ title: "Test sent", description: `Delivered to ${res.data.sent} of ${res.data.total} recipient(s).` });
        if (openLog === r.id) loadLog(r.id);
      }
    } catch {
      toast({ variant: "destructive", title: "Test failed", description: "We couldn't reach the server." });
    } finally {
      setBusyId(null);
    }
  }

  async function loadLog(ruleId: string) {
    try {
      const rows = (await listDistributionDeliveriesAction(ruleId)) as Delivery[];
      setLogs((prev) => ({ ...prev, [ruleId]: rows }));
    } catch {
      toast({ variant: "destructive", title: "Couldn't load log" });
    }
  }

  function toggleLog(ruleId: string) {
    if (openLog === ruleId) return setOpenLog(null);
    setOpenLog(ruleId);
    if (!logs[ruleId]) loadLog(ruleId);
  }

  const ChannelIcon = ({ channel }: { channel: Channel }) => {
    const Icon = CHANNELS.find((c) => c.v === channel)?.Icon ?? Mail;
    return <Icon className="h-3.5 w-3.5 shrink-0" />;
  };
  const StatusIcon = ({ status }: { status: string }) =>
    status === "sent" ? <CheckCircle2 className="h-3.5 w-3.5 text-green-600 dark:text-green-400" /> :
    status === "failed" ? <XCircle className="h-3.5 w-3.5 text-destructive" /> :
    <MinusCircle className="h-3.5 w-3.5 text-muted-foreground" />;

  return (
    <div className="space-y-8">
      {/* New / edit rule form */}
      <div className="rounded-2xl border bg-card divide-y">
        {editing && <div className="px-4 py-2 text-xs font-medium text-primary bg-primary/5">Editing rule</div>}

        <div className="p-4 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Rule name</p>
          <Input placeholder="e.g. Facebook leads → sales team" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
        </div>

        {/* Criteria */}
        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">When new leads match</p>
            {form.conditions.length > 0 && (
              <Select value={form.matchType} onValueChange={(v) => setForm((f) => ({ ...f, matchType: v as "AND" | "OR" }))}>
                <SelectTrigger className="h-7 w-[130px] text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="AND">Match ALL</SelectItem>
                  <SelectItem value="OR">Match ANY</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>
          <Select value={form.sourceId} onValueChange={(v) => setForm((f) => ({ ...f, sourceId: v }))}>
            <SelectTrigger><SelectValue placeholder="Select lead source…" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY_SOURCE}>Any lead source</SelectItem>
              {sources.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>

          <datalist id="dist-fields">{FIELD_SUGGESTIONS.map((f) => <option key={f} value={f} />)}</datalist>
          {form.conditions.map((c, i) => (
            <div key={i} className="flex flex-col sm:flex-row gap-2">
              <Input list="dist-fields" placeholder="Field (status, tag, customData.plan)" value={c.field}
                onChange={(e) => setForm((f) => ({ ...f, conditions: f.conditions.map((x, j) => (j === i ? { ...x, field: e.target.value } : x)) }))} />
              <Select value={c.operator} onValueChange={(v) => setForm((f) => ({ ...f, conditions: f.conditions.map((x, j) => (j === i ? { ...x, operator: v } : x)) }))}>
                <SelectTrigger className="sm:w-[170px]"><SelectValue /></SelectTrigger>
                <SelectContent>{OPERATORS.map((o) => <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>)}</SelectContent>
              </Select>
              <Input placeholder="Value" value={c.value}
                onChange={(e) => setForm((f) => ({ ...f, conditions: f.conditions.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)) }))} />
              <Button variant="ghost" size="icon" className="shrink-0 text-destructive hover:text-destructive" onClick={() => setForm((f) => ({ ...f, conditions: f.conditions.filter((_, j) => j !== i) }))}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button variant="outline" size="sm" className="gap-1" onClick={() => setForm((f) => ({ ...f, conditions: [...f.conditions, { field: "", operator: "equals", value: "" }] }))}>
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
              <Input className="flex-1" placeholder={chanDraft === "email" ? "recipient@example.com" : "+15551234567"} value={valDraft}
                onChange={(e) => setValDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addRecipient())} />
            )}
            <Button variant="outline" onClick={addRecipient} className="gap-1 shrink-0"><Plus className="h-4 w-4" /> Add</Button>
          </div>
          {form.recipients.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {form.recipients.map((r, i) => (
                <span key={`${r.channel}-${r.value}`} className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-xs">
                  <ChannelIcon channel={r.channel} />{recipientLabel(r)}
                  <button type="button" onClick={() => setForm((f) => ({ ...f, recipients: f.recipients.filter((_, j) => j !== i) }))} aria-label="Remove recipient"><X className="h-3 w-3" /></button>
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
          <Button onClick={save} disabled={saving} className="gap-2"><Plus className="h-4 w-4" /> {saving ? "Saving…" : editing ? "Save rule" : "Create rule"}</Button>
        </div>
      </div>

      {/* Existing rules */}
      <div className="space-y-2">
        <p className="text-sm font-medium">Rules</p>
        {rules.length === 0 ? (
          <p className="text-sm text-muted-foreground">No rules yet. Create one above to forward matching new leads.</p>
        ) : (
          rules.map((r) => {
            const group = toGroup(r.conditions);
            return (
              <div key={r.id} className="rounded-xl border p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <p className="text-sm font-medium flex items-center gap-2 flex-wrap">
                      {r.name || sourceName(r.sourceId)}
                      {r.mode === "round_robin" && <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-normal">Round-robin</span>}
                      {group.conditions.length > 0 && <span className="text-xs font-normal text-muted-foreground">{group.type === "OR" ? "any" : "all"} of {group.conditions.length} criteria</span>}
                      <span className="text-[11px] text-muted-foreground">· {deliveryCounts[r.id] ?? 0} sent</span>
                    </p>
                    {r.name && <p className="text-xs text-muted-foreground">{sourceName(r.sourceId)}</p>}
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
                    <Button variant="outline" size="sm" className="gap-1" onClick={() => test(r)} disabled={busyId === r.id}>
                      <Send className="h-3.5 w-3.5" /> {busyId === r.id ? "…" : "Test"}
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => toggleLog(r.id)} aria-label="Delivery log"><ScrollText className="h-4 w-4" /></Button>
                    <Button variant="outline" size="sm" onClick={() => toggle(r)}>{r.isActive ? "Active" : "Paused"}</Button>
                    <Button variant="ghost" size="icon" onClick={() => edit(r)} aria-label="Edit rule"><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => remove(r)} aria-label="Delete rule"><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </div>

                {openLog === r.id && (
                  <div className="mt-3 border-t pt-3 space-y-1.5">
                    {!logs[r.id] ? (
                      <p className="text-xs text-muted-foreground">Loading…</p>
                    ) : logs[r.id].length === 0 ? (
                      <p className="text-xs text-muted-foreground">No deliveries yet.</p>
                    ) : (
                      logs[r.id].map((d) => (
                        <div key={d.id} className="flex items-center gap-2 text-xs">
                          <StatusIcon status={d.status} />
                          <ChannelIcon channel={d.channel as Channel} />
                          <span className="truncate">{d.channel === "in_app" ? userName(d.recipient) : d.recipient}</span>
                          {d.isTest === 1 && <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px]">test</span>}
                          <span className="ml-auto text-muted-foreground">{new Date(d.createdAt).toLocaleString()}</span>
                          {d.error && <span className="text-destructive truncate max-w-[40%]" title={d.error}>{d.error}</span>}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
        <Share2 className="h-3.5 w-3.5" /> Recipients get each matching new lead the moment it&apos;s created, with a link back to the lead.
      </p>
    </div>
  );
}
