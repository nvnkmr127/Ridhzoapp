import { db } from "@/db";
import { sequences, sequenceSteps, sequenceEnrollments, leads } from "@/db/schema";
import { and, eq, lte, asc, sql, isNull } from "drizzle-orm";
import { ActivityService } from "@/domains/activities/service";

export interface SequenceStepInput {
  dayOffset: number;
  channel: "whatsapp" | "email";
  body: string;
  attachmentUrl?: string | null;
  attachmentName?: string | null;
}

const DAY = 24 * 60 * 60 * 1000;

function renderTokens(body: string, lead: { name: string | null; company?: string | null; email?: string | null; phone?: string | null }): string {
  const first = (lead.name ?? "there").split(" ")[0];
  return body
    .replace(/\{\{\s*first_name\s*\}\}/gi, first)
    .replace(/\{\{\s*name\s*\}\}/gi, lead.name ?? "there")
    .replace(/\{\{\s*company\s*\}\}/gi, lead.company ?? "")
    .replace(/\{\{\s*email\s*\}\}/gi, lead.email ?? "")
    .replace(/\{\{\s*phone\s*\}\}/gi, lead.phone ?? "");
}

export class SequenceService {
  static async create(organizationId: string, name: string, steps: SequenceStepInput[], description?: string | null) {
    const [seq] = await db.insert(sequences).values({ organizationId, name, description: description ?? null }).returning();
    if (steps.length) {
      await db.insert(sequenceSteps).values(
        steps.map((s, i) => ({
          sequenceId: seq.id,
          stepIndex: i,
          dayOffset: Math.max(0, Math.floor(s.dayOffset)),
          channel: s.channel === "email" ? "email" : "whatsapp",
          body: s.body,
          attachmentUrl: s.attachmentUrl || null,
          attachmentName: s.attachmentName || null,
        }))
      );
    }
    return seq;
  }

  static async list(organizationId: string) {
    const rows = await db.select().from(sequences).where(eq(sequences.organizationId, organizationId)).orderBy(asc(sequences.createdAt));
    return Promise.all(
      rows.map(async (s) => {
        const [{ steps }] = await db.select({ steps: sql<number>`count(*)::int` }).from(sequenceSteps).where(eq(sequenceSteps.sequenceId, s.id));
        const [{ active }] = await db
          .select({ active: sql<number>`count(*)::int` })
          .from(sequenceEnrollments)
          .where(and(eq(sequenceEnrollments.sequenceId, s.id), eq(sequenceEnrollments.status, "active")));
        return { ...s, stepCount: steps, activeEnrollments: active };
      })
    );
  }

  static async getWithSteps(sequenceId: string, organizationId: string) {
    const [seq] = await db.select().from(sequences).where(and(eq(sequences.id, sequenceId), eq(sequences.organizationId, organizationId)));
    if (!seq) return null;
    const steps = await db.select().from(sequenceSteps).where(eq(sequenceSteps.sequenceId, sequenceId)).orderBy(asc(sequenceSteps.stepIndex));
    return {
      id: seq.id,
      name: seq.name,
      description: seq.description ?? "",
      steps: steps.map((s) => ({
        dayOffset: s.dayOffset,
        channel: s.channel as "whatsapp" | "email",
        body: s.body,
        attachmentUrl: s.attachmentUrl ?? null,
        attachmentName: s.attachmentName ?? null,
      })),
    };
  }

  // Read-only detail: sequence + steps with the count of active enrollments sitting on each step,
  // plus the enrollment funnel (in-sequence / completed / removed).
  static async getDetail(sequenceId: string, organizationId: string) {
    const [seq] = await db.select().from(sequences).where(and(eq(sequences.id, sequenceId), eq(sequences.organizationId, organizationId)));
    if (!seq) return null;
    const steps = await db.select().from(sequenceSteps).where(eq(sequenceSteps.sequenceId, sequenceId)).orderBy(asc(sequenceSteps.stepIndex));

    const funnelRows = await db
      .select({ status: sequenceEnrollments.status, n: sql<number>`count(*)::int` })
      .from(sequenceEnrollments)
      .where(eq(sequenceEnrollments.sequenceId, sequenceId))
      .groupBy(sequenceEnrollments.status);
    const funnel = { active: 0, completed: 0, stopped: 0 } as Record<string, number>;
    for (const r of funnelRows) funnel[r.status] = r.n;

    const stepRows = await db
      .select({ step: sequenceEnrollments.currentStep, n: sql<number>`count(*)::int` })
      .from(sequenceEnrollments)
      .where(and(eq(sequenceEnrollments.sequenceId, sequenceId), eq(sequenceEnrollments.status, "active")))
      .groupBy(sequenceEnrollments.currentStep);
    const perStep = new Map<number, number>(stepRows.map((r) => [r.step, r.n]));

    return {
      id: seq.id,
      name: seq.name,
      description: seq.description ?? "",
      isActive: seq.isActive,
      funnel: { active: funnel.active, completed: funnel.completed, removed: funnel.stopped },
      steps: steps.map((s) => ({
        stepIndex: s.stepIndex,
        dayOffset: s.dayOffset,
        channel: s.channel as "whatsapp" | "email",
        body: s.body,
        attachmentUrl: s.attachmentUrl,
        attachmentName: s.attachmentName,
        clients: perStep.get(s.stepIndex) ?? 0,
      })),
    };
  }

