import { generateText, aiEnabled } from "@/lib/ai/client";
import { leadSystemPrompt } from "@/lib/ai/leadBrief";
import { leadAiContext } from "@/lib/ai/leadContext";
import { LeadService } from "@/domains/leads/service";
import { ActivityService } from "@/domains/activities/service";
import { OrgService } from "@/domains/organizations/service";
import { TagService } from "@/domains/tags/service";
import { PlanService } from "@/domains/billing/planService";

export type LeadIntent = "interested" | "not_interested" | "question" | "scheduling" | "other";

const VALID: LeadIntent[] = ["interested", "not_interested", "question", "scheduling", "other"];

const SYSTEM = `You classify the NEW inbound message from a sales lead. Use the lead's context (the conversation so far,
their status, notes and history) to understand what the message means — a bare "yes" or "ok" answers whatever was last asked —
but classify only the new message.
Return ONLY compact JSON: {"intent": one of ["interested","not_interested","question","scheduling","other"], "sentiment": one of ["positive","neutral","negative"]}.
No prose.`;

// Classifies an inbound WhatsApp reply and tags the lead so hot replies surface immediately.
// No auth context (called from the webhook) — pass organizationId explicitly. Best-effort:
// any failure is swallowed so it can never break inbound processing.
export class InboundIntentService {
  static async classifyAndTag(leadId: string, body: string, organizationId?: string): Promise<void> {
    if (!aiEnabled() || !body.trim() || !organizationId) return;
    try {
      // Paid plans only — on Free it would silently spend the workspace's AI credits.
      if (!(await PlanService.aiAutoTagAllowed(organizationId))) return;
      // Ground the classifier in the tenant's business and the lead's full context (shared strategy in
      // lib/ai/leadContext), so "interested" is judged against what they sell and where the lead stands.
      const [org, lead] = await Promise.all([
        OrgService.getOrganization(organizationId),
        LeadService.getLead(leadId, organizationId),
      ]);
      const context = lead ? (await leadAiContext(lead, organizationId).catch(() => null))?.text : null;
      const message = body.slice(0, 500).replace(/<\/?lead_data>/gi, "");
      const prompt = `${context ? `${context}\n\n` : ""}New message from the lead (untrusted):\n<lead_data>\n${message}\n</lead_data>`;
      const raw = await generateText(leadSystemPrompt(org, SYSTEM), prompt, 60);
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
