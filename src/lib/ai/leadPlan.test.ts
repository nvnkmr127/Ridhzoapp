import { describe, it, expect } from "vitest";
import { BROKEN_RECAP, EMPTY_PLAN, leadBriefSchema, parseLeadBrief, planFromObject, validateNextAction, validatePlan, visiblePlan, briefFormatInstructions, type PlanInput } from "./leadPlan";

const now = new Date("2026-09-26T10:00:00Z");

const input: PlanInput = {
  fields: [
    { key: "budget", label: "Budget", type: "number", options: [] },
    { key: "bhk", label: "BHK", type: "select", options: ["2BHK", "3BHK"] },
  ],
  current: { bhk: "2BHK" },
  // Mimics CustomFieldService validation: numbers for "budget", listed options for "bhk".
  coerce: (key, value) => {
    if (key === "budget") return Number.isFinite(Number(value)) ? Number(value) : undefined;
    if (key === "bhk") return ["2BHK", "3BHK"].includes(String(value)) ? String(value) : undefined;
    return undefined;
  },
  statuses: [
    { key: "new", label: "New" },
    { key: "site_visit", label: "Site visit booked" },
  ],
  currentStatus: "new",
  now,
};

const reply = (obj: unknown) => "```json\n" + JSON.stringify(obj) + "\n```";

describe("parseLeadBrief", () => {
  it("keeps valid, evidenced suggestions and the recap", () => {
    const { recap, plan } = parseLeadBrief(
      reply({
        recap: "Wants a 3BHK around 80L; site visit is set for Saturday.",
        fields: [
          { key: "budget", value: "8000000", evidence: "my budget is 80 lakhs" },
          { key: "bhk", value: "3BHK", evidence: "looking for 3BHK" },
        ],
        status: { key: "site_visit", reason: "They agreed to visit on Saturday" },
        next: { kind: "whatsapp", title: "Send location pin", reason: "Visit is Saturday", message: "Hi, sharing the location…", followUpAt: "2026-09-27T09:00:00+05:30" },
      }),
      input,
    );
    expect(recap).toContain("3BHK");
    expect(plan.fields.map((f) => [f.key, f.value])).toEqual([["budget", 8000000], ["bhk", "3BHK"]]);
    expect(plan.fields[0].evidence).toBe("my budget is 80 lakhs");
    expect(plan.status).toMatchObject({ key: "site_visit", label: "Site visit booked" });
    expect(plan.next).toMatchObject({ kind: "whatsapp", message: "Hi, sharing the location…", followUpAt: "2026-09-27T03:30:00.000Z" });
  });

  it("drops unknown fields, invalid values, unchanged values and suggestions without a quote", () => {
    const { plan } = parseLeadBrief(
      reply({
        recap: "x",
        fields: [
          { key: "admin_secret", value: "1", evidence: "q" },
          { key: "bhk", value: "4BHK", evidence: "4bhk please" },
          { key: "bhk", value: "2BHK", evidence: "2bhk" },
          { key: "budget", value: "5000000" },
        ],
      }),
      input,
    );
    expect(plan.fields).toEqual([]);
  });

  it("rejects a status that doesn't exist or is already current", () => {
    expect(parseLeadBrief(reply({ recap: "x", status: { key: "won_big", reason: "r" } }), input).plan.status).toBeNull();
    expect(parseLeadBrief(reply({ recap: "x", status: { key: "new", reason: "r" } }), input).plan.status).toBeNull();
  });

  it("drops a follow-up time in the past or too far out, and a message on a call", () => {
    const past = parseLeadBrief(reply({ recap: "x", next: { kind: "call", title: "Call", message: "hi", followUpAt: "2026-09-01T00:00:00Z" } }), input).plan.next;
    expect(past).toMatchObject({ kind: "call", title: "Call" });
    expect(past?.followUpAt).toBeUndefined();
    expect(past?.message).toBeUndefined();
    const far = parseLeadBrief(reply({ recap: "x", next: { kind: "follow_up", title: "Check in", followUpAt: "2027-06-01T00:00:00Z" } }), input).plan.next;
    expect(far?.followUpAt).toBeUndefined();
  });

  it("falls back to plain text when the model ignores the JSON format", () => {
    const { recap, plan } = parseLeadBrief("New lead from Bangalore, call them today.", input);
    expect(recap).toBe("New lead from Bangalore, call them today.");
    expect(plan).toEqual({ fields: [], status: null, next: null });
  });
});

