"use client";

import { useState } from "react";
import { Plus, Trash2, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useRouter } from "next/navigation";
import { createAutomation, updateAutomation } from "@/lib/actions/automations";

// Per-action JSON hints so users know the shape each action's config expects.
const ACTION_CONFIG_HINT: Record<string, string> = {
  assign_lead: '{"userId": "..."}',
  assign_round_robin: '{} (optional {"maxCapacity": 25})',
  change_status: '{"status": "contacted"}',
  add_note: '{"content": "Reach out today"}',
  create_task: '{"title": "Call lead", "dueInDays": 1}',
  schedule_follow_up: '{"title": "First follow-up", "dueInDays": 1}',
  send_whatsapp: '{"templateName": "welcome", "variables": ["{{name}}"]}',
  enroll_in_sequence: '{"sequenceId": "..."}',
};

const ANY_SOURCE = "__any__";

type Source = { id: string; name: string };
type Seq = { id: string; name: string };
type ActionRow = { type: string; configStr: string };

// Conditions may arrive as a single leaf {field,operator,value} or an AND group {type,conditions}.
function parseConditions(c: any): { source: string; advField: string; advOp: string; advVal: string } {
  const leaves: any[] = c ? (Array.isArray(c.conditions) ? c.conditions : c.field ? [c] : []) : [];
  const src = leaves.find((l) => l.field === "sourceId");
  const adv = leaves.find((l) => l.field !== "sourceId");
  return { source: src?.value ?? "", advField: adv?.field ?? "", advOp: adv?.operator ?? "equals", advVal: adv?.value ?? "" };
}

