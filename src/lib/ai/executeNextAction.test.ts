import { describe, it, expect, vi, beforeEach } from "vitest";
import { executeNextAction } from "./leadSuggestions";
import type { NextAction } from "@/domains/leads/nextAction";
import { LeadService } from "@/domains/leads/service";
import { FollowUpService } from "@/domains/follow-ups/service";
import { SequenceService } from "@/domains/leads/sequenceService";
import { MeetingService } from "@/domains/meetings/service";
import { CustomStatusSchemaService } from "@/domains/leads/customStatusSchemaService";
import { sendWhatsAppAction, sendEmailAction } from "@/lib/actions/messaging";
import { setMeetingOutcomeAction, sendMeetingConfirmationAction } from "@/lib/actions/meetings";
import { assignLeadAction } from "@/lib/actions/leads";
import { createShareAction } from "@/lib/actions/sharedContent";

vi.mock("@/domains/customFields/service", () => ({ CustomFieldService: { validate: vi.fn(), list: vi.fn() } }));
vi.mock("@/domains/leads/customStatusSchemaService", () => ({ CustomStatusSchemaService: { getTenantStatusSchema: vi.fn() } }));
vi.mock("@/domains/follow-ups/service", () => ({ FollowUpService: { createFollowUp: vi.fn() } }));
vi.mock("@/domains/leads/service", () => ({ LeadService: { getLead: vi.fn(), updateCustomData: vi.fn(), changeStatus: vi.fn() } }));
vi.mock("@/domains/leads/sequenceService", () => ({ SequenceService: { list: vi.fn(), listForLead: vi.fn(), enroll: vi.fn(), stop: vi.fn() } }));
vi.mock("@/domains/meetings/service", () => ({ MeetingService: { listForLead: vi.fn() } }));
vi.mock("@/lib/actions/leads", () => ({ assignLeadAction: vi.fn() }));
vi.mock("@/lib/actions/meetings", () => ({ sendMeetingConfirmationAction: vi.fn(), setMeetingOutcomeAction: vi.fn() }));
vi.mock("@/lib/actions/messaging", () => ({ sendWhatsAppAction: vi.fn(), sendEmailAction: vi.fn() }));
vi.mock("@/lib/actions/sharedContent", () => ({ createShareAction: vi.fn() }));
vi.mock("@/lib/ai/leadAssist", () => ({ markAiSuggestionDone: vi.fn() }));

const lead = { id: "lead-1", name: "Ananya", status: "new", ownerId: "user-1", customData: {} } as never;

function action(over: Partial<NextAction> = {}): NextAction {
  return {
    id: "n_test",
    kind: "follow_up",
    title: "Call about Saturday's site visit",
    reason: "They asked twice about the 11am slot.",
    evidence: [],
    urgency: "today",
    confidence: "high",
    source: "ai",
    ...over,
  };
}

const run = (a: NextAction, extra: Record<string, unknown> = {}) =>
  executeNextAction({ lead, organizationId: "org-1", userId: "user-1", action: a, ...extra });

beforeEach(() => {
  vi.clearAllMocks();
  (sendWhatsAppAction as any).mockResolvedValue({ ok: true, data: {} });
  (sendEmailAction as any).mockResolvedValue({ ok: true, data: { sent: true } });
  (setMeetingOutcomeAction as any).mockResolvedValue({ ok: true, data: {} });
  (sendMeetingConfirmationAction as any).mockResolvedValue({ ok: true, data: {} });
  (assignLeadAction as any).mockResolvedValue({ ok: true, data: {} });
  (createShareAction as any).mockResolvedValue({ ok: true, data: {} });
  (FollowUpService.createFollowUp as any).mockResolvedValue({ id: "fu-1" });
  (LeadService.changeStatus as any).mockResolvedValue({ id: "lead-1" });
  (SequenceService.enroll as any).mockResolvedValue({ enrolled: 1 });
  (SequenceService.stop as any).mockResolvedValue(undefined);
  (CustomStatusSchemaService.getTenantStatusSchema as any).mockResolvedValue([
    { key: "new", label: "New" },
    { key: "qualified", label: "Qualified" },
    { key: "lost", label: "Lost" },
  ]);
  (MeetingService.listForLead as any).mockResolvedValue([]);
});

