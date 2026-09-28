import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { aiKnowledgeDocs, leadSources } from "@/db/schema";
import { OrgService } from "@/domains/organizations/service";
import { pickKnowledge } from "@/lib/ai/businessProfile";
import type { BusinessLike } from "@/lib/ai/leadBrief";

type Org = NonNullable<Awaited<ReturnType<typeof OrgService.getOrganization>>>;

// The org as the AI prompts see it: its row, plus the note for the lead's source and the knowledge
// snippets most relevant to `query` (the lead's context, or the user's question).
export async function loadAiBusiness(
  organizationId: string,
  opts: { sourceId?: string | null; query?: string } = {},
): Promise<Org & Pick<BusinessLike, "sourceContext" | "knowledge">> {
  const [org, source, docs] = await Promise.all([
    OrgService.getOrganization(organizationId),
    opts.sourceId
      ? db
          .select({ aiContext: leadSources.aiContext })
          .from(leadSources)
          .where(and(eq(leadSources.id, opts.sourceId), eq(leadSources.organizationId, organizationId)))
          .limit(1)
          .then((r) => r[0])
      : undefined,
    db
      .select({ title: aiKnowledgeDocs.title, content: aiKnowledgeDocs.content })
      .from(aiKnowledgeDocs)
      .where(eq(aiKnowledgeDocs.organizationId, organizationId))
      .orderBy(desc(aiKnowledgeDocs.createdAt))
      .limit(20),
  ]);
  if (!org) throw new Error("Organization not found");
  return { ...org, sourceContext: source?.aiContext ?? null, knowledge: pickKnowledge(docs, opts.query ?? "") || null };
}
