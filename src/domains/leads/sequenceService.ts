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
  static async runDue(limit = 200): Promise<{ processed: number }> {
    const due = await db
      .select()
      .from(sequenceEnrollments)
      .where(and(eq(sequenceEnrollments.status, "active"), lte(sequenceEnrollments.nextRunAt, new Date())))
      .limit(limit);

    let processed = 0;
    for (const enr of due) {
      // Skip (and stop) enrollments whose lead was soft-deleted — e.g. a forward-only "don't save"
      // lead or one sent to the recycle bin — so the bin never keeps receiving drip steps.
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
      await this.deliver(enr.leadId, step.channel, step.body, step.attachmentUrl, step.attachmentName);
      processed++;

      const nextIndex = enr.currentStep + 1;
      if (steps[nextIndex]) {
        const nextRunAt = new Date(new Date(enr.createdAt).getTime() + steps[nextIndex].dayOffset * DAY);
        await db.update(sequenceEnrollments).set({ currentStep: nextIndex, nextRunAt }).where(eq(sequenceEnrollments.id, enr.id));
      } else {
        await db.update(sequenceEnrollments).set({ status: "completed", nextRunAt: null }).where(eq(sequenceEnrollments.id, enr.id));
      }
    }
    return { processed };
  }

  // Best-effort send. A failure (no BSP window, no email) must not stall the drip — we log a
  // manual-send nudge on the timeline and let the enrolment advance on schedule.
  private static async deliver(leadId: string, channel: string, body: string, attachmentUrl?: string | null, attachmentName?: string | null) {
    const [lead] = await db.select().from(leads).where(eq(leads.id, leadId));
    if (!lead) return;
    const rendered = renderTokens(body, lead);
    const label = attachmentName || "Attachment";
    try {
      if (channel === "email") {
        if (!lead.email) throw new Error("no email");
        const { sendEmail } = await import("@/lib/mail/mailer");
        const attachHtml = attachmentUrl ? `<p>📎 <a href="${attachmentUrl}">${label}</a></p>` : "";
        await sendEmail({ to: lead.email, subject: "Following up", html: `<p>${rendered.replace(/\n/g, "<br/>")}</p>${attachHtml}` }, lead.organizationId ?? undefined);
        await ActivityService.addActivity({ leadId, type: "email", content: `[sequence email] ${rendered.slice(0, 120)}` });
      } else {
        const { WhatsAppService } = await import("@/lib/messaging/whatsapp/service");
        // WhatsApp text send: append the attachment link inline (no media upload path yet).
        const waBody = attachmentUrl ? `${rendered}\n\n📎 ${label}: ${attachmentUrl}` : rendered;
        await WhatsAppService.send({ leadId, body: waBody });
        await ActivityService.addActivity({ leadId, type: "whatsapp", content: `[sequence whatsapp] ${rendered.slice(0, 120)}` });
      }
    } catch {
      await ActivityService.addActivity({
        leadId,
        type: "note",
        content: `Sequence step due (${channel}) — send manually: ${rendered.slice(0, 160)}`,
      });
    }
  }
}
