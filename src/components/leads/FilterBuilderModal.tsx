"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { Plus, Trash2, SlidersHorizontal } from "lucide-react";
import { FilterRule, FilterGroup } from "@/domains/savedViews/service";

export type MetadataOptions = {
  users: { id: string; name: string }[];
  sources: { id: string; name: string }[];
  tags: { id: string; name: string }[];
  /** The workspace's statuses (incl. custom ones) for the Status filter. */
  statuses?: { key: string; label: string }[];
};

export const STATUS_GROUP_LABELS: Record<string, string> = {
  open: "Open (new)",
  in_progress: "In progress",
  won: "Won",
  lost: "Lost",
  unqualified: "Unqualified",
};

export const FIELD_OPTIONS = [
  { key: "status", label: "Status", type: "enum", options: ["new", "active", "won", "lost", "unqualified"] },
  // Matches every status in a group — so custom statuses ("Site visit booked") are included.
  { key: "statusCategory", label: "Status group", type: "enum", options: ["open", "in_progress", "won", "lost", "unqualified"] },
  { key: "ownerId", label: "Owner", type: "user" },
  { key: "sourceId", label: "Source", type: "source" },
  { key: "tag", label: "Tag", type: "tag" },
  { key: "priority", label: "Priority", type: "enum", options: ["low", "medium", "high"] },
  { key: "name", label: "Name", type: "string" },
  { key: "email", label: "Email", type: "string" },
  { key: "phone", label: "Phone", type: "string" },
  { key: "company", label: "Company", type: "string" },
  { key: "score", label: "Score", type: "number" },
  { key: "expectedValue", label: "Expected Value", type: "number" },
  { key: "createdAt", label: "Created Date", type: "date" },
  { key: "updatedAt", label: "Updated Date", type: "date" },
  { key: "nextFollowUpAt", label: "Follow-up Date", type: "date" },
  // Facebook/Meta ad attribution captured on ingested leads (stored in customData).
  { key: "customData.meta_campaign_name", label: "FB Campaign", type: "string" },
  { key: "customData.meta_adset_name", label: "FB Ad Set", type: "string" },
  { key: "customData.meta_ad_name", label: "FB Ad", type: "string" },
  { key: "customData.facebook_form_id", label: "FB Form ID", type: "string" },
];

const OPERATORS_BY_TYPE: Record<string, { key: string; label: string }[]> = {
  string: [
    { key: "contains", label: "contains" },
    { key: "equals", label: "equals" },
    { key: "not_equals", label: "does not equal" },
    { key: "does_not_contain", label: "does not contain" },
    { key: "is_empty", label: "is empty" },
    { key: "is_not_empty", label: "is not empty" },
  ],
  enum: [
    { key: "equals", label: "is" },
    { key: "not_equals", label: "is not" },
    { key: "is_empty", label: "is empty" },
    { key: "is_not_empty", label: "is not empty" },
  ],
  user: [
    { key: "equals", label: "is" },
    { key: "not_equals", label: "is not" },
    { key: "is_empty", label: "is unassigned" },
    { key: "is_not_empty", label: "is assigned" },
  ],
  source: [
    { key: "equals", label: "is" },
    { key: "not_equals", label: "is not" },
    { key: "is_empty", label: "is empty" },
  ],
  tag: [
    { key: "equals", label: "has tag" },
    { key: "not_equals", label: "does not have tag" },
    { key: "is_empty", label: "has no tags" },
    { key: "is_not_empty", label: "has any tag" },
  ],
  number: [
    { key: "equals", label: "equals" },
    { key: "gt", label: "greater than" },
    { key: "lt", label: "less than" },
    { key: "between", label: "between" },
    { key: "is_empty", label: "is empty" },
  ],
  date: [
    { key: "after", label: "after" },
    { key: "before", label: "before" },
    { key: "between", label: "between" },
    { key: "is_empty", label: "is empty" },
    { key: "is_not_empty", label: "is set" },
  ],
};

