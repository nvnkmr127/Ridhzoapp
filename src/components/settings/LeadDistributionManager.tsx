"use client";

import * as React from "react";
import { Trash2, Plus, Share2, X, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  createDistributionRuleAction,
  deleteDistributionRuleAction,
  toggleDistributionRuleAction,
} from "@/lib/actions/leadDistribution";

type Source = { id: string; name: string };
type Rule = {
  id: string;
  sourceId: string | null;
  recipients: string[];
  skipSave: number;
  isActive: number;
};

const ANY_SOURCE = "__any__";
const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

export function LeadDistributionManager({ initial, sources }: { initial: Rule[]; sources: Source[] }) {
  const { toast } = useToast();
  const [rules, setRules] = React.useState<Rule[]>(initial);
  const sourceName = (id: string | null) => (id ? sources.find((s) => s.id === id)?.name ?? "Unknown source" : "Any source");

  // New-rule form state
  const [sourceId, setSourceId] = React.useState<string>(ANY_SOURCE);
  const [recipients, setRecipients] = React.useState<string[]>([]);
  const [draft, setDraft] = React.useState("");
  const [skipSave, setSkipSave] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  function addEmail(raw: string) {
    const email = raw.trim().replace(/,$/, "");
    if (!email) return;
    if (!isEmail(email)) {
      toast({ variant: "destructive", title: "Invalid email", description: `"${email}" isn't a valid address.` });
      return;
    }
    if (!recipients.includes(email)) setRecipients((prev) => [...prev, email]);
    setDraft("");
  }

  function onDraftKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addEmail(draft);
    } else if (e.key === "Backspace" && !draft && recipients.length) {
      setRecipients((prev) => prev.slice(0, -1));
    }
  }

  function resetForm() {
    setSourceId(ANY_SOURCE);
    setRecipients([]);
    setDraft("");
    setSkipSave(false);
  }

  async function create() {
    const finalRecipients = draft.trim() && isEmail(draft.trim()) ? [...recipients, draft.trim()] : recipients;
    if (finalRecipients.length === 0) {
      toast({ variant: "destructive", title: "Add a recipient", description: "Enter at least one recipient email." });
      return;
    }
    setSaving(true);
    try {
      const res = await createDistributionRuleAction({
        sourceId: sourceId === ANY_SOURCE ? null : sourceId,
        recipients: finalRecipients,
        skipSave,
      });
      if (!res.ok) {
        toast({ variant: "destructive", title: "Couldn't create rule", description: res.message });
        return;
      }
      setRules((prev) => [...prev, res.data as Rule]);
      resetForm();
      toast({ title: "Rule created", description: "Matching new leads will be forwarded to these recipients." });
    } catch {
      toast({ variant: "destructive", title: "Couldn't create rule", description: "We couldn't reach the server. Please try again." });
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
    if (!confirm(`Delete this distribution rule?`)) return;
    const prev = rules;
    setRules((p) => p.filter((x) => x.id !== r.id));
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

  return (
    <div className="space-y-8">
      {/* New rule form */}
      <div className="rounded-2xl border bg-card divide-y">
        <div className="p-4 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">When new leads match</p>
          <Select value={sourceId} onValueChange={setSourceId}>
            <SelectTrigger><SelectValue placeholder="Select lead source…" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY_SOURCE}>Any lead source</SelectItem>
              {sources.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="p-4 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Distribution settings</p>
          <p className="text-sm text-muted-foreground">Add recipients below to share these leads with them.</p>
          <div className="flex flex-wrap items-center gap-2 rounded-md border px-2 py-2 min-h-[42px]">
            {recipients.map((email) => (
              <span key={email} className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-xs">
                {email}
                <button type="button" onClick={() => setRecipients((prev) => prev.filter((x) => x !== email))} aria-label={`Remove ${email}`}>
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            <input
              className="flex-1 min-w-[160px] bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              placeholder="Type lead recipient emails…"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onDraftKey}
              onBlur={() => draft && addEmail(draft)}
            />
          </div>
        </div>

        <div className="p-4 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">My account settings</p>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4 rounded border-input" checked={skipSave} onChange={(e) => setSkipSave(e.target.checked)} />
            Don&apos;t save leads matching this rule into my account
          </label>
          <p className="text-xs text-muted-foreground">
            By default all matching leads are saved into your account. Check this to forward them only.
          </p>
        </div>

        <div className="p-4 flex justify-end gap-2">
          <Button variant="outline" onClick={resetForm} disabled={saving}>Clear</Button>
          <Button onClick={create} disabled={saving} className="gap-2">
            <Plus className="h-4 w-4" /> {saving ? "Creating…" : "Create rule"}
          </Button>
        </div>
      </div>

      {/* Existing rules */}
      <div className="space-y-2">
        <p className="text-sm font-medium">Active rules</p>
        {rules.length === 0 ? (
          <p className="text-sm text-muted-foreground">No rules yet. Create one above to forward matching new leads.</p>
        ) : (
          rules.map((r) => (
            <div key={r.id} className="rounded-xl border p-3 flex items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <p className="text-sm font-medium">{sourceName(r.sourceId)}</p>
                <p className="text-xs text-muted-foreground flex items-center gap-1.5 flex-wrap">
                  <Mail className="h-3.5 w-3.5 shrink-0" />
                  {(r.recipients ?? []).join(", ") || "no recipients"}
                </p>
                {r.skipSave === 1 && <p className="text-xs text-amber-600 dark:text-amber-400">Forward only — not saved to account</p>}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button variant="outline" size="sm" onClick={() => toggle(r)}>{r.isActive ? "Active" : "Paused"}</Button>
                <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => remove(r)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))
        )}
      </div>

      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
        <Share2 className="h-3.5 w-3.5" />
        Recipients get a copy of each matching new lead the moment it&apos;s created, with a link back to the lead.
      </p>
    </div>
  );
}
