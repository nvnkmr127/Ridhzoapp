import { generateText, aiEnabled } from "@/lib/ai/client";
import { businessPreamble } from "@/lib/ai/leadBrief";
import { ActivityService } from "@/domains/activities/service";
import { OrgService } from "@/domains/organizations/service";
import { TagService } from "@/domains/tags/service";
import { PlanService } from "@/domains/billing/planService";

export type LeadIntent = "interested" | "not_interested" | "question" | "scheduling" | "other";

const VALID: LeadIntent[] = ["interested", "not_interested", "question", "scheduling", "other"];

const SYSTEM = `You classify a single inbound message from a sales lead.
Return ONLY compact JSON: {"intent": one of ["interested","not_interested","question","scheduling","other"], "sentiment": one of ["positive","neutral","negative"]}.
No prose.`;

// Classifies an inbound WhatsApp reply and tags the lead so hot replies surface immediately.
// No auth context (called from the webhook) — pass organizationId explicitly. Best-effort:
// any failure is swallowed so it can never break inbound processing.
export class InboundIntentService {
  static async classifyAndTag(leadId: string, body: string, organizationId?: string): Promise<void> {
    if (!aiEnabled() || !body.trim() || !organizationId) return;
    try {
      // Paid-only; without an org we can't check the plan, so skip.
      if (!(await PlanService.aiAllowed(organizationId))) return;
      // Ground the classifier in the tenant's business so "interested" is judged against what they
      // actually sell.
      const org = await OrgService.getOrganization(organizationId);
      const system = org ? `${businessPreamble(org)}\n\n${SYSTEM}` : SYSTEM;
      const raw = await generateText(system, `Message: "${body.slice(0, 500)}"`, 60);
      if (!raw) return;
      const parsed = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));
      const intent: LeadIntent = VALID.includes(parsed.intent) ? parsed.intent : "other";
      const sentiment = ["positive", "neutral", "negative"].includes(parsed.sentiment) ? parsed.sentiment : "neutral";

      await ActivityService.addActivity({
        leadId,
        type: "note",
        content: `AI read the reply — intent: ${intent.replace("_", " ")}, sentiment: ${sentiment}.`,
      });
      // Tag so replies are filterable/segmentable; interested/scheduling are the buying signals.
      if (organizationId) {
        await TagService.addToLead(leadId, `intent:${intent}`, organizationId).catch(() => {});
      }
    } catch {
      /* best-effort classification */
    }
  }
}