export function FilterBuilderModal({
  open,
  onOpenChange,
  initialFilters,
  metadata,
  onApply,
  onSaveViewTrigger,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialFilters?: FilterGroup | FilterRule[];
  metadata: MetadataOptions;
  onApply: (filters: FilterGroup) => void;
  onSaveViewTrigger?: () => void;
}) {
  const [logic, setLogic] = React.useState<"AND" | "OR">("AND");
  const [rules, setRules] = React.useState<FilterRule[]>([]);

  React.useEffect(() => {
    if (!initialFilters) {
      setRules([]);
      setLogic("AND");
      return;
    }
    if (Array.isArray(initialFilters)) {
      setRules(initialFilters);
      setLogic("AND");
    } else {
      setRules(initialFilters.rules || []);
      setLogic(initialFilters.logic || "AND");
    }
  }, [initialFilters, open]);

  function addRule() {
    setRules((r) => [...r, { field: "status", operator: "equals", value: "new" }]);
  }

  function removeRule(index: number) {
    setRules((r) => r.filter((_, i) => i !== index));
  }

  function updateRule(index: number, patch: Partial<FilterRule>) {
    setRules((r) =>
      r.map((rule, i) => {
        if (i !== index) return rule;
        const updated = { ...rule, ...patch };
        if (patch.field && patch.field !== rule.field) {
          const fieldDef = FIELD_OPTIONS.find((f) => f.key === patch.field);
          const allowedOps = OPERATORS_BY_TYPE[fieldDef?.type || "string"] || [];
          updated.operator = (allowedOps[0]?.key as any) || "equals";
          updated.value = "";
        }
        return updated;
      }),
    );
  }

  function handleApply() {
    onApply({ logic, rules });
    onOpenChange(false);
  }

  function handleClear() {
    setRules([]);
    onApply({ logic: "AND", rules: [] });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl w-[95vw] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <SlidersHorizontal className="h-5 w-5 text-muted-foreground" />
            Filter Leads
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-3">
          <div className="flex items-center justify-between bg-muted p-3 rounded-lg border">
            <span className="text-sm font-medium text-muted-foreground">Match condition logic:</span>
            <div className="flex items-center space-x-1 border rounded-md p-0.5 bg-card">
              <Button
                type="button"
                variant={logic === "AND" ? "default" : "ghost"}
                size="sm"
                className="h-7 text-xs px-3"
                onClick={() => setLogic("AND")}
              >
                Match ALL (AND)
              </Button>
              <Button
                type="button"
                variant={logic === "OR" ? "default" : "ghost"}
                size="sm"
                className="h-7 text-xs px-3"
                onClick={() => setLogic("OR")}
              >
                Match ANY (OR)
              </Button>
            </div>
          </div>

          {rules.length === 0 ? (
            <div className="py-8 text-center border border-dashed rounded-lg">
              <p className="text-sm text-muted-foreground mb-3">No filters applied.</p>
              <Button type="button" variant="outline" size="sm" onClick={addRule}>
                <Plus className="mr-2 h-4 w-4" /> Add your first filter
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {rules.map((rule, idx) => {
                const fieldDef = FIELD_OPTIONS.find((f) => f.key === rule.field) || FIELD_OPTIONS[0];
                const ops = OPERATORS_BY_TYPE[fieldDef.type] || OPERATORS_BY_TYPE.string;
                const noValueReq = rule.operator === "is_empty" || rule.operator === "is_not_empty";

                return (
                  <div
                    key={idx}
                    className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 p-3 rounded-lg border bg-muted/50"
                  >
                    <div className="w-full sm:w-40">
                      <Select
                        value={rule.field}
                        onValueChange={(val) => updateRule(idx, { field: val })}
                      >
                        <SelectTrigger className="bg-card">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {FIELD_OPTIONS.map((f) => (
                            <SelectItem key={f.key} value={f.key}>
                              {f.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="w-full sm:w-36">
                      <Select
                        value={rule.operator}
                        onValueChange={(val: any) => updateRule(idx, { operator: val })}
                      >
                        <SelectTrigger className="bg-card">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ops.map((o) => (
                            <SelectItem key={o.key} value={o.key}>
                              {o.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {!noValueReq && (
                      <div className="flex-1 min-w-[140px]">
                        {fieldDef.type === "enum" ? (
                          <Select
                            value={String(rule.value || "")}
                            onValueChange={(val) => updateRule(idx, { value: val })}
                          >
                            <SelectTrigger className="bg-card">
                              <SelectValue placeholder="Select value..." />
                            </SelectTrigger>
                            <SelectContent>
                              {fieldDef.key === "status" && metadata.statuses?.length
                                ? metadata.statuses.map((st) => (
                                    <SelectItem key={st.key} value={st.key}>
                                      {st.label}
                                    </SelectItem>
                                  ))
                                : fieldDef.options?.map((opt) => (
                                    <SelectItem key={opt} value={opt}>
                                      {STATUS_GROUP_LABELS[opt] ?? opt[0].toUpperCase() + opt.slice(1)}
                                    </SelectItem>
                                  ))}
                            </SelectContent>
                          </Select>
                        ) : fieldDef.type === "user" ? (
                          <Select
                            value={String(rule.value || "")}
                            onValueChange={(val) => updateRule(idx, { value: val })}
                          >
                            <SelectTrigger className="bg-card">
                              <SelectValue placeholder="Select user..." />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="me">Assigned to Me</SelectItem>
                              {metadata.users.map((u) => (
                                <SelectItem key={u.id} value={u.id}>
                                  {u.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : fieldDef.type === "source" ? (
                          <Select
                            value={String(rule.value || "")}
                            onValueChange={(val) => updateRule(idx, { value: val })}
                          >
                            <SelectTrigger className="bg-card">
                              <SelectValue placeholder="Select source..." />
                            </SelectTrigger>
                            <SelectContent>
                              {metadata.sources.map((s) => (
                                <SelectItem key={s.id} value={s.id}>
                                  {s.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : fieldDef.type === "tag" ? (
                          <Select
                            value={String(rule.value || "")}
                            onValueChange={(val) => updateRule(idx, { value: val })}
                          >
                            <SelectTrigger className="bg-card">
                              <SelectValue placeholder="Select tag..." />
                            </SelectTrigger>
                            <SelectContent>
                              {metadata.tags.map((t) => (
                                <SelectItem key={t.id} value={t.name}>
                                  {t.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : fieldDef.type === "date" ? (
                          <Input
                            type="date"
                            className="bg-card"
                            value={String(rule.value || "")}
                            onChange={(e) => updateRule(idx, { value: e.target.value })}
                          />
                        ) : (
                          <Input
                            type={fieldDef.type === "number" ? "number" : "text"}
                            placeholder="Enter value..."
                            className="bg-card"
                            value={String(rule.value || "")}
                            onChange={(e) => updateRule(idx, { value: e.target.value })}
                          />
                        )}
                      </div>
                    )}

                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Remove filter rule"
                      className="text-muted-foreground hover:text-foreground shrink-0"
                      onClick={() => removeRule(idx)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                );
              })}

              <Button type="button" variant="outline" size="sm" onClick={addRule} className="mt-2">
                <Plus className="mr-2 h-4 w-4" /> Add Rule
              </Button>
            </div>
          )}
        </div>

        <DialogFooter className="flex flex-col sm:flex-row gap-2 justify-between border-t pt-3">
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={handleClear} size="sm">
              Clear All
            </Button>
            {onSaveViewTrigger && (
              <Button type="button" variant="outline" onClick={onSaveViewTrigger} size="sm">
                Save as View
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} size="sm">
              Cancel
            </Button>
            <Button type="button" onClick={handleApply} size="sm">
              Apply Filters
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
