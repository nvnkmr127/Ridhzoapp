// The golden set: hand-authored model replies plus what a correct parser must do with them.
//
// These fixtures pin the POST-PROCESSING layer, not the model. Replaying a recorded reply through
// `parseLeadBrief` tells us whether the validator still extracts the right suggestions, rejects the
// wrong ones, and refuses to save an unreadable recap — which is exactly what a refactor of the
// prompt or the parser can break. The model itself changes without the code changing, so model
// quality is measured separately by `run.ts` in live mode (needs a real AI_GATEWAY_API_KEY).
//
// Every case is a trap of some kind. A golden set of only-happy-paths would pass on a validator
// that accepts everything.

import type { PlanInput } from "@/lib/ai/leadPlan";

export interface EvalExpectation {
  /** Field keys a correct parser MUST surface. */
  fieldKeys?: string[];
  /** Field keys the model offered that a correct parser MUST drop. */
  dropFieldKeys?: string[];
  /** The status key a correct parser MUST surface (null = must not propose any status). */
  statusKey?: string | null;
  /** Whether the reply should yield a recap the UI can actually save. */
  usable?: boolean;
  /** Set when `next` is expected and what its kind must be. */
  nextKind?: string | null;
  /** Human note on what this case is defending against. */
  why: string;
}

export interface EvalCase {
  id: string;
  description: string;
  /** Workspace shape + the lead's current data, as the loader would build it. */
  input: PlanInput;
  /** Raw model replies, replayed in order (the second entry models the strict-JSON retry). */
  replies: string[];
  expect: EvalExpectation;
}

// A fixed clock so follow-up dates and relative ages in fixtures are reproducible.
export const NOW = new Date("2026-10-03T09:00:00.000Z");

/** Coerce helper matching the real one closely enough for validation behaviour: options + types. */
function coerceLike(keys: string[]): (key: string, value: unknown) => unknown {
  const allow = new Set(keys);
  return (key, value) => {
    if (!allow.has(key)) return undefined;
    if (value == null || value === "") return undefined;
    return value;
  };
}

const FIELD_DEFS = [
  { key: "budget", label: "Budget", type: "text", options: [] },
  { key: "city", label: "City", type: "text", options: [] },
  { key: "model", label: "Model interested in", type: "select", options: ["Swift", "Baleno", "Ertiga"] },
  { key: "timeline", label: "Timeline", type: "select", options: ["This month", "Next month", "Just looking"] },
];

function planInput(current: Record<string, unknown>, statuses: { key: string; label: string }[], fields = FIELD_DEFS): PlanInput {
  return {
    fields,
    current,
    coerce: coerceLike(fields.map((f) => f.key)),
    statuses,
    currentStatus: statuses[0]?.key ?? "new",
    now: NOW,
  };
}

const DEFAULT_STATUSES = [
  { key: "new", label: "New" },
  { key: "contacted", label: "Contacted" },
  { key: "qualified", label: "Qualified" },
  { key: "won", label: "Won" },
];

