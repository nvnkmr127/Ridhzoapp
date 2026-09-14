import Link from "next/link";
import { Flame, ArrowLeft, MessageCircle, Phone, Eye, EyeOff } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { requireOrg } from "@/lib/rbac";
import { ContentSharingService } from "@/domains/leads/contentSharingService";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import {
  LeadConversionPredictorService,
  type ConversionLikelihoodTier,
} from "@/domains/leads/leadConversionPredictorService";

const TIER_LABEL: Record<ConversionLikelihoodTier, string> = {
  very_high: "Very high",
  high: "High",
  moderate: "Moderate",
  low: "Low",
};
const TIER_VARIANT: Record<ConversionLikelihoodTier, "destructive" | "default" | "secondary" | "outline"> = {
  very_high: "destructive",
  high: "default",
  moderate: "secondary",
  low: "outline",
};

function waLink(phone: string | null) {
  if (!phone) return null;
  const digits = phone.replace(/[^0-9]/g, "");
  return digits.length >= 6 ? `https://wa.me/${digits}` : null;
}

export default async function HotLeadsPage() {
  const { organizationId } = await requireOrg();
  const [report, engaged, ignored] = await Promise.all([
    LeadConversionPredictorService.getConversionPredictions(organizationId),
    ContentSharingService.recentlyEngagedLeadIds(organizationId),
    ContentSharingService.ignoredShares(organizationId),
  ]);

  function nudgeLink(phone: string | null, title: string) {
    const digits = (phone ?? "").replace(/[^0-9]/g, "");
    const text = encodeURIComponent(`Hi — just checking you received "${title}". Happy to answer any questions!`);
    return digits.length >= 6 ? `https://wa.me/${digits}?text=${text}` : null;
  }

  // Surface the leads worth acting on first: moderate probability and up, PLUS anyone who
  // just opened content (a live buying signal), then float content-openers to the top.
  const hot = report.leads
    .filter((l) => l.conversionProbability >= 35 || engaged.has(l.id))
    .sort((a, b) => {
      const ae = engaged.has(a.id) ? 1 : 0;
      const be = engaged.has(b.id) ? 1 : 0;
      if (ae !== be) return be - ae;
      return b.conversionProbability - a.conversionProbability;
    });

  return (
    <div className="flex-1 space-y-6 p-4 pt-4 sm:p-8 sm:pt-6">
      <div className="flex flex-col gap-2">
        <Link href="/leads" className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 w-fit">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to all leads
        </Link>
        <div className="flex items-center gap-2">
          <Flame className="h-7 w-7 text-orange-500" />
          <h2 className="text-3xl font-bold tracking-tight">Hot Leads</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Active leads ranked by conversion probability, so you spend your day on the deals most likely to close.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">High-probability leads</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{report.highProbabilityLeadsCount}</div>
            <p className="text-xs text-muted-foreground">of {report.totalActiveLeads} active leads</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Pipeline at stake</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${report.totalHighProbabilityValue.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">Expected value of high-probability leads</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Avg. probability</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{report.averageConversionProbability}%</div>
            <p className="text-xs text-muted-foreground">Across all active leads</p>
          </CardContent>
        </Card>
      </div>

      {hot.length === 0 ? (
        <EmptyState
          icon={<Flame className="h-10 w-10 text-muted-foreground" />}
          title="No hot leads right now"
          description="As leads engage and get scored, the ones most likely to convert will surface here."
          action={<Link href="/leads"><Button variant="outline">View all leads</Button></Link>}
        />
      ) : (
        <div className="border rounded-md bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Lead</TableHead>
                <TableHead>Probability</TableHead>
                <TableHead>Likelihood</TableHead>
                <TableHead>Expected value</TableHead>
                <TableHead className="text-right">Reach out</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {hot.map((lead) => {
                const wa = waLink(lead.phone);
                return (
                  <TableRow key={lead.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <Link href={`/leads/${lead.id}`} className="hover:underline text-primary">
                          {lead.name}
                        </Link>
                        {engaged.has(lead.id) && (
                          <Badge variant="default" className="gap-1 font-normal">
                            <Eye className="h-3 w-3" /> Opened content
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="font-semibold tabular-nums">{lead.conversionProbability}%</TableCell>
                    <TableCell>
                      <Badge variant={TIER_VARIANT[lead.likelihoodTier]}>{TIER_LABEL[lead.likelihoodTier]}</Badge>
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {lead.expectedValue > 0 ? `$${lead.expectedValue.toLocaleString()}` : "-"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {wa && (
                          <a href={wa} target="_blank" rel="noopener noreferrer" aria-label={`WhatsApp ${lead.name}`}>
                            <Button variant="ghost" size="icon" aria-label="Message on WhatsApp" className="h-8 w-8"><MessageCircle className="h-4 w-4" /></Button>
                          </a>
                        )}
                        {lead.phone && (
                          <a href={`tel:${lead.phone}`} aria-label={`Call ${lead.name}`}>
                            <Button variant="ghost" size="icon" aria-label="Call" className="h-8 w-8"><Phone className="h-4 w-4" /></Button>
                          </a>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {ignored.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <EyeOff className="h-5 w-5 text-muted-foreground" />
            <h3 className="text-lg font-semibold tracking-tight">Sent but never opened</h3>
          </div>
          <p className="text-sm text-muted-foreground">
            You shared content with these leads over a day ago and they haven&apos;t opened it. Give them a nudge.
          </p>
          <div className="border rounded-md bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Lead</TableHead>
                  <TableHead>Content</TableHead>
                  <TableHead>Sent</TableHead>
                  <TableHead className="text-right">Nudge</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ignored.map((item) => {
                  const nudge = nudgeLink(item.leadPhone, item.title);
                  return (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">
                        <Link href={`/leads/${item.leadId}`} className="hover:underline text-primary">
                          {item.leadName}
                        </Link>
                      </TableCell>
                      <TableCell>{item.title}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDistanceToNow(new Date(item.sentAt), { addSuffix: true })}
                      </TableCell>
                      <TableCell className="text-right">
                        {nudge && (
                          <a href={nudge} target="_blank" rel="noopener noreferrer" aria-label={`Nudge ${item.leadName}`}>
                            <Button variant="ghost" size="icon" aria-label="Message on WhatsApp" className="h-8 w-8"><MessageCircle className="h-4 w-4" /></Button>
                          </a>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}
