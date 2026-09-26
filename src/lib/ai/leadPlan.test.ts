import { describe, it, expect } from "vitest";
import { parseLeadBrief, visiblePlan, briefFormatInstructions, type PlanInput } from "./leadPlan";

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