describe("executeNextAction — outbound is never one click", () => {
  it("refuses to invent wording when the AI produced no message", async () => {
    const res = await run(action({ kind: "whatsapp" }), { confirm: true });
    expect(res).toMatchObject({ ok: false, code: "VALIDATION" });
    expect(sendWhatsAppAction).not.toHaveBeenCalled();
  });

  it("hands back the draft for review instead of sending", async () => {
    const res = await run(action({ kind: "whatsapp", message: "Hi Ananya, about Saturday…" }));
    expect(res).toEqual({
      ok: true,
      prompt: { kind: "review_send", channel: "whatsapp", subject: "Call about Saturday's site visit", body: "Hi Ananya, about Saturday…" },
    });
    expect(sendWhatsAppAction).not.toHaveBeenCalled();
  });

  it("sends the WhatsApp once confirmed", async () => {
    const res = await run(action({ kind: "whatsapp", message: "Hi Ananya" }), { confirm: true });
    expect(res).toEqual({ ok: true, applied: "WhatsApp sent" });
    expect(sendWhatsAppAction).toHaveBeenCalledWith({ leadId: "lead-1", body: "Hi Ananya" });
  });

  it("takes the subject the rep edited, not the one we derived", async () => {
    await run(action({ kind: "email", title: "Call about Saturday's site visit", message: "Hi Ananya" }), {
      confirm: true,
      answer: { subject: "Your site visit on Saturday" },
    });
    expect(sendEmailAction).toHaveBeenCalledWith({ leadId: "lead-1", subject: "Your site visit on Saturday", body: "Hi Ananya" });
  });

  it("passes the send failure through instead of reporting success", async () => {
    (sendWhatsAppAction as any).mockResolvedValue({ ok: false, code: "FORBIDDEN", message: "Outside the 24-hour window." });
    const res = await run(action({ kind: "whatsapp", message: "Hi" }), { confirm: true });
    expect(res).toEqual({ ok: false, code: "FORBIDDEN", message: "Outside the 24-hour window." });
  });
});

describe("executeNextAction — status moves", () => {
  it("moves the lead and says where to", async () => {
    const res = await run(action({ kind: "mark_qualified", statusKey: "qualified" }));
    expect(res).toEqual({ ok: true, applied: "Status changed to Qualified" });
    expect(LeadService.changeStatus).toHaveBeenCalledWith("lead-1", "qualified", "user-1", "org-1", expect.stringContaining("11am"));
  });

  it("will not move a lead to the status it is already in", async () => {
    const res = await run(action({ kind: "change_status", statusKey: "new" }));
    expect(res).toMatchObject({ ok: false, code: "CONFLICT" });
    expect(LeadService.changeStatus).not.toHaveBeenCalled();
  });

  it("re-checks the status still exists in this workspace", async () => {
    const res = await run(action({ kind: "change_status", statusKey: "some_deleted_status" }));
    expect(res).toMatchObject({ ok: false, code: "VALIDATION" });
  });

  it("has nothing to do without a status to move to", async () => {
    const res = await run(action({ kind: "change_status" }));
    expect(res).toMatchObject({ ok: false, code: "VALIDATION" });
  });
});

describe("executeNextAction — booking onto the rep's list", () => {
  it("books a call as a call, not a vague follow-up", async () => {
    const res = await run(action({ kind: "call" }));
    expect(FollowUpService.createFollowUp).toHaveBeenCalledWith(expect.objectContaining({ type: "call", title: "Call about Saturday's site visit" }));
    expect(res.ok).toBe(true);
  });

  it("books a proposed meeting as a task — nothing is booked or notified yet", async () => {
    await run(action({ kind: "meeting" }));
    expect(FollowUpService.createFollowUp).toHaveBeenCalledWith(expect.objectContaining({ type: "task" }));
  });

  it("books ask_for_info as a call", async () => {
    await run(action({ kind: "ask_for_info" }));
    expect(FollowUpService.createFollowUp).toHaveBeenCalledWith(expect.objectContaining({ type: "call" }));
  });

  it("uses the AI's own time when it gave one", async () => {
    const when = new Date(Date.now() + 3 * 86_400_000).toISOString();
    await run(action({ kind: "call", followUpAt: when }));
    expect(FollowUpService.createFollowUp).toHaveBeenCalledWith(expect.objectContaining({ dueAt: new Date(when) }));
  });

  it("puts an urgent action today, not tomorrow", async () => {
    await run(action({ kind: "call", urgency: "now" }));
    const { dueAt } = (FollowUpService.createFollowUp as any).mock.calls[0][0];
    expect(dueAt.getTime() - Date.now()).toBeLessThan(6 * 3_600_000);
  });

  it("schedules for tomorrow when urgency is ordinary", async () => {
    await run(action({ kind: "call", urgency: "today" }));
    const { dueAt } = (FollowUpService.createFollowUp as any).mock.calls[0][0];
    expect(dueAt.getTime() - Date.now()).toBeGreaterThan(20 * 3_600_000);
  });
});

