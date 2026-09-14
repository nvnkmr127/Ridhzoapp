import Link from "next/link";
import { Sparkles, MessageCircle, Phone } from "lucide-react";
import { requireOrg } from "@/lib/rbac";
import { LeadService } from "@/domains/leads/service";
import { ContentSharingService } from "@/domains/leads/contentSharingService";
import { NextBestActionService, type ActionPriority } from "@/domains/leads/nextBestActionService";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const PRIORITY_VARIANT: Record<ActionPriority, "destructive" | "default" | "secondary"> = {
  high: "destructive",
  medium: "default",
  low: "secondary",
};

function waLink(phone: string | null, label: string) {
  const digits = (phone ?? "").replace(/[^0-9]/g, "");
  const text = encodeURIComponent(label);
  return digits.length >= 6 ? `https://wa.me/${digits}?text=${text}` : null;
}

// Server component: the AI/rules-driven "do this next" panel. Reuses the per-lead
// NextBestAction engine, aggregated org-wide, floating content-openers to the top.
export async function PriorityActions() {
  const { organizationId } = await requireOrg();
  const engaged = await ContentSharingService.recentlyEngagedLeadIds(organizationId);
  // Only leads that can plausibly be high-priority are fetched + scored (not every lead in the org).
  const data = await LeadService.listPriorityCandidates(organizationId, [...engaged]);

  const scored = data.map((l) => {
    const isEngaged = engaged.has(l.id);
    const nba = NextBestActionService.getRecommendation({
      status: l.status,
      score: l.score ?? 0,
      phone: l.phone,
      email: l.email,
      lastContactedAt: l.lastContactedAt ?? null,
      nextFollowUpAt: l.nextFollowUpAt ?? null,
      recentContentOpen: isEngaged ? { title: "your shared content", count: 1 } : null,
    });
    return { lead: l, nba, isEngaged };
  });

  const top = scored
    .filter((s) => s.nba.priority === "high")
    .sort((a, b) => {
      if (a.isEngaged !== b.isEngaged) return a.isEngaged ? -1 : 1;
      return (b.lead.score ?? 0) - (a.lead.score ?? 0);
    })
    .slice(0, 6);

  if (top.length === 0) return null;

  return (
    <div className="rounded-2xl border bg-card p-6">
      <div className="mb-4 flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500/10">
          <Sparkles className="h-4 w-4 text-violet-500" />
        </div>
        <div>
          <h3 className="text-lg font-medium leading-none">Today&apos;s priorities</h3>
          <p className="mt-1 text-xs text-muted-foreground">Your next best actions, ranked by buying signal.</p>
        </div>
      </div>
      <ul className="divide-y divide-border">
        {top.map(({ lead, nba }) => {
          const wa = waLink(lead.phone, `Hi ${lead.name || "there"} — following up with you.`);
          return (
            <li key={lead.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Link href={`/leads/${lead.id}`} className="truncate font-medium hover:underline">
                    {lead.name || "Unnamed lead"}
                  </Link>
                  <Badge variant={PRIORITY_VARIANT[nba.priority]} className="font-normal">
                    {nba.label}
                  </Badge>
                </div>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">{nba.reason}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {wa && (
                  <Button asChild variant="outline" size="sm">
                    <a href={wa} target="_blank" rel="noopener noreferrer">
                      <MessageCircle className="h-4 w-4" /> WhatsApp
                    </a>
                  </Button>
                )}
                {lead.phone && (
                  <Button asChild variant="ghost" size="sm">
                    <a href={`tel:${lead.phone}`}>
                      <Phone className="h-4 w-4" /> Call
                    </a>
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
