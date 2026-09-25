"use client";

import * as React from "react";
import Link from "next/link";
import { Trash2, Plus, Share2, X, Mail, Bell, MessageCircle, Pencil, Send, ScrollText, CheckCircle2, XCircle, MinusCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
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
type CustomField = { key: string; label: string };
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
  isActive: number;
};
type Delivery = { id: string; leadId: string | null; channel: string; recipient: string; status: string; error: string | null; isTest: number; createdAt: string | Date };

const ANY_SOURCE = "__any__";
const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
const isPhone = (s: string) => /^\+[1-9]\d{7,14}$/.test(s);
const OPERATORS = [
  { v: "equals", l: "equals" },
  { v: "not_equals", l: "not equals" },
  { v: "contains", l: "contains" },
  { v: "does_not_contain", l: "does not contain" },
  { v: "greater_than", l: "greater than" },
  { v: "less_than", l: "less than" },
];
// Fields that are actually set when a lead is created (score/owner are filled in later, so they'd never match).
const BASE_FIELDS = [
  { key: "name", label: "Name" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "company", label: "Company" },
  { key: "status", label: "Status" },
  { key: "tag", label: "Tag" },
];
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
};

const toGroup = (c: Rule["conditions"]): ConditionGroup =>
  Array.isArray(c) ? { type: "AND", conditions: c } : c ?? { type: "AND", conditions: [] };
const rKey = (r: Recipient) => `${r.channel}:${r.value}`;

