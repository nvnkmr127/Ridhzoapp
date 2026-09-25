// Shared lead-condition matcher used by the automation engine and lead-distribution rules.
// Pure (no DB): evaluates a condition tree against a plain lead row. A leaf is
// { field, operator, value }; a group is { type: 'AND'|'OR', conditions: [...] }. A field of the
// form "customData.foo" reads lead.customData.foo, so custom fields are matchable too.

export type LeafCondition = { field: string; operator: string; value: unknown };
export type ConditionGroup = { type: "AND" | "OR"; conditions: Array<ConditionGroup | LeafCondition> };
export type Condition = ConditionGroup | LeafCondition;

function readField(lead: any, field: string): unknown {
  if (field.startsWith("customData.")) {
    return lead?.customData?.[field.slice("customData.".length)];
  }
  return lead?.[field];
}

const normalize = (val: unknown) => (val === null || val === undefined ? "" : String(val).toLowerCase());

export function evaluateCondition(lead: any, condition: LeafCondition): boolean {
  const leadValue = readField(lead, condition.field);
  const { operator, value } = condition;
  switch (operator) {
    case "equals":
      return normalize(leadValue) === normalize(value);
    case "not_equals":
      return normalize(leadValue) !== normalize(value);
    case "contains":
      return normalize(leadValue).includes(normalize(value));
    case "does_not_contain":
      return !normalize(leadValue).includes(normalize(value));
    case "greater_than":
      return Number(leadValue) > Number(value);
    case "less_than":
      return Number(leadValue) < Number(value);
    default:
      console.warn(`Unsupported operator: ${operator}`);
      return false;
  }
}

export function evaluateConditionGroup(lead: any, group: Condition | null | undefined): boolean {
  if (!group) return true;
  const g = group as ConditionGroup;
  if (g.type === "AND" || g.type === "OR") {
    const conditions = g.conditions ?? [];
    if (conditions.length === 0) return true;
    return g.type === "AND"
      ? conditions.every((c) => evaluateConditionGroup(lead, c))
      : conditions.some((c) => evaluateConditionGroup(lead, c));
  }
  const leaf = group as LeafCondition;
  if (leaf.field && leaf.operator) return evaluateCondition(lead, leaf);
  return true; // Fallback: empty/unknown node passes.
}