export const EVAL_CASES: EvalCase[] = [
  {
    id: "cold-inbound-form",
    description: "New lead from a web form — the clearest case for field extraction.",
    input: planInput({}, DEFAULT_STATUSES),
    replies: [
      JSON.stringify({
        recap: "Ravi is looking for a Swift in Vijayawada and has not been contacted yet.",
        fields: [
          { key: "city", value: "Vijayawada", evidence: "City: Vijayawada" },
          { key: "model", value: "Swift", evidence: "Interested in Swift" },
        ],
        status: null,
        next: { kind: "call", title: "Call Ravi today", reason: "New form lead with a clear model interest." },
      }),
    ],
    expect: { usable: true, fieldKeys: ["city", "model"], statusKey: null, nextKind: "call", why: "The baseline happy path: quotes present, keys real, value valid for a select." },
  },
  {
    id: "hallucinated-field-keys",
    description: "Model invents fields the workspace never defined.",
    input: planInput({}, DEFAULT_STATUSES),
    replies: [
      JSON.stringify({
        recap: "Priya wants a Baleno.",
        fields: [
          { key: "budget", value: "₹8 lakh", evidence: "budget around 8L" },
          { key: "lead_score", value: 80, evidence: "seems keen" },       // not a real field
          { key: "financing", value: "yes", evidence: "asked about loan" }, // not a real field
        ],
        status: null,
        next: null,
      }),
    ],
    expect: {
      usable: true,
      fieldKeys: ["budget"],
      dropFieldKeys: ["lead_score", "financing"],
      statusKey: null,
      nextKind: null,
      why: "Keys outside the workspace's own field list must never reach a rep as a saveable suggestion.",
    },
  },
  {
    id: "placeholder-value",
    description: 'Model reports a gap as "Not provided" and treats it as a value.',
    input: planInput({}, DEFAULT_STATUSES),
    replies: [
      JSON.stringify({
        recap: "Unknown budget, known city.",
        fields: [
          { key: "budget", value: "Not provided", evidence: "did not say" },
          { key: "city", value: "Guntur", evidence: "based in Guntur" },
        ],
        status: null,
        next: null,
      }),
    ],
    expect: {
      usable: true,
      fieldKeys: ["city"],
      dropFieldKeys: ["budget"],
      statusKey: null,
      nextKind: null,
      why: "A missing value is information, not data — saving the string 'Not provided' pollutes the lead.",
    },
  },
  {
    id: "already-filled-field",
    description: "Model re-suggests a field the lead already has filled identically.",
    input: planInput({ city: "Vijayawada" }, DEFAULT_STATUSES),
    replies: [
      JSON.stringify({
        recap: "City already known.",
        fields: [{ key: "city", value: "Vijayawada", evidence: "City: Vijayawada" }],
        status: null,
        next: null,
      }),
    ],
    expect: {
      usable: true,
      fieldKeys: [],
      dropFieldKeys: ["city"],
      statusKey: null,
      nextKind: null,
      why: "A suggestion that changes nothing is noise on the profile; dismissal-on-apply would silently no-op.",
    },
  },
  {
    id: "no-evidence-quote",
    description: "Model proposes a value with no supporting quote.",
    input: planInput({}, DEFAULT_STATUSES),
    replies: [
      JSON.stringify({
        recap: "Best guess on timeline.",
        fields: [{ key: "timeline", value: "This month", evidence: "" }],
        status: null,
        next: null,
      }),
    ],
    expect: {
      usable: true,
      fieldKeys: [],
      dropFieldKeys: ["timeline"],
      statusKey: null,
      nextKind: null,
      why: "Evidence is what makes a suggestion reviewable; without it the rep cannot check the AI.",
    },
  },
  {
    id: "status-already-current",
    description: "Model proposes the status the lead is already in.",
    input: planInput({}, DEFAULT_STATUSES),
    replies: [
      JSON.stringify({
        recap: "Lead is new.",
        fields: [],
        status: { key: "new", reason: "They just filled the form." },
        next: null,
      }),
    ],
    expect: {
      usable: true,
      fieldKeys: [],
      statusKey: null,
      nextKind: null,
      why: "Re-applying the current status is a no-op that pollutes the status history.",
    },
  },
  {
    id: "status-unknown-key",
    description: "Model proposes a status outside the workspace's list.",
    input: planInput({}, DEFAULT_STATUSES),
    replies: [
      JSON.stringify({
        recap: "Looks like a hot lead.",
        fields: [],
        status: { key: "hot", reason: "Replied twice." },
        next: null,
      }),
    ],
    expect: {
      usable: true,
      fieldKeys: [],
      statusKey: null,
      nextKind: null,
      why: "Statuses are tenant-defined; 'hot' is not a key this workspace has, so applying it would fail.",
    },
  },
  {
    id: "status-valid",
    description: "The status case that must keep working.",
    input: planInput({}, DEFAULT_STATUSES),
    replies: [
      JSON.stringify({
        recap: "They asked for pricing, so they are qualified enough to talk.",
        fields: [],
        status: { key: "qualified", reason: "Asked for price and EMI details." },
        next: null,
      }),
    ],
    expect: {
      usable: true,
      fieldKeys: [],
      statusKey: "qualified",
      nextKind: null,
      why: "Guards the other direction — the valid case must not be over-blocked by the two rejection cases.",
    },
  },
  {
    id: "analysis-then-json",
    description: "Model writes an analysis before the JSON (the reason the retry exists).",
    input: planInput({}, DEFAULT_STATUSES),
    replies: [
      `Let me think about this lead carefully.

The lead is in status New. They mentioned Swift. City is Vijayawada.
Based on the form answers, I think we should call them.

${JSON.stringify({
        recap: "Ravi wants a Swift, never contacted.",
        fields: [{ key: "city", value: "Vijayawada", evidence: "City: Vijayawada" }],
        status: null,
        next: { kind: "call", title: "Call Ravi", reason: "No contact yet." },
      })}`,
    ],
    expect: {
      usable: true,
      fieldKeys: ["city"],
      statusKey: null,
      nextKind: "call",
      why: "Prose before JSON is normal model behaviour; the extractor must find the object anyway.",
    },
  },
  {
    id: "truncated-json",
    description: "Reply cut off at the token limit mid-object.",
    input: planInput({}, DEFAULT_STATUSES),
    replies: [
      `{"recap": "Ravi is looking for a Swift and lives in Vijayawada, we have never contacted him and he filled`,
      `{"recap": "Ravi is looking for a Swift and lives in Vijayawada, we have never contacted him and he filled the form on Tuesday morning asking about the Swift variant specifically with the white colour and alloy wheels which is the mid trim version and he asked about finance options as well because his current car is being sold so he needs something quickly this month ideally before the end of the month so it is quite urgent and the budget mentioned is around seven to eight lakh which puts him in the Swift range and not the Baleno which is cheaper and he specifically asked about the test drive availability at the Benz Circle branch and he prefers mornings before nine because he works nights so afternoons are difficult for him to attend and his phone number ends in four four two one and he mentioned that he will get back after his shift ends at midnight so we should ideally call him around ten in the morning when he wakes up`,
    ],
    expect: {
      usable: false,
      fieldKeys: [],
      statusKey: null,
      nextKind: null,
      why: "A half-written JSON object must never be saved as the lead's recap — the error text would pin itself.",
    },
  },
  {
    id: "plain-prose-no-json",
    description: "Model ignores the format and answers in prose (the weaker-model case).",
    input: planInput({}, DEFAULT_STATUSES),
    replies: ["Ravi filled the form this morning asking about a Swift. Nobody has called him yet, so the fastest win is to call him before he talks to another dealer."],
    expect: {
      usable: true,
      fieldKeys: [],
      statusKey: null,
      nextKind: null,
      why: "A short plain reply is still a usable recap; it just carries no suggestions. Losing it would be worse.",
    },
  },
  {
    id: "long-prose-no-json",
    description: "Model ignores the format and rambles past the token limit.",
    input: planInput({}, DEFAULT_STATUSES),
    replies: ["x".repeat(900)],
    expect: {
      usable: false,
      fieldKeys: [],
      statusKey: null,
      nextKind: null,
      why: "Long prose is the model thinking out loud; slicing it pins half a sentence on the lead.",
    },
  },
  {
    id: "past-follow-up-date",
    description: "Model proposes a follow-up time that has already passed.",
    input: planInput({}, DEFAULT_STATUSES),
    replies: [
      JSON.stringify({
        recap: "Wants a site visit.",
        fields: [],
        status: null,
        next: { kind: "meeting", title: "Book a site visit", reason: "Asked to see the showroom.", followUpAt: "2026-09-01T10:00:00.000Z" },
      }),
    ],
    expect: {
      usable: true,
      fieldKeys: [],
      statusKey: null,
      nextKind: "meeting",
      why: "A past date is stripped but the action survives — the suggestion itself is still sound.",
    },
  },
  {
    id: "far-future-follow-up-date",
    description: "Model proposes a follow-up more than 60 days out.",
    input: planInput({}, DEFAULT_STATUSES),
    replies: [
      JSON.stringify({
        recap: "Buying next year.",
        fields: [],
        status: null,
        next: { kind: "email", title: "Check in", reason: "Long-horizon buyer.", followUpAt: "2027-06-01T10:00:00.000Z" },
      }),
    ],
    expect: {
      usable: true,
      fieldKeys: [],
      statusKey: null,
      nextKind: "email",
      why: "Beyond the horizon the date is dropped; without the cap a bad date pins a follow-up years out.",
    },
  },
  {
    id: "message-only-for-messaging-kinds",
    description: "Model attaches a draft message to a call action.",
    input: planInput({}, DEFAULT_STATUSES),
    replies: [
      JSON.stringify({
        recap: "Try messaging first.",
        fields: [],
        status: null,
        next: { kind: "call", title: "Call Anil", reason: "No answer twice.", message: "Hi Anil, following up." },
      }),
    ],
    expect: {
      usable: true,
      fieldKeys: [],
      statusKey: null,
      nextKind: "call",
      why: "A draft body on a non-messaging action is dead weight that would confuse the send affordance.",
    },
  },
  {
    id: "duplicate-field-keys",
    description: "Model proposes the same field twice with different values.",
    input: planInput({}, DEFAULT_STATUSES),
    replies: [
      JSON.stringify({
        recap: "Conflicting cities in the answers.",
        fields: [
          { key: "city", value: "Vijayawada", evidence: "City: Vijayawada" },
          { key: "city", value: "Guntur", evidence: "near Guntur" },
        ],
        status: null,
        next: null,
      }),
    ],
    expect: {
      usable: true,
      fieldKeys: ["city"],
      dropFieldKeys: [],
      statusKey: null,
      nextKind: null,
      why: "Two rows for one field means the rep cannot tell which is which; first-wins keeps it single.",
    },
  },
];