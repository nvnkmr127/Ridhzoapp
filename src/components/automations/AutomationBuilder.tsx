"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useRouter } from "next/navigation";
import { createAutomation, updateAutomation } from "@/lib/actions/automations";

// Per-action JSON hints so users know the shape each action's config expects.
const ACTION_CONFIG_HINT: Record<string, string> = {
  assign_lead: '{"userId": "..."}',
  change_status: '{"status": "contacted"}',
  add_note: '{"content": "Reach out today"}',
  create_task: '{"title": "Call lead", "dueAt": "2026-01-01T09:00:00Z"}',
  schedule_follow_up: '{"title": "First follow-up", "dueAt": "2026-01-01T09:00:00Z"}',
  send_whatsapp: '{"templateName": "welcome", "variables": ["{{name}}"]}',
};

export function AutomationBuilder({ initialData = null, automationId }: { initialData?: any; automationId?: string }) {
  const router = useRouter();
  const [name, setName] = useState(initialData?.name || "");
  const [trigger, setTrigger] = useState(initialData?.trigger?.type || "lead.created");
  const [conditionField, setConditionField] = useState(initialData?.conditions?.field || "");
  const [conditionOp, setConditionOp] = useState(initialData?.conditions?.operator || "equals");
  const [conditionVal, setConditionVal] = useState(initialData?.conditions?.value || "");
  const [actionType, setActionType] = useState(initialData?.actions?.[0]?.type || "assign_lead");
  const [actionConfigStr, setActionConfigStr] = useState(JSON.stringify(initialData?.actions?.[0]?.config || {}));
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    // The action config is free-form JSON; parse it up front so a typo shows a clear message
    // instead of the generic "couldn't reach the server" catch below. Empty = no config ({}).
    let actionConfig: Record<string, unknown>;
    try {
      actionConfig = actionConfigStr.trim() ? JSON.parse(actionConfigStr) : {};
    } catch {
      alert('Action Config must be valid JSON, e.g. {"userId": "..."} — or leave it blank.');
      return;
    }

    setLoading(true);
    try {
      const data = {
        name,
        isActive: initialData?.isActive ?? true,
        trigger: { type: trigger, config: {} },
        conditions: conditionField ? { field: conditionField, operator: conditionOp, value: conditionVal } : null,
        actions: [{ type: actionType, config: actionConfig }],
      };

      const res = automationId ? await updateAutomation(automationId, data) : await createAutomation(data);
      if (!res.ok) {
        alert(res.message);
        return;
      }
      router.push("/automations");
    } catch (e) {
      console.error(e);
      alert("We couldn't reach the server. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8 max-w-2xl">
      <div className="space-y-2">
        <Label>Automation Name</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., Assign Facebook Leads" />
      </div>

      <div className="border p-4 rounded-md space-y-4">
        <h3 className="font-semibold text-lg">WHEN (Trigger)</h3>
        <Select value={trigger} onValueChange={setTrigger}>
          <SelectTrigger><SelectValue placeholder="Select Trigger" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="lead.created">Lead Created</SelectItem>
            <SelectItem value="lead.assigned">Lead Assigned</SelectItem>
            <SelectItem value="lead.status_changed">Lead Status Changed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="border p-4 rounded-md space-y-4">
        <h3 className="font-semibold text-lg">IF (Condition) - Optional</h3>
        <div className="flex gap-2">
          <Input placeholder="Field (e.g. source)" value={conditionField} onChange={(e) => setConditionField(e.target.value)} />
          <Select value={conditionOp} onValueChange={setConditionOp}>
            <SelectTrigger className="w-[150px]"><SelectValue placeholder="Operator" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="equals">Equals</SelectItem>
              <SelectItem value="not_equals">Not Equals</SelectItem>
              <SelectItem value="contains">Contains</SelectItem>
            </SelectContent>
          </Select>
          <Input placeholder="Value" value={conditionVal} onChange={(e) => setConditionVal(e.target.value)} />
        </div>
      </div>

      <div className="border p-4 rounded-md space-y-4">
        <h3 className="font-semibold text-lg">THEN (Action)</h3>
        <Select value={actionType} onValueChange={setActionType}>
          <SelectTrigger><SelectValue placeholder="Select Action" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="assign_lead">Assign Lead</SelectItem>
            <SelectItem value="change_status">Change Status</SelectItem>
            <SelectItem value="add_note">Add Note</SelectItem>
            <SelectItem value="create_task">Create Task</SelectItem>
            <SelectItem value="schedule_follow_up">Schedule Follow-up</SelectItem>
            <SelectItem value="send_whatsapp">Send WhatsApp</SelectItem>
          </SelectContent>
        </Select>
        <div>
          <Label>Action Config (JSON)</Label>
          <Input value={actionConfigStr} onChange={(e) => setActionConfigStr(e.target.value)} placeholder={ACTION_CONFIG_HINT[actionType] ?? "{}"} />
          {ACTION_CONFIG_HINT[actionType] && (
            <p className="text-xs text-muted-foreground mt-1">Example: {ACTION_CONFIG_HINT[actionType]}</p>
          )}
        </div>
      </div>

      <Button onClick={handleSave} disabled={loading || !name}>Save Automation</Button>
    </div>
  );
}