describe("executeNextAction — inaction is an answer", () => {
  it("reports nothing to do rather than rendering an empty card", async () => {
    const res = await run(action({ kind: "wait" }));
    expect(res).toEqual({ ok: true, applied: "Nothing to do on this lead right now" });
    expect(FollowUpService.createFollowUp).not.toHaveBeenCalled();
  });

  it("names the date to wait until", async () => {
    const res = await run(action({ kind: "do_nothing", followUpAt: "2026-11-02T09:00:00Z" }));
    expect(res).toMatchObject({ ok: true, applied: expect.stringContaining("2 Nov") });
  });
});

describe("executeNextAction — sequences", () => {
  it("enrolls when there is exactly one active sequence", async () => {
    (SequenceService.list as any).mockResolvedValue([{ id: "seq-1", name: "Nurture", isActive: true, stepCount: 3 }]);
    const res = await run(action({ kind: "enroll_sequence" }));
    expect(SequenceService.enroll).toHaveBeenCalledWith("org-1", "seq-1", ["lead-1"]);
    expect(res).toEqual({ ok: true, applied: "Enrolled in Nurture" });
  });

  it("refuses to pick when the choice is the rep's", async () => {
    (SequenceService.list as any).mockResolvedValue([
      { id: "seq-1", name: "Nurture", isActive: true, stepCount: 3 },
      { id: "seq-2", name: "Re-engage", isActive: true, stepCount: 2 },
    ]);
    const res = await run(action({ kind: "enroll_sequence" }));
    expect(res).toMatchObject({ ok: false, code: "VALIDATION" });
    expect(SequenceService.enroll).not.toHaveBeenCalled();
  });

  it("ignores paused and empty sequences when choosing", async () => {
    (SequenceService.list as any).mockResolvedValue([
      { id: "seq-0", name: "Old", isActive: false, stepCount: 3 },
      { id: "seq-1", name: "Nurture", isActive: true, stepCount: 0 },
      { id: "seq-2", name: "Live", isActive: true, stepCount: 4 },
    ]);
    await run(action({ kind: "enroll_sequence" }));
    expect(SequenceService.enroll).toHaveBeenCalledWith("org-1", "seq-2", ["lead-1"]);
  });

  it("says so when they are already enrolled", async () => {
    (SequenceService.list as any).mockResolvedValue([{ id: "seq-1", name: "Nurture", isActive: true, stepCount: 3 }]);
    (SequenceService.enroll as any).mockResolvedValue({ enrolled: 0 });
    expect(await run(action({ kind: "enroll_sequence" }))).toMatchObject({ ok: false, code: "CONFLICT" });
  });

  it("stops every live enrollment, because 'stop' means stop", async () => {
    (SequenceService.listForLead as any).mockResolvedValue([
      { enrollmentId: "e1", name: "Nurture", status: "active" },
      { enrollmentId: "e2", name: "Re-engage", status: "paused" },
      { enrollmentId: "e3", name: "Old", status: "completed" },
    ]);
    const res = await run(action({ kind: "stop_sequence" }));
    expect(SequenceService.stop).toHaveBeenCalledTimes(2);
    expect(res).toEqual({ ok: true, applied: "Stopped 2 sequences" });
  });

  it("does nothing when they are not in a sequence", async () => {
    (SequenceService.listForLead as any).mockResolvedValue([]);
    expect(await run(action({ kind: "stop_sequence" }))).toMatchObject({ ok: false, code: "CONFLICT" });
    expect(SequenceService.stop).not.toHaveBeenCalled();
  });
});