describe("visiblePlan", () => {
  it("hides dismissed or applied suggestions by id", () => {
    const { plan } = parseLeadBrief(
      reply({ recap: "x", fields: [{ key: "budget", value: 5, evidence: "5" }], status: { key: "site_visit", reason: "r" }, next: { kind: "call", title: "Call" } }),
      input,
    );
    const v = visiblePlan(plan, [plan.fields[0].id, plan.status!.id]);
    expect(v.fields).toEqual([]);
    expect(v.status).toBeNull();
    expect(v.next?.title).toBe("Call");
  });

  it("gives the same id to the same suggestion across regenerations", () => {
    const a = parseLeadBrief(reply({ recap: "a", fields: [{ key: "budget", value: 5, evidence: "five" }] }), input).plan;
    const b = parseLeadBrief(reply({ recap: "b", fields: [{ key: "budget", value: "5", evidence: "it's 5" }] }), input).plan;
    expect(a.fields[0].id).toBe(b.fields[0].id);
  });
});

describe("briefFormatInstructions", () => {
  it("lists the real field and status keys, marking the current status", () => {
    const s = briefFormatInstructions(input, "Asia/Kolkata");
    expect(s).toContain('bhk = "BHK" [select: 2BHK | 3BHK]');
    expect(s).toContain('new = "New" (current)');
    expect(s).toContain("today is 2026-09-26, timezone Asia/Kolkata");
  });
});

describe("parseLeadBrief — malformed model output", () => {
  const input = { fields: [], current: {}, coerce: (_k: string, v: unknown) => v, statuses: [], currentStatus: "new", now: new Date() };

  it("never shows raw JSON: recovers the recap from a truncated reply", () => {
    const { recap, plan } = parseLeadBrief('{"recap": "Wants a 3BHK near Hitech City, visit Saturday.", "fields": [{"key": "bud', input);
    expect(recap).toBe("Wants a 3BHK near Hitech City, visit Saturday.");
    expect(plan.fields).toEqual([]);
  });

  it("gives a plain message when nothing is recoverable", () => {
    expect(parseLeadBrief('{"fields": [{"key": "bud', input).recap).toMatch(/Refresh/);
  });

  it("rejects long rambling prose instead of pinning half of it as the recap", () => {
    expect(parseLeadBrief("Let me analyze this lead carefully. " + "x".repeat(700), input).recap).toBe(BROKEN_RECAP);
  });

  it("still passes through a plain-text reply", () => {
    expect(parseLeadBrief("Wants a 3BHK.", input).recap).toBe("Wants a 3BHK.");
  });
});

describe("planFromObject — the schema-constrained path", () => {
  it("applies exactly the same rules as the text path", () => {
    const obj = {
      recap: "Wants a 3BHK, budget not discussed. Call today.",
      fields: [
        { key: "bhk", value: "3BHK", evidence: "we need a 3 BHK" },
        { key: "budget", value: "not provided", evidence: "nothing said about budget" },
      ],
      status: { key: "site_visit", reason: "asked about Saturday visit" },
      next: { kind: "call", title: "Call about Saturday", reason: "they asked a question we haven't answered" },
    };
    const fromObject = planFromObject(leadBriefSchema.parse(obj), input);
    const fromText = parseLeadBrief(JSON.stringify(obj), input);
    expect(fromObject).toEqual(fromText);
    // The placeholder survives the schema, and only validatePlan drops it.
    expect(fromObject.plan.fields.map((f) => f.key)).toEqual(["bhk"]);
  });

  it("fills the schema's defaults when the model omits the optional parts", () => {
    const brief = leadBriefSchema.parse({ recap: "Just browsed the price list." });
    expect(brief.fields).toEqual([]);
    expect(brief.status).toBeNull();
    expect(brief.next).toBeNull();
    expect(planFromObject(brief, input)).toEqual({ recap: "Just browsed the price list.", plan: EMPTY_PLAN });
  });

  it("never returns an empty recap, so callers can test one value", () => {
    expect(planFromObject({ recap: "" }, input).recap).toBe(BROKEN_RECAP);
    expect(planFromObject(null, input).recap).toBe(BROKEN_RECAP);
  });

  it("rejects a brief whose recap isn't a string, before generation can be trusted", () => {
    // The failure mode this replaces: the model emits a number or an object for "recap" and the old
    // prose-asked path silently produced a recap of "" that got saved onto the lead.
    expect(() => leadBriefSchema.parse({ recap: { text: "hi" } })).toThrow();
  });
});