  // Edit a sequence: rename + replace its steps wholesale. Active enrollments keep their
  // current step index; the new step list applies to what they run from here on.
  static async update(organizationId: string, sequenceId: string, name: string, steps: SequenceStepInput[], description?: string | null) {
    const [seq] = await db.select({ id: sequences.id }).from(sequences).where(and(eq(sequences.id, sequenceId), eq(sequences.organizationId, organizationId)));
    if (!seq) throw new Error("Sequence not found");
    await db.update(sequences).set({ name, description: description ?? null }).where(eq(sequences.id, sequenceId));
    await db.delete(sequenceSteps).where(eq(sequenceSteps.sequenceId, sequenceId));
    if (steps.length) {
      await db.insert(sequenceSteps).values(
        steps.map((s, i) => ({
          sequenceId,
          stepIndex: i,
          dayOffset: Math.max(0, Math.floor(s.dayOffset)),
          channel: s.channel === "email" ? "email" : "whatsapp",
          body: s.body,
          attachmentUrl: s.attachmentUrl || null,
          attachmentName: s.attachmentName || null,
        }))
      );
    }
    return { id: sequenceId };
  }

  // Enroll a single lead from the automation engine — resolves the lead's org, then enrolls it into
  // the sequence (org-checked). Used by the enroll_in_sequence automation action.
  static async enrollFromAutomation(sequenceId: string, leadId: string) {
    const [lead] = await db.select({ organizationId: leads.organizationId }).from(leads).where(eq(leads.id, leadId));
    if (!lead?.organizationId) return { enrolled: 0 };
    return this.enroll(lead.organizationId, sequenceId, [leadId]);
  }

  static async listForLead(leadId: string) {
    return db
      .select({
        enrollmentId: sequenceEnrollments.id,
        sequenceId: sequences.id,
        name: sequences.name,
        status: sequenceEnrollments.status,
        currentStep: sequenceEnrollments.currentStep,
        nextRunAt: sequenceEnrollments.nextRunAt,
      })
      .from(sequenceEnrollments)
      .innerJoin(sequences, eq(sequenceEnrollments.sequenceId, sequences.id))
      .where(eq(sequenceEnrollments.leadId, leadId));
  }

  // Enroll leads at step 0; the first step fires on the next scan (dayOffset 0) or later.
  static async enroll(organizationId: string, sequenceId: string, leadIds: string[]) {
    if (leadIds.length === 0) return { enrolled: 0 };
    const [seq] = await db.select().from(sequences).where(and(eq(sequences.id, sequenceId), eq(sequences.organizationId, organizationId)));
    if (!seq) throw new Error("Sequence not found");
    if (!seq.isActive) throw new Error("Sequence is paused");
    const steps = await db.select().from(sequenceSteps).where(eq(sequenceSteps.sequenceId, sequenceId)).orderBy(asc(sequenceSteps.stepIndex));
    if (steps.length === 0) throw new Error("Sequence has no steps");

    // Enforce tenant isolation on enrolled leadIds; never enroll soft-deleted (recycle-bin) leads.
    const { inArray } = await import("drizzle-orm");
    const validLeads = await db
      .select({ id: leads.id })
      .from(leads)
      .where(and(eq(leads.organizationId, organizationId), isNull(leads.deletedAt), inArray(leads.id, leadIds)));
    const validLeadIds = validLeads.map((l) => l.id);

    let enrolled = 0;
    for (const leadId of validLeadIds) {
      const [existing] = await db
        .select({ id: sequenceEnrollments.id })
        .from(sequenceEnrollments)
        .where(and(eq(sequenceEnrollments.sequenceId, sequenceId), eq(sequenceEnrollments.leadId, leadId), eq(sequenceEnrollments.status, "active")));
      if (existing) continue;
      const nextRunAt = new Date(Date.now() + steps[0].dayOffset * DAY);
      await db.insert(sequenceEnrollments).values({ sequenceId, leadId, organizationId, currentStep: 0, status: "active", nextRunAt });
      enrolled++;
    }
    return { enrolled };
  }

