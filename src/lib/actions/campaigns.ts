"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { assertWritable } from "@/lib/rbac";
import { ActivityService } from "@/domains/activities/service";
import { ok, fail, actionFail } from "@/lib/actions/result";

const schema = z.object({
  leadIds: z.array(z.guid()).min(1).max(500),
  body: z.string().min(1).max(2000),
});

// Bulk WhatsApp send to selected leads (a campaign). BSP path; a per-lead failure (e.g. no
// 24h window in BSP mode, or no phone) is counted, never aborts the batch. In personal mode
// auto-send isn't possible, so failures fall back to a logged nudge on each lead's timeline.
export async function sendCampaignAction(input: unknown) {
  const { userId } = await assertWritable();
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return fail("VALIDATION", "Select up to 500 leads and enter a message (max 2,000 characters).");
  }
  const { leadIds, body } = parsed.data;

  try {
    const { WhatsAppService } = await import("@/lib/messaging/whatsapp/service");

    let sent = 0;
    let failed = 0;
    for (const leadId of leadIds) {
      try {
        await WhatsAppService.send({ leadId, body, userId });
        sent++;
      } catch {
        failed++;
        await ActivityService.addActivity({
          leadId,
          userId,
          type: "note",
          content: `Campaign message queued for manual send: ${body.slice(0, 160)}`,
        });
      }
    }
    revalidatePath("/leads");
    return ok({ sent, failed, total: leadIds.length });
  } catch (e) {
    return actionFail(e);
  }
}