describe("validatePlan — placeholders", () => {
  it("drops 'Not provided' style values", () => {
    const input = { fields: [{ key: "location", label: "Location", type: "text", options: [] }], current: {}, coerce: (_k: string, v: unknown) => v, statuses: [], currentStatus: "new", now: new Date() };
    const plan = validatePlan({ fields: [{ key: "location", value: "Not provided", evidence: "no location" }] }, input);
    expect(plan.fields).toEqual([]);
  });
});

// The three checks the prompt cannot be trusted with. All deterministic, all in the validator.
describe("validateNextAction — impossibility", () => {
  const noPhone: PlanInput = { ...input, capabilities: { phone: false, email: true } };

  it("drops a call when there is no phone to call, and a WhatsApp for the same reason", () => {
    expect(validateNextAction({ kind: "call", title: "Call them" }, noPhone)).toBeNull();
    expect(validateNextAction({ kind: "whatsapp", title: "Message them" }, noPhone)).toBeNull();
  });

  it("keeps the same call when there is a phone — the filter is about the lead, not the kind", () => {
    expect(validateNextAction({ kind: "call", title: "Call them" }, { ...input, capabilities: { phone: true } })?.kind).toBe("call");
  });

  it("drops a sequence stop when the lead isn't in one, and an enroll when none exists", () => {
    const idle = { ...input, capabilities: { inSequence: false, hasEnrollableSequence: false } };
    expect(validateNextAction({ kind: "stop_sequence", title: "Stop the sequence" }, idle)).toBeNull();
    expect(validateNextAction({ kind: "enroll_sequence", title: "Enroll them" }, idle)).toBeNull();
    expect(validateNextAction({ kind: "stop_sequence", title: "Stop the sequence" }, { ...input, capabilities: { inSequence: true } })?.kind).toBe("stop_sequence");
  });

  it("drops a status move to where the lead already is", () => {
    const statusInput = { ...input, statuses: [{ key: "new", label: "New" }, { key: "hot", label: "Hot" }], currentStatus: "hot" };
    expect(validateNextAction({ kind: "change_status", title: "Mark hot", statusKey: "hot" }, statusInput)).toBeNull();
    expect(validateNextAction({ kind: "change_status", title: "Move to new", statusKey: "new" }, statusInput)?.statusKey).toBe("new");
  });

  it("infers the target status for mark_qualified, and gives up when the workspace has none", () => {
    const withQual: PlanInput = { ...input, statuses: [{ key: "new", label: "New" }, { key: "qualified", label: "Qualified" }] };
    expect(validateNextAction({ kind: "mark_qualified", title: "Mark qualified" }, withQual)?.statusKey).toBe("qualified");
    expect(validateNextAction({ kind: "mark_qualified", title: "Mark qualified" }, input)).toBeNull();
  });

  it("keeps a suggestion it can't check — unknown capability is not the same as no", () => {
    expect(validateNextAction({ kind: "stop_sequence", title: "Stop the sequence" }, { ...input, capabilities: {} })?.kind).toBe("stop_sequence");
    expect(validateNextAction({ kind: "stop_sequence", title: "Stop the sequence" }, input)?.kind).toBe("stop_sequence");
  });
});

