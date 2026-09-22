"use client";

import { useState, useEffect } from "react";
import { Plus, Trash2, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useRouter } from "next/navigation";
import { createAutomation, updateAutomation } from "@/lib/actions/automations";
import { listUsersAction } from "@/lib/actions/users";
import { getTenantStatusSchemaAction } from "@/lib/actions/customStatuses";
import { listTemplates } from "@/lib/actions/messaging";

// Fallback JSON hint for any action without a dedicated control (there are none today).
const ACTION_CONFIG_HINT: Record<string, string> = {
  send_whatsapp: '{"templateName": "welcome", "variables": ["{{name}}"]}',
};

const ANY_SOURCE = "__any__";
const NONE = "__none__";

type Source = { id: string; name: string };
type Seq = { id: string; name: string };
type User = { id: string; name: string };
type Status = { key: string; label: string };
type ActionRow = { type: string; configStr: string };

// Read/patch a single key inside an action row's JSON config string, so the friendly controls can
// bind to individual fields while the saved format stays the same {type, config} the engine expects.
function readCfg(configStr: string, key: string): string {
  try { const v = JSON.parse(configStr || "{}")[key]; return v == null ? "" : String(v); } catch { return ""; }
}
function patchCfg(configStr: string, patch: Record<string, unknown>): string {
  let base: Record<string, unknown> = {};
  try { base = JSON.parse(configStr || "{}"); } catch { base = {}; }
  const next = { ...base, ...patch };
  for (const k of Object.keys(next)) if (next[k] === "" || next[k] == null) delete next[k];
  return JSON.stringify(next);
}

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
  const [users, setUsers] = useState<User[]>([]);
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [templates, setTemplates] = useState<{ id: string; name: string }[]>([]);

  // Load the org's team, statuses, and WhatsApp templates so actions are pick-lists, not JSON.
  useEffect(() => {
    listUsersAction().then((u) => setUsers(u as User[])).catch(() => {});
    getTenantStatusSchemaAction().then((s) => { if (Array.isArray(s)) setStatuses(s as Status[]); }).catch(() => {});
    listTemplates("whatsapp").then((t) => setTemplates(t as { id: string; name: string }[])).catch(() => {});
  }, []);

  const setAction = (i: number, patch: Partial<ActionRow>) =>
    setActions((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const patchAction = (i: number, cfg: Record<string, unknown>) =>
    setActions((rows) => rows.map((r, idx) => (idx === i ? { ...r, configStr: patchCfg(r.configStr, cfg) } : r)));

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
            <SelectItem value="lead.updated">Lead updated</SelectItem>
            <SelectItem value="lead.assigned">Lead assigned</SelectItem>
            <SelectItem value="lead.status_changed">Lead status changed</SelectItem>
            <SelectItem value="lead.stage_changed">Lead stage changed (pipeline)</SelectItem>
            <SelectItem value="lead.tag_added">Tag added to lead</SelectItem>
            <SelectItem value="follow_up.scheduled">Follow-up scheduled</SelectItem>
            <SelectItem value="follow_up.overdue">Follow-up overdue</SelectItem>
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
                <SelectItem value="does_not_contain">Does not contain</SelectItem>
                <SelectItem value="greater_than">Greater than</SelectItem>
                <SelectItem value="less_than">Less than</SelectItem>
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

            {/* Friendly, no-JSON controls per action type. */}
            {a.type === "enroll_in_sequence" ? (
              <Select value={seqIdOf(a.configStr)} onValueChange={(v) => setAction(i, { configStr: JSON.stringify({ sequenceId: v }) })}>
                <SelectTrigger><SelectValue placeholder="Choose a sequence…" /></SelectTrigger>
                <SelectContent>
                  {sequences.length === 0 && <SelectItem value="none" disabled>No sequences yet — create one first</SelectItem>}
                  {sequences.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            ) : a.type === "assign_lead" ? (
              <Select value={readCfg(a.configStr, "userId") || NONE} onValueChange={(v) => patchAction(i, { userId: v === NONE ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="Assign to…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Choose a team member…</SelectItem>
                  {users.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                </SelectContent>
              </Select>
            ) : a.type === "change_status" ? (
              <Select value={readCfg(a.configStr, "status") || NONE} onValueChange={(v) => patchAction(i, { status: v === NONE ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="Set status to…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Choose a status…</SelectItem>
                  {statuses.map((s) => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            ) : a.type === "assign_round_robin" ? (
              <div className="space-y-1">
                <Input
                  type="number" min={1}
                  value={readCfg(a.configStr, "maxCapacity")}
                  onChange={(e) => patchAction(i, { maxCapacity: e.target.value })}
                  placeholder="Max open leads per rep (optional)"
                />
                <p className="text-xs text-muted-foreground">Balances new leads across your team. Leave blank for no cap.</p>
              </div>
            ) : a.type === "add_note" ? (
              <Input value={readCfg(a.configStr, "content")} onChange={(e) => patchAction(i, { content: e.target.value })} placeholder="Note to add to the lead…" />
            ) : (a.type === "create_task" || a.type === "schedule_follow_up") ? (
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input className="flex-1" value={readCfg(a.configStr, "title")} onChange={(e) => patchAction(i, { title: e.target.value })} placeholder={a.type === "create_task" ? "Task title (e.g. Call lead)" : "Follow-up title"} />
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">Due in</span>
                  <Input className="w-20" type="number" min={0} value={readCfg(a.configStr, "dueInDays") || "1"} onChange={(e) => patchAction(i, { dueInDays: e.target.value })} />
                  <span className="text-xs text-muted-foreground">days</span>
                </div>
              </div>
            ) : a.type === "send_whatsapp" ? (
              <Select value={readCfg(a.configStr, "templateName") || NONE} onValueChange={(v) => patchAction(i, { templateName: v === NONE ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="Choose a WhatsApp template…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Choose a template…</SelectItem>
                  {templates.length === 0 && <SelectItem value="_empty" disabled>No templates yet — add one in Settings → Templates</SelectItem>}
                  {templates.map((t) => <SelectItem key={t.id} value={t.name}>{t.name}</SelectItem>)}
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