export function AutomationBuilder({
  initialData = null,
  automationId,
  sources = [],
  sequences = [],
}: {
  initialData?: any;
  automationId?: string;
  sources?: Source[];
  sequences?: Seq[];
}) {
  const router = useRouter();
  const initCond = parseConditions(initialData?.conditions);
  const [name, setName] = useState(initialData?.name || "");
  const [trigger, setTrigger] = useState(initialData?.trigger?.type || "lead.created");
  const [source, setSource] = useState<string>(initCond.source || ANY_SOURCE);
  const [advField, setAdvField] = useState(initCond.advField);
  const [advOp, setAdvOp] = useState(initCond.advOp);
  const [advVal, setAdvVal] = useState(initCond.advVal);
  const [actions, setActions] = useState<ActionRow[]>(
    initialData?.actions?.length
      ? initialData.actions.map((a: any) => ({ type: a.type, configStr: JSON.stringify(a.config ?? {}) }))
      : [{ type: "assign_lead", configStr: "" }],
  );
  const [loading, setLoading] = useState(false);

  const setAction = (i: number, patch: Partial<ActionRow>) =>
    setActions((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const seqIdOf = (configStr: string) => {
    try { return JSON.parse(configStr || "{}").sequenceId ?? ""; } catch { return ""; }
  };

  const handleSave = async () => {
    // Parse each action's JSON config up front for a clear error instead of a generic failure.
    const parsedActions: { type: string; config: Record<string, unknown> }[] = [];
    for (const a of actions) {
      let config: Record<string, unknown>;
      try {
        config = a.configStr.trim() ? JSON.parse(a.configStr) : {};
      } catch {
        alert(`Config for "${a.type}" must be valid JSON (e.g. ${ACTION_CONFIG_HINT[a.type] ?? "{}"}), or blank.`);
        return;
      }
      parsedActions.push({ type: a.type, config });
    }

    // Build the condition set: source dropdown + optional advanced field, combined with AND.
    const leaves: any[] = [];
    if (source && source !== ANY_SOURCE) leaves.push({ field: "sourceId", operator: "equals", value: source });
    if (advField.trim()) leaves.push({ field: advField.trim(), operator: advOp, value: advVal });
    const conditions = leaves.length === 0 ? null : leaves.length === 1 ? leaves[0] : { type: "AND", conditions: leaves };

    setLoading(true);
    try {
      const data = {
        name,
        isActive: initialData?.isActive ?? true,
        trigger: { type: trigger, config: {} },
        conditions,
        actions: parsedActions,
      };
      const res = automationId ? await updateAutomation(automationId, data) : await createAutomation(data);
      if (!res.ok) { alert(res.message); return; }
      router.push("/automations");
    } catch (e) {
      console.error(e);
      alert("We couldn't reach the server. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="space-y-2">
        <Label>Automation Name</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., Facebook leads → welcome + nurture" />
      </div>

      {/* WHEN */}
      <div className="border p-4 rounded-2xl space-y-3">
        <h3 className="font-semibold">When (trigger)</h3>
        <Select value={trigger} onValueChange={setTrigger}>
          <SelectTrigger><SelectValue placeholder="Select trigger" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="lead.created">Lead created</SelectItem>
            <SelectItem value="lead.assigned">Lead assigned</SelectItem>
            <SelectItem value="lead.status_changed">Lead status changed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* IF */}
      <div className="border p-4 rounded-2xl space-y-3">
        <h3 className="font-semibold">If (conditions) — optional</h3>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Lead source</Label>
          <Select value={source} onValueChange={setSource}>
            <SelectTrigger><SelectValue placeholder="Any source" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY_SOURCE}>Any source</SelectItem>
              {sources.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Advanced field match — optional</Label>
          <div className="flex flex-col sm:flex-row gap-2">
            <Input placeholder="Field (e.g. status, company)" value={advField} onChange={(e) => setAdvField(e.target.value)} />
            <Select value={advOp} onValueChange={setAdvOp}>
              <SelectTrigger className="sm:w-[150px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="equals">Equals</SelectItem>
                <SelectItem value="not_equals">Not equals</SelectItem>
                <SelectItem value="contains">Contains</SelectItem>
              </SelectContent>
            </Select>
            <Input placeholder="Value" value={advVal} onChange={(e) => setAdvVal(e.target.value)} />
          </div>
        </div>
      </div>

      {/* THEN */}
      <div className="border p-4 rounded-2xl space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Then (actions)</h3>
          <span className="text-xs text-muted-foreground">Runs in order</span>
        </div>
        {actions.map((a, i) => (
          <div key={i} className="rounded-xl border p-3 space-y-2">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-medium tabular-nums shrink-0">{i + 1}</span>
              <Select value={a.type} onValueChange={(v) => setAction(i, { type: v, configStr: "" })}>
                <SelectTrigger><SelectValue placeholder="Select action" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="assign_lead">Assign lead (to a person)</SelectItem>
                  <SelectItem value="assign_round_robin">Assign round-robin (balance across team)</SelectItem>
                  <SelectItem value="change_status">Change status</SelectItem>
                  <SelectItem value="add_note">Add note</SelectItem>
                  <SelectItem value="create_task">Create task</SelectItem>
                  <SelectItem value="schedule_follow_up">Schedule follow-up</SelectItem>
                  <SelectItem value="send_whatsapp">Send WhatsApp</SelectItem>
                  <SelectItem value="enroll_in_sequence">Enroll in sequence</SelectItem>
                </SelectContent>
              </Select>
              {actions.length > 1 && (
                <Button type="button" variant="ghost" size="icon" aria-label="Remove action" className="shrink-0 text-muted-foreground hover:text-destructive" onClick={() => setActions((r) => r.filter((_, idx) => idx !== i))}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>

            {/* enroll_in_sequence gets a friendly dropdown; other actions take JSON config. */}
            {a.type === "enroll_in_sequence" ? (
              <Select value={seqIdOf(a.configStr)} onValueChange={(v) => setAction(i, { configStr: JSON.stringify({ sequenceId: v }) })}>
                <SelectTrigger><SelectValue placeholder="Choose a sequence…" /></SelectTrigger>
                <SelectContent>
                  {sequences.length === 0 && <SelectItem value="none" disabled>No sequences yet — create one first</SelectItem>}
                  {sequences.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            ) : (
              <div>
                <Input value={a.configStr} onChange={(e) => setAction(i, { configStr: e.target.value })} placeholder={ACTION_CONFIG_HINT[a.type] ?? "{}"} />
                {ACTION_CONFIG_HINT[a.type] && <p className="text-xs text-muted-foreground mt-1">Config: {ACTION_CONFIG_HINT[a.type]}</p>}
              </div>
            )}

            {a.type === "send_whatsapp" && (
              <p className="text-xs text-amber-600 dark:text-amber-400 flex items-start gap-1.5">
                <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                Automated WhatsApp needs the WhatsApp Business API. In personal mode it&apos;s logged as a manual reminder instead.
              </p>
            )}
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" className="gap-1" onClick={() => setActions((r) => [...r, { type: "add_note", configStr: "" }])}>
          <Plus className="h-4 w-4" /> Add action
        </Button>
      </div>

      <Button onClick={handleSave} disabled={loading || !name}>Save automation</Button>
    </div>
  );
}