export function LeadDistributionManager({
  initial,
  sources,
  users,
  customFields,
  deliveryCounts,
  whatsappReady,
}: {
  initial: Rule[];
  sources: Source[];
  users: User[];
  customFields: CustomField[];
  deliveryCounts: Record<string, Record<string, number>>;
  whatsappReady: boolean;
}) {
  const { toast } = useToast();
  const [rules, setRules] = React.useState<Rule[]>(initial);
  const [form, setForm] = React.useState(emptyForm);
  const [formOpen, setFormOpen] = React.useState(initial.length === 0);
  const [chanDraft, setChanDraft] = React.useState<Channel>("email");
  const [valDraft, setValDraft] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [openLog, setOpenLog] = React.useState<string | null>(null);
  const [logs, setLogs] = React.useState<Record<string, Delivery[] | "error">>({});
  const editing = form.id !== null;

  const channels = CHANNELS.filter((c) => c.v !== "whatsapp" || whatsappReady);
  const fields = [...BASE_FIELDS, ...customFields.map((f) => ({ key: `customData.${f.key}`, label: f.label }))];
  const fieldLabel = (key: string) => fields.find((f) => f.key === key)?.label ?? key;
  const sourceName = (id: string | null) => (id ? sources.find((s) => s.id === id)?.name ?? "Unknown source" : "Any source");
  const userName = (id: string) => users.find((u) => u.id === id)?.name ?? "Removed or deactivated user";
  const norm = (r: any): Recipient => (typeof r === "string" ? { channel: "email", value: r } : r);
  const recipientLabel = (r: Recipient) => (r.channel === "in_app" ? userName(r.value) : r.value);

  // Returns an error message for a draft recipient, or null if it's valid.
  function draftError(channel: Channel, value: string) {
    if (channel === "email" && !isEmail(value)) return `"${value}" isn't a valid email address.`;
    if (channel === "whatsapp" && !isPhone(value)) return `"${value}" isn't a valid number — use international format, e.g. +919876543210.`;
    return null;
  }

  function addRecipient() {
    const value = valDraft.trim();
    if (!value) return;
    const err = draftError(chanDraft, value);
    if (err) {
      toast({ variant: "destructive", title: "Invalid recipient", description: err });
      return;
    }
    if (form.recipients.some((r) => r.channel === chanDraft && r.value === value)) return setValDraft("");
    setForm((f) => ({ ...f, recipients: [...f.recipients, { channel: chanDraft, value }] }));
    setValDraft("");
  }

  function closeForm() {
    setForm(emptyForm);
    setValDraft("");
    setFormOpen(rules.length === 0);
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
    });
    setValDraft("");
    setFormOpen(true);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function save() {
    let recipients = form.recipients;
    // A recipient typed but not yet "Add"ed is included on save — but never silently dropped.
    const pending = valDraft.trim();
    if (pending) {
      const err = draftError(chanDraft, pending);
      if (err) {
        toast({ variant: "destructive", title: "Invalid recipient", description: err });
        return;
      }
      if (!recipients.some((r) => r.channel === chanDraft && r.value === pending)) recipients = [...recipients, { channel: chanDraft, value: pending }];
    }
    if (recipients.length === 0) {
      toast({ variant: "destructive", title: "Add a recipient", description: "Add at least one person to alert." });
      return;
    }
    if (form.conditions.some((c) => c.field && !c.value.trim())) {
      toast({ variant: "destructive", title: "Missing value", description: "Every condition needs a value." });
      return;
    }
    const payload = {
      name: form.name.trim() || null,
      sourceId: form.sourceId === ANY_SOURCE ? null : form.sourceId,
      conditions: { type: form.matchType, conditions: form.conditions.filter((c) => c.field.trim()) },
      recipients,
      mode: form.mode,
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
      setFormOpen(false);
      toast({ title: editing ? "Rule saved" : "Rule created" });
    } catch {
      toast({ variant: "destructive", title: "Something went wrong", description: "We couldn't reach the server. Please try again." });
    } finally {
      setSaving(false);
    }
  }

  async function toggle(r: Rule, on: boolean) {
    const next = on ? 1 : 0;
    setRules((prev) => prev.map((x) => (x.id === r.id ? { ...x, isActive: next } : x)));
    const revert = (description: string) => {
      setRules((prev) => prev.map((x) => (x.id === r.id ? { ...x, isActive: r.isActive } : x)));
      toast({ variant: "destructive", title: "Couldn't update rule", description });
    };
    try {
      const res = await toggleDistributionRuleAction(r.id, on);
      if (!res.ok) revert(res.message);
    } catch {
      revert("We couldn't reach the server.");
    }
  }

  async function remove(r: Rule) {
    if (!confirm(`Delete "${r.name || sourceName(r.sourceId)}"? Its recipients will stop getting these alerts.`)) return;
    const prev = rules;
    setRules((p) => p.filter((x) => x.id !== r.id));
    if (form.id === r.id) closeForm();
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
        const { sent, total } = res.data;
        toast({
          variant: sent < total ? "destructive" : undefined,
          title: sent < total ? "Test partly failed" : "Test sent",
          description: `Delivered to ${sent} of ${total} recipient(s).${sent < total ? " Open the delivery log for details." : ""}`,
        });
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
      const res = await listDistributionDeliveriesAction(ruleId);
      setLogs((prev) => ({ ...prev, [ruleId]: res.ok ? (res.data as Delivery[]) : "error" }));
    } catch {
      setLogs((prev) => ({ ...prev, [ruleId]: "error" }));
    }
  }

  function toggleLog(ruleId: string) {
    if (openLog === ruleId) return setOpenLog(null);
    setOpenLog(ruleId);
    loadLog(ruleId); // always refresh: new leads may have arrived since it was last opened
  }

  const setCond = (i: number, patch: Partial<Condition>) =>
    setForm((f) => ({ ...f, conditions: f.conditions.map((x, j) => (j === i ? { ...x, ...patch } : x)) }));

  const ChannelIcon = ({ channel }: { channel: Channel }) => {
    const Icon = CHANNELS.find((c) => c.v === channel)?.Icon ?? Mail;
    return <Icon className="h-3.5 w-3.5 shrink-0" />;
  };
  const StatusIcon = ({ status }: { status: string }) =>
    status === "sent" ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-green-600 dark:text-green-400" aria-label="Sent" /> :
    status === "failed" ? <XCircle className="h-3.5 w-3.5 shrink-0 text-destructive" aria-label="Failed" /> :
    <MinusCircle className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-label="Skipped" />;

  return (
    <div className="space-y-8">
      {formOpen && (
        <div className="rounded-2xl border bg-card divide-y">
          <div className="px-4 py-2 text-xs font-medium text-primary bg-primary/5">{editing ? "Editing rule" : "New rule"}</div>

          <div className="p-4 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Rule name</p>
            <Input placeholder="e.g. Facebook leads → sales team" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </div>

          {/* Criteria */}
          <div className="p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Which new leads</p>
              {form.conditions.length > 1 && (
                <Select value={form.matchType} onValueChange={(v) => setForm((f) => ({ ...f, matchType: v as "AND" | "OR" }))}>
                  <SelectTrigger className="h-7 w-[150px] text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="AND">Match all conditions</SelectItem>
                    <SelectItem value="OR">Match any condition</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>
            <Select value={form.sourceId} onValueChange={(v) => setForm((f) => ({ ...f, sourceId: v }))}>
              <SelectTrigger aria-label="Lead source"><SelectValue placeholder="Select lead source…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY_SOURCE}>From any lead source</SelectItem>
                {sources.map((s) => <SelectItem key={s.id} value={s.id}>From {s.name}</SelectItem>)}
              </SelectContent>
            </Select>

            {form.conditions.map((c, i) => (
              <div key={i} className="flex flex-col sm:flex-row gap-2">
                <Select value={c.field} onValueChange={(v) => setCond(i, { field: v })}>
                  <SelectTrigger className="sm:w-[180px]" aria-label="Field"><SelectValue placeholder="Field…" /></SelectTrigger>
                  <SelectContent>
                    {fields.map((f) => <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>)}
                    {/* Keep a legacy/removed field selectable so editing doesn't silently change the rule. */}
                    {c.field && !fields.some((f) => f.key === c.field) && <SelectItem value={c.field}>{c.field}</SelectItem>}
                  </SelectContent>
                </Select>
                <Select value={c.operator} onValueChange={(v) => setCond(i, { operator: v })}>
                  <SelectTrigger className="sm:w-[170px]" aria-label="Operator"><SelectValue /></SelectTrigger>
                  <SelectContent>{OPERATORS.map((o) => <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>)}</SelectContent>
                </Select>
                <Input placeholder="Value" aria-label="Value" value={c.value} onChange={(e) => setCond(i, { value: e.target.value })} />
                <Button variant="ghost" size="icon" aria-label="Remove condition" className="shrink-0 text-destructive hover:text-destructive" onClick={() => setForm((f) => ({ ...f, conditions: f.conditions.filter((_, j) => j !== i) }))}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button variant="outline" size="sm" className="gap-1" onClick={() => setForm((f) => ({ ...f, conditions: [...f.conditions, { field: "", operator: "equals", value: "" }] }))}>
              <Plus className="h-3.5 w-3.5" /> Add condition
            </Button>
          </div>

          {/* Recipients */}
          <div className="p-4 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Who gets the alert</p>
            <div className="flex flex-col sm:flex-row gap-2">
              <Select value={chanDraft} onValueChange={(v) => { setChanDraft(v as Channel); setValDraft(""); }}>
                <SelectTrigger className="sm:w-[140px]" aria-label="Channel"><SelectValue /></SelectTrigger>
                <SelectContent>{channels.map((c) => <SelectItem key={c.v} value={c.v}>{c.l}</SelectItem>)}</SelectContent>
              </Select>
              {chanDraft === "in_app" ? (
                <Select value={valDraft} onValueChange={setValDraft}>
                  <SelectTrigger className="flex-1" aria-label="Team member"><SelectValue placeholder="Select team member…" /></SelectTrigger>
                  <SelectContent>{users.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}</SelectContent>
                </Select>
              ) : (
                <Input className="flex-1" aria-label="Recipient" placeholder={chanDraft === "email" ? "recipient@example.com" : "+919876543210"} value={valDraft}
                  onChange={(e) => setValDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addRecipient())} />
              )}
              <Button variant="outline" onClick={addRecipient} className="gap-1 shrink-0"><Plus className="h-4 w-4" /> Add</Button>
            </div>
            {!whatsappReady && <p className="text-xs text-muted-foreground">WhatsApp alerts become available once WhatsApp sending is set up for your workspace.</p>}
            {form.recipients.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {form.recipients.map((r, i) => (
                  <span key={rKey(r)} className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-xs">
                    <ChannelIcon channel={r.channel} />{recipientLabel(r)}
                    <button type="button" onClick={() => setForm((f) => ({ ...f, recipients: f.recipients.filter((_, j) => j !== i) }))} aria-label={`Remove ${recipientLabel(r)}`}><X className="h-3 w-3" /></button>
                  </span>
                ))}
              </div>
            )}
            <div className="pt-1">
              <p className="text-xs font-medium text-muted-foreground mb-1.5">Send to</p>
              <Select value={form.mode} onValueChange={(v) => setForm((f) => ({ ...f, mode: v as "all" | "round_robin" }))}>
                <SelectTrigger className="sm:w-[300px]" aria-label="Send to"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Everyone on the list</SelectItem>
                  <SelectItem value="round_robin">One person per lead, taking turns</SelectItem>
                </SelectContent>
              </Select>
              {form.mode === "round_robin" && (
                <p className="text-xs text-muted-foreground mt-1.5">Only the alert rotates — the lead&apos;s owner isn&apos;t changed.</p>
              )}
            </div>
          </div>

          <div className="p-4 flex justify-end gap-2">
            {(editing || rules.length > 0) && <Button variant="outline" onClick={closeForm} disabled={saving}>Cancel</Button>}
            <Button onClick={save} disabled={saving}>{saving ? "Saving…" : editing ? "Save rule" : "Create rule"}</Button>
          </div>
        </div>
      )}

      {/* Existing rules */}
      {rules.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Rules</p>
            {!formOpen && <Button size="sm" className="gap-1" onClick={() => { setForm(emptyForm); setFormOpen(true); }}><Plus className="h-4 w-4" /> Add rule</Button>}
          </div>
          {rules.map((r) => {
            const group = toGroup(r.conditions);
            const recipients = (r.recipients ?? []).map(norm);
            const counts = deliveryCounts[r.id] ?? {};
            const total = Object.values(counts).reduce((a, b) => a + b, 0);
            const log = logs[r.id];
            const deadWhatsapp = !whatsappReady && recipients.some((rc) => rc.channel === "whatsapp");
            return (
              <div key={r.id} className={`rounded-xl border p-3 ${r.isActive ? "" : "opacity-70"}`}>
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <p className="text-sm font-medium flex items-center gap-2 flex-wrap">
                      {r.name || sourceName(r.sourceId)}
                      {!r.isActive && <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-normal">Paused</span>}
                      {r.mode === "round_robin" && <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-normal">Taking turns</span>}
                      <span className="text-[11px] font-normal text-muted-foreground">· {total} alert{total === 1 ? "" : "s"} sent</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {sourceName(r.sourceId)}
                      {group.conditions.length > 0 && ` · ${group.conditions.map((c) => `${fieldLabel(c.field)} ${OPERATORS.find((o) => o.v === c.operator)?.l ?? c.operator} "${c.value}"`).join(group.type === "OR" ? " or " : " and ")}`}
                    </p>
                    <div className="flex flex-wrap gap-x-3 gap-y-1">
                      {recipients.map((rc) => (
                        <span key={rKey(rc)} className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <ChannelIcon channel={rc.channel} />{recipientLabel(rc)}
                          {r.mode === "round_robin" && <span className="tabular-nums">({counts[rKey(rc)] ?? 0})</span>}
                        </span>
                      ))}
                      {recipients.length === 0 && <span className="text-xs text-muted-foreground">No recipients</span>}
                    </div>
                    {deadWhatsapp && <p className="text-xs text-amber-600 dark:text-amber-400">WhatsApp isn&apos;t set up, so WhatsApp alerts on this rule are skipped.</p>}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Switch label={r.isActive ? "Pause rule" : "Turn rule on"} checked={!!r.isActive} onChange={(on) => toggle(r, on)} />
                    <Button variant="outline" size="sm" className="gap-1 ml-2" onClick={() => test(r)} disabled={busyId === r.id}>
                      <Send className="h-3.5 w-3.5" /> {busyId === r.id ? "Sending…" : "Send test"}
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => toggleLog(r.id)} aria-label="Delivery log" aria-expanded={openLog === r.id}><ScrollText className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => edit(r)} aria-label="Edit rule"><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => remove(r)} aria-label="Delete rule"><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </div>

                {openLog === r.id && (
                  <div className="mt-3 border-t pt-3 space-y-1.5">
                    <p className="text-xs font-medium text-muted-foreground">Last 20 deliveries</p>
                    {!log ? (
                      <p className="text-xs text-muted-foreground">Loading…</p>
                    ) : log === "error" ? (
                      <p className="text-xs text-destructive">Couldn&apos;t load the delivery log. <button className="underline" onClick={() => loadLog(r.id)}>Retry</button></p>
                    ) : log.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No alerts sent yet.</p>
                    ) : (
                      log.map((d) => (
                        <div key={d.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                          <StatusIcon status={d.status} />
                          <ChannelIcon channel={d.channel as Channel} />
                          <span className="truncate max-w-[45%]">{d.channel === "in_app" ? userName(d.recipient) : d.recipient}</span>
                          {d.isTest === 1 ? (
                            <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px]">test</span>
                          ) : d.leadId ? (
                            <Link href={`/leads/${d.leadId}`} className="text-primary hover:underline">View lead</Link>
                          ) : null}
                          <span className="ml-auto text-muted-foreground">{new Date(d.createdAt).toLocaleString()}</span>
                          {d.error && <span className="basis-full text-destructive break-words pl-6">{d.error}</span>}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
        <Share2 className="h-3.5 w-3.5 shrink-0" /> Alerts go out the moment a lead arrives from a form, integration or manual entry (not from CSV imports), with a link back to the lead.
      </p>
    </div>
  );
}
