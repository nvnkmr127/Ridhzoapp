"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/rbac";
import { getActionableLead } from "@/lib/leads/access";
import { actionFail } from "@/lib/actions/result";
import { markAiSuggestionDone, type RecapCache } from "@/lib/ai/leadAssist";
import { visiblePlan } from "@/lib/ai/leadPlan";
import { executeNextAction, type ExecuteAnswer, type ExecuteResult } from "@/lib/ai/leadSuggestions";

const answerSchema = z.object({
  subject: z.string().trim().max(255).optional(),
  ownerId: z.guid().optional(),
  share: z
    .object({
      targetUrl: z.string().trim().max(2048).optional(),
      bodyText: z.string().trim().max(5000).optional(),
      imageUrl: z.string().trim().max(2048).optional(),
    })
    .optional(),
  meetingOutcome: z
    .object({
      status: z.enum(["completed", "no_show", "cancelled"]),
      outcome: z.string().trim().max(2000).nullish(),
      nextFollowUpAt: z.string().nullish(),
    })
    .optional(),
});

const executeSchema = z.object({
  leadId: z.guid(),
  id: z.string().min(1).max(40),
  /** Outbound only. Without it the call returns the draft to review instead of sending. */
  confirm: z.boolean().optional(),
  answer: answerSchema.optional(),
});

/**
 * Carries out one of the AI's next actions for a lead — the same `NextAction` the rule engine emits,
 * so "what should I do, why, and can Ridhzo do it" is one button rather than two vocabularies.
 *
 * The action is never taken from the caller: it is read back from the plan saved with the recap, so
 * a client cannot ask for a status change or an outbound send the AI never proposed. `id` selects it
 * and nothing else.
 *
 * Returns a `prompt` instead of finishing the work when the server cannot do it alone — a message to
 * review, a meeting outcome only the rep knows, an owner to choose. That is one round trip, not a
 * dead end: the caller shows the dialog and calls again with `confirm` or `answer`.
 */
export async function executeAiActionAction(data: unknown): Promise<ExecuteResult> {
  const parsed = executeSchema.safeParse(data);
  if (!parsed.success) return { ok: false, code: "VALIDATION", message: "That action is no longer valid — refresh the recap." };
  const { leadId, id, confirm, answer } = parsed.data;

  try {
    await requirePermission("leads.edit");
    const access = await getActionableLead(leadId);
    if (!access) return { ok: false, code: "NOT_FOUND", message: "This lead no longer exists or was moved." };

    const cd = (access.lead.customData as Record<string, unknown> | null) ?? {};
    const saved = cd._aiRecap as RecapCache | undefined;
    const action = visiblePlan(saved?.plan, saved?.dismissed).next;
    if (!action || action.id !== id) {
      return { ok: false, code: "NOT_FOUND", message: "That suggestion is out of date — refresh the AI recap." };
    }

    const res = await executeNextAction({
      lead: access.lead,
      organizationId: access.organizationId,
      userId: access.userId,
      action,
      confirm,
      answer: answer as ExecuteAnswer | undefined,
    });
    // Only a completed action retires the suggestion — a prompt means it is still live.
    if ("prompt" in res) return res;

    await markAiSuggestionDone(leadId, access.organizationId, id);
    revalidatePath("/leads");
    revalidatePath(`/leads/${leadId}`);
    return res;
  } catch (e) {
    const res = actionFail(e);
    return { ok: false, code: res.code, message: res.message };
  }
}