describe("validateNextAction — outreach veto", () => {
  const held: PlanInput = { ...input, holdOutreach: "You contacted them 12 minutes ago." };
  const contacting = { reason: "Asked about the EMI twice this week and got no reply.", evidence: ["what is the EMI on the City"], urgency: "now", title: "Call about the EMI" };

  it("downgrades a contacting action to this_week and shows the rep why", () => {
    const a = validateNextAction({ kind: "call", ...contacting }, held);
    expect(a?.urgency).toBe("this_week");
    expect(a?.reason).toContain("12 minutes ago");
  });

  it("does not touch a non-contacting action — the veto is about reaching out, not record-keeping", () => {
    const a = validateNextAction({ kind: "follow_up", ...contacting }, held);
    expect(a?.urgency).not.toBe("this_week");
  });

  it("leaves an action alone when nothing is holding it back", () => {
    expect(validateNextAction({ kind: "call", ...contacting }, input)?.urgency).toBe("now");
  });

  it("also lowers the derived confidence, so it can't read as certain", () => {
    expect(validateNextAction({ kind: "call", ...contacting }, held)?.confidence).not.toBe("high");
  });
});

describe("validateNextAction — confidence gate", () => {
  const bare = { kind: "email", title: "Email them", reason: "Follow up", urgency: "now" };
  const specific = {
    kind: "email",
    title: "Email about Saturday's visit",
    reason: "Asked twice about the 11 AM slot on Saturday and hasn't confirmed.",
    evidence: ["can we do saturday 11 am"],
    urgency: "now",
  };

  it("rates a reason with no quote and no concrete fact as low, and stops it being urgent", () => {
    const a = validateNextAction(bare, input);
    expect(a?.confidence).toBe("low");
    expect(a?.urgency).toBe("today");
  });

  it("rates a cited, specific reason as high", () => {
    expect(validateNextAction(specific, input)?.confidence).toBe("high");
  });

  it("caps how urgent a low-confidence action can be, whatever the model asked for", () => {
    expect(validateNextAction({ ...bare, urgency: "now" }, input)?.urgency).toBe("today");
  });

  it("marks the source as the AI and keeps the quote as evidence", () => {
    const a = validateNextAction(specific, input);
    expect(a?.source).toBe("ai");
    expect(a?.evidence).toEqual(["can we do saturday 11 am"]);
  });
});

describe("validateNextAction — shape", () => {
  it("keeps a message only for the kinds that send one", () => {
    expect(validateNextAction({ kind: "call", title: "Call", message: "hi" }, input)?.message).toBeUndefined();
    expect(validateNextAction({ kind: "whatsapp", title: "WhatsApp", message: "hi there" }, input)?.message).toBe("hi there");
  });

  it("rejects anything that isn't a known kind, or has no title", () => {
    expect(validateNextAction({ kind: "send_bribe", title: "Send a bribe" }, input)).toBeNull();
    expect(validateNextAction({ kind: "call" }, input)).toBeNull();
    expect(validateNextAction("call", input)).toBeNull();
  });

  it("gives the same id for the same action, so a dismissal survives a regeneration", () => {
    const specific = { kind: "email", title: "Email about Saturday's visit", reason: "Asked twice about the 11 AM slot.", evidence: ["can we do saturday 11 am"] };
    const a = validateNextAction(specific, input);
    const b = validateNextAction({ ...specific, evidence: ["different words entirely", "more"] }, input);
    expect(a?.id).toBe(b?.id);
  });
});

describe("briefFormatInstructions — only teaches what the lead supports", () => {
  it("omits kinds the lead can't support", () => {
    const s = briefFormatInstructions({ ...input, capabilities: { phone: false, email: true } }, "Asia/Kolkata");
    expect(s).not.toContain("call (call them");
    expect(s).toContain("email (email them)");
  });

  it("tells the model when reaching out now would be wrong", () => {
    const s = briefFormatInstructions({ ...input, holdOutreach: "A follow-up is already booked for 30 Sep." }, "Asia/Kolkata");
    expect(s).toContain("Do NOT propose contacting them right now");
  });
});