describe("executeNextAction — meetings", () => {
  const HOUR = 3_600_000;
  const meeting = (id: string, offsetMs: number, extra: Record<string, unknown> = {}) => ({
    id,
    leadId: "lead-1",
    mode: "site_visit",
    startAt: new Date(Date.now() + offsetMs).toISOString(),
    status: "scheduled",
    ...extra,
  });

  it("asks what happened rather than recording that it did", async () => {
    (MeetingService.listForLead as any).mockResolvedValue([meeting("m-1", -HOUR)]);
    const res = await run(action({ kind: "log_meeting_outcome" }));
    expect(res).toEqual({ ok: true, prompt: { kind: "log_meeting_outcome", meetingId: "m-1" } });
    expect(setMeetingOutcomeAction).not.toHaveBeenCalled();
  });

  it("logs the most recent past meeting once the rep answers", async () => {
    (MeetingService.listForLead as any).mockResolvedValue([meeting("recent", -HOUR), meeting("old", -72 * HOUR)]);
    const res = await run(action({ kind: "log_meeting_outcome" }), { answer: { meetingOutcome: { status: "no_show" } } });
    expect(setMeetingOutcomeAction).toHaveBeenCalledWith("recent", { status: "no_show" });
    expect(res).toEqual({ ok: true, applied: "Site visit marked no-show" });
  });

  it("confirms the furthest-ahead meeting, not the nearest", async () => {
    // listForLead sorts newest-first, so the last future entry is the one actually next in the diary.
    (MeetingService.listForLead as any).mockResolvedValue([meeting("soon", 2 * HOUR), meeting("later", 30 * HOUR)]);
    const res = await run(action({ kind: "confirm_meeting" }));
    expect(res).toEqual({ ok: true, prompt: { kind: "confirm_meeting", meetingId: "later" } });
    expect(sendMeetingConfirmationAction).not.toHaveBeenCalled();
  });

  it("tells the lead only once the rep says so", async () => {
    (MeetingService.listForLead as any).mockResolvedValue([meeting("m-1", 2 * HOUR)]);
    (sendMeetingConfirmationAction as any).mockResolvedValue({ ok: true, data: {} });
    const res = await run(action({ kind: "confirm_meeting" }), { confirm: true });
    expect(sendMeetingConfirmationAction).toHaveBeenCalledWith("m-1");
    expect(res).toEqual({ ok: true, applied: "Confirmation sent for the Site visit" });
  });

  it("will not confirm a meeting that already happened", async () => {
    (MeetingService.listForLead as any).mockResolvedValue([meeting("past", -HOUR)]);
    expect(await run(action({ kind: "confirm_meeting" }))).toMatchObject({ ok: false, code: "NOT_FOUND" });
  });
});

describe("executeNextAction — things only a person can decide", () => {
  it("asks who should own the lead", async () => {
    const res = await run(action({ kind: "assign" }));
    expect(res).toEqual({ ok: true, prompt: { kind: "choose_owner" } });
    expect(assignLeadAction).not.toHaveBeenCalled();
  });

  it("reassigns once they choose", async () => {
    const res = await run(action({ kind: "assign" }), { answer: { ownerId: "user-9" } });
    expect(assignLeadAction).toHaveBeenCalledWith({ leadId: "lead-1", ownerId: "user-9", teamId: null });
    expect(res).toEqual({ ok: true, applied: "Lead reassigned" });
  });

  it("never invents a URL to share", async () => {
    const res = await run(action({ kind: "share_document" }));
    expect(res).toEqual({ ok: true, prompt: { kind: "choose_content", title: "Call about Saturday's site visit" } });
    expect(createShareAction).not.toHaveBeenCalled();
  });

  it("shares what the rep picked", async () => {
    await run(action({ kind: "share_document" }), { answer: { share: { targetUrl: "https://example.com/brochure.pdf" } } });
    expect(createShareAction).toHaveBeenCalledWith({
      leadId: "lead-1",
      title: "Call about Saturday's site visit",
      targetUrl: "https://example.com/brochure.pdf",
    });
  });

  it("leaves escalation to the SLA scan instead of stamping it", async () => {
    const res = await run(action({ kind: "escalate" }));
    expect(res).toMatchObject({ ok: false, code: "VALIDATION" });
  });
});