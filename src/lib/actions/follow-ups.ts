"use server";

import { assertWritable, requireOrg } from "@/lib/rbac";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { FollowUpService } from "@/domains/follow-ups/service";
import { ActivityService } from "@/domains/activities/service";
import { ok, fail, actionFail, zodFieldErrors } from "@/lib/actions/result";
import { assertLeadAccess } from "@/lib/leads/access";
import { FOLLOW_UP_TYPES } from "@/lib/followUps/types";
import { getOrgFormat } from "@/lib/format.server";
import { zonedParts, zonedTimeToUtc } from "@/lib/tz";
import { db } from "@/db";
import { followUps } from "@/db/schema";
import { desc, eq } from "drizzle-orm";

// The single set of follow-up actions (the lead's Follow-ups tab, /follow-ups, the AI agent). They all
// go through FollowUpService, so automations, the activity timeline and the lead's next-follow-up
// date stay consistent no matter where a follow-up was touched.

// You may act on a follow-up assigned to you, or on any follow-up of a lead you may act on — the same
// rule the mobile API uses, so an assignee is never shown a follow-up they can't complete.
async function assertFollowUpAccess(id: string, ctx: { userId: string; organizationId: string }) {
  const [row] = await db.select({ leadId: followUps.leadId, userId: followUps.userId }).from(followUps).where(eq(followUps.id, id)).limit(1);
  if (!row) throw new Error("Follow-up not found");
  if (row.userId === ctx.userId) {
    const { assertLeadInOrg } = await import("@/domains/leads/ownership");
    await assertLeadInOrg(row.leadId, ctx.organizationId);
    return row;
  }
  await assertLeadAccess(row.leadId, ctx);
  return row;
}

const typeKeys = FOLLOW_UP_TYPES.map((t) => t.key) as [string, ...string[]];
const dateSchema = z.coerce.date().refine((d) => !Number.isNaN(d.getTime()), "Pick a valid date and time.");

const followUpSchema = z.object({
  leadId: z.guid(),
  type: z.enum(typeKeys).default("followup"),
  title: z.string().trim().min(1, "Title is required").max(255),
  description: z.string().max(5000).optional(),
  dueAt: dateSchema,
  userId: z.guid().nullable().optional(), // someone else; omitted = me, null = unassigned
});

function refresh(leadId: string) {
  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/follow-ups");
}

export async function createFollowUp(input: z.input<typeof followUpSchema>) {
  const { userId: sessionUserId, organizationId } = await assertWritable();
  const parsed = followUpSchema.safeParse(input);
  if (!parsed.success) {
    return fail("VALIDATION", parsed.error.issues[0]?.message ?? "Please add a title, type, and a valid due date.", zodFieldErrors(parsed.error));
  }
  const { leadId, type, title, description, dueAt, userId } = parsed.data;
  try {
    await assertLeadAccess(leadId, { userId: sessionUserId, organizationId });
    const followUp = await FollowUpService.createFollowUp({
      leadId, type, title, description, dueAt,
      userId: userId === undefined ? sessionUserId : userId,
      organizationId,
    });
    refresh(leadId);
    return ok(followUp);
  } catch (e) {
    return actionFail(e);
  }
}

const updateSchema = followUpSchema.omit({ leadId: true, userId: true });

export async function updateFollowUp(id: string, input: z.input<typeof updateSchema>) {
  const { userId, organizationId } = await assertWritable();
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return fail("VALIDATION", parsed.error.issues[0]?.message ?? "Please add a title and a valid due date.", zodFieldErrors(parsed.error));
  try {
    await assertFollowUpAccess(id, { userId, organizationId });
    const updated = await FollowUpService.updateFollowUp(id, parsed.data, organizationId);
    if (!updated) return fail("NOT_FOUND", "This follow-up was already completed or cancelled.");
    refresh(updated.leadId);
    return ok(updated);
  } catch (e) {
    return actionFail(e);
  }
}

// Shared shape for the single-id transitions below.
async function transition<T extends { leadId: string } | undefined>(
  id: string,
  run: (organizationId: string) => Promise<T>,
  gone = "This follow-up was already completed or cancelled. Refresh to see its latest state.",
) {
  const { userId, organizationId } = await assertWritable();
  try {
    await assertFollowUpAccess(id, { userId, organizationId });
    const updated = await run(organizationId);
    if (!updated) return fail("NOT_FOUND", gone);
    refresh(updated.leadId);
    return ok(updated);
  } catch (e) {
    return actionFail(e);
  }
}

export async function completeFollowUp(id: string) {
  return transition(id, (org) => FollowUpService.completeFollowUp(id, org));
}

export async function reopenFollowUp(id: string) {
  return transition(id, (org) => FollowUpService.reopenFollowUp(id, org), "Only a completed follow-up can be reopened.");
}

// Cancelling replaces deleting: the follow-up drops out of every list but stays in the lead's history.
export async function cancelFollowUp(id: string) {
  const { userId } = await requireOrg();
  const res = await transition(id, (org) => FollowUpService.cancelFollowUp(id, org));
  if (res.ok) {
    await ActivityService.addActivity({ leadId: res.data.leadId, userId, type: "note", content: `Follow-up cancelled: ${res.data.title}` }).catch(() => {});
  }
  return res;
}

const snoozeSchema = z.union([z.object({ days: z.number().int().min(1).max(365) }), z.object({ until: dateSchema })]);

// Snooze by whole days lands at 9:00 in the WORKSPACE's timezone (not the browser's or the server's).
export async function snoozeFollowUp(id: string, input: z.input<typeof snoozeSchema>) {
  const parsed = snoozeSchema.safeParse(input);
  if (!parsed.success) return fail("VALIDATION", "Pick a valid snooze time.");
  return transition(id, async (org) => {
    let until: Date;
    if ("days" in parsed.data) {
      const { timezone } = await getOrgFormat(org);
      const p = zonedParts(new Date(), timezone);
      until = zonedTimeToUtc(p.year, p.month, p.day + parsed.data.days, 9, 0, timezone);
    } else {
      until = parsed.data.until;
    }
    return FollowUpService.snoozeFollowUp(id, until, org);
  });
}

export async function rescheduleFollowUp(id: string, dueAt: Date | string) {
  const parsed = dateSchema.safeParse(dueAt);
  if (!parsed.success) return fail("VALIDATION", "Pick a valid date and time.");
  return transition(id, (org) => FollowUpService.rescheduleFollowUp(id, parsed.data, org));
}

export async function assignFollowUp(id: string, assigneeId: string | null) {
  if (assigneeId !== null && !z.guid().safeParse(assigneeId).success) return fail("VALIDATION", "Pick a team member.");
  return transition(id, (org) => FollowUpService.assignFollowUp(id, assigneeId, org));
}

// All follow-ups on one lead, newest due first (the lead's Follow-ups tab).
export async function listLeadFollowUpsAction(leadId: string) {
  const { userId, organizationId } = await requireOrg();
  await assertLeadAccess(leadId, { userId, organizationId });
  return db.select().from(followUps).where(eq(followUps.leadId, leadId)).orderBy(desc(followUps.dueAt));
}