  // Pause/resume a whole sequence. Paused sequences accept no new enrollments and deliver no steps.
  static async setActive(organizationId: string, sequenceId: string, isActive: boolean) {
    const [row] = await db
      .update(sequences)
      .set({ isActive })
      .where(and(eq(sequences.id, sequenceId), eq(sequences.organizationId, organizationId)))
      .returning({ id: sequences.id, isActive: sequences.isActive });
    return row ?? null;
  }

  // Deletes a sequence; its steps and enrollments cascade via their foreign keys.
  static async delete(organizationId: string, sequenceId: string) {
    await db.delete(sequences).where(and(eq(sequences.id, sequenceId), eq(sequences.organizationId, organizationId)));
    return { ok: true };
  }

  static async stop(organizationId: string, enrollmentId: string) {
    await db
      .update(sequenceEnrollments)
      .set({ status: "stopped", nextRunAt: null })
      .where(and(eq(sequenceEnrollments.id, enrollmentId), eq(sequenceEnrollments.organizationId, organizationId)));
    return { ok: true };
  }

  // Stop every active enrollment for a lead — used when the lead replies or converts, so a drip
  // never keeps messaging someone who's already responded. Best-effort; returns how many stopped.
  static async stopForLead(leadId: string, reason?: string): Promise<{ stopped: number }> {
    const rows = await db
      .update(sequenceEnrollments)
      .set({ status: "stopped", nextRunAt: null })
      .where(and(eq(sequenceEnrollments.leadId, leadId), eq(sequenceEnrollments.status, "active")))
      .returning({ id: sequenceEnrollments.id });
    if (rows.length > 0 && reason) {
      await ActivityService.addActivity({ leadId, type: "note", content: `Sequence stopped — ${reason}.` }).catch(() => {});
    }
    return { stopped: rows.length };
  }

  // Scan worker entry point: deliver every due step, then advance or complete the enrolment.
  // Only enrollments of ACTIVE (non-paused) sequences run.
  static async runDue(limit = 200): Promise<{ processed: number }> {
    const now = new Date();
    const MAX_RETRIES = 3;
    const CLAIM_LEASE_MS = 15 * 60 * 1000; // if a worker crashes mid-send, the row frees after this

    const due = await db
      .select({
        id: sequenceEnrollments.id,
        sequenceId: sequenceEnrollments.sequenceId,
        leadId: sequenceEnrollments.leadId,
        currentStep: sequenceEnrollments.currentStep,
        retryCount: sequenceEnrollments.retryCount,
        createdAt: sequenceEnrollments.createdAt,
        nextRunAt: sequenceEnrollments.nextRunAt,
      })
      .from(sequenceEnrollments)
      .innerJoin(sequences, eq(sequenceEnrollments.sequenceId, sequences.id))
      .where(and(eq(sequenceEnrollments.status, "active"), eq(sequences.isActive, true), lte(sequenceEnrollments.nextRunAt, now)))
      .limit(limit);

    let processed = 0;
    for (const enr of due) {
      // Atomic claim: push nextRunAt to a lease in the future only if it's still the value we read.
      // A second concurrent scan (or worker) sees the future value and its WHERE no longer matches,
      // so exactly one worker delivers each step. On crash, the lease expires and it retries.
      const claimed = await db
        .update(sequenceEnrollments)
        .set({ nextRunAt: new Date(now.getTime() + CLAIM_LEASE_MS) })
        .where(and(eq(sequenceEnrollments.id, enr.id), eq(sequenceEnrollments.status, "active"), lte(sequenceEnrollments.nextRunAt, now)))
        .returning({ id: sequenceEnrollments.id });
      if (claimed.length === 0) continue; // someone else claimed it

      // Skip (and stop) enrollments whose lead was soft-deleted (recycle bin / forward-only lead).
      const [leadRow] = await db.select({ deletedAt: leads.deletedAt }).from(leads).where(eq(leads.id, enr.leadId)).limit(1);
      if (!leadRow || leadRow.deletedAt) {
        await db.update(sequenceEnrollments).set({ status: "stopped", nextRunAt: null }).where(eq(sequenceEnrollments.id, enr.id));
        continue;
      }

      const steps = await db.select().from(sequenceSteps).where(eq(sequenceSteps.sequenceId, enr.sequenceId)).orderBy(asc(sequenceSteps.stepIndex));
      const step = steps[enr.currentStep];
      if (!step) {
        await db.update(sequenceEnrollments).set({ status: "completed", nextRunAt: null }).where(eq(sequenceEnrollments.id, enr.id));
        continue;
      }

      const res = await this.deliver(enr.leadId, step.channel, step.body, step.attachmentUrl, step.attachmentName);

      // Transient failure (provider/network) → retry with backoff, don't advance, up to MAX_RETRIES.
      if (!res.sent && !res.permanent && enr.retryCount + 1 < MAX_RETRIES) {
        const backoff = new Date(now.getTime() + (enr.retryCount + 1) * 10 * 60 * 1000);
        await db.update(sequenceEnrollments).set({ retryCount: enr.retryCount + 1, nextRunAt: backoff }).where(eq(sequenceEnrollments.id, enr.id));
        continue;
      }

      // Sent, permanently un-sendable (no email/phone/BSP), or out of retries → advance. Leave a
      // manual-send note when nothing actually went out so the rep can follow up.
      if (!res.sent) {
        await ActivityService.addActivity({
          leadId: enr.leadId,
          type: "note",
          content: `Sequence step (${step.channel}) not sent — ${res.reason ?? "send manually"}.`,
        }).catch(() => {});
      } else {
        processed++;
      }

      const nextIndex = enr.currentStep + 1;
      if (steps[nextIndex]) {
        const nextRunAt = new Date(new Date(enr.createdAt).getTime() + steps[nextIndex].dayOffset * DAY);
        await db.update(sequenceEnrollments).set({ currentStep: nextIndex, retryCount: 0, nextRunAt }).where(eq(sequenceEnrollments.id, enr.id));
      } else {
        await db.update(sequenceEnrollments).set({ status: "completed", retryCount: 0, nextRunAt: null }).where(eq(sequenceEnrollments.id, enr.id));
      }
    }
    return { processed };
  }

  // Attempt one send. Returns whether it sent; `permanent` = can't ever send as-is (no email/phone,
  // BSP not configured) so the caller should advance; otherwise it's transient and worth a retry.
  private static async deliver(
    leadId: string,
    channel: string,
    body: string,
    attachmentUrl?: string | null,
    attachmentName?: string | null,
  ): Promise<{ sent: boolean; permanent: boolean; reason?: string }> {
    const [lead] = await db.select().from(leads).where(eq(leads.id, leadId));
    if (!lead) return { sent: false, permanent: true, reason: "lead not found" };
    const rendered = renderTokens(body, lead);
    const label = attachmentName || "Attachment";
    try {
      if (channel === "email") {
        if (!lead.email) return { sent: false, permanent: true, reason: "no email address" };
        const { sendEmail } = await import("@/lib/mail/mailer");
        const attachHtml = attachmentUrl ? `<p>📎 <a href="${attachmentUrl}">${label}</a></p>` : "";
        await sendEmail({ to: lead.email, subject: "Following up", html: `<p>${rendered.replace(/\n/g, "<br/>")}</p>${attachHtml}` }, lead.organizationId ?? undefined);
        await ActivityService.addActivity({ leadId, type: "email", content: `[sequence email] ${rendered.slice(0, 120)}` });
      } else {
        if (!lead.phone) return { sent: false, permanent: true, reason: "no phone number" };
        const { WhatsAppService } = await import("@/lib/messaging/whatsapp/service");
        const waBody = attachmentUrl ? `${rendered}\n\n📎 ${label}: ${attachmentUrl}` : rendered;
        await WhatsAppService.send({ leadId, body: waBody });
        await ActivityService.addActivity({ leadId, type: "whatsapp", content: `[sequence whatsapp] ${rendered.slice(0, 120)}` });
      }
      return { sent: true, permanent: false };
    } catch (e) {
      const msg = (e as Error)?.message ?? "";
      // BSP not configured (personal WhatsApp mode) is permanent for automated sends, not transient.
      const permanent = /not configured|no email|no phone/i.test(msg);
      return { sent: false, permanent, reason: msg.slice(0, 160) || "send failed" };
    }
  }
}
