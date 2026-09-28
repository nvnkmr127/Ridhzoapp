import Link from "next/link";
import { Snowflake, ArrowLeft, MessageCircle, Phone } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { requireOrg, hasPermission } from "@/lib/rbac";
import { StaleLeadReclamationService } from "@/domains/leads/staleLeadReclamationService";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { ReclaimStaleButton } from "@/components/leads/ReclaimStaleButton";

function waLink(phone: string | null, name: string) {
  const digits = (phone ?? "").replace(/[^0-9]/g, "");
  const text = encodeURIComponent(`Hi ${name || "there"} — following up, wanted to make sure you didn't slip through the cracks. Any questions I can help with?`);
  return digits.length >= 6 ? `https://wa.me/${digits}?text=${text}` : null;
}

const PAGE_SIZE = 50;

export default async function ColdLeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string; page?: string }>;
}) {
  const [{ userId, organizationId }, isAdmin] = await Promise.all([
    requireOrg(),
    hasPermission("settings.manage"),
  ]);
  const sp = await searchParams;
  const days = Math.min(365, Math.max(1, Number(sp.days) || 14));
  const page = Math.max(1, Number(sp.page) || 1);
  const owner = isAdmin ? undefined : userId;
  // Most inactive first, one page at a time (this used to render every stale lead).
  const [stale, total] = await Promise.all([
    StaleLeadReclamationService.detectStaleLeads(organizationId, days, owner, { limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }),
    StaleLeadReclamationService.countStaleLeads(organizationId, days, owner),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageHref = (p: number) => `/leads/cold?days=${days}&page=${p}`;

  return (
    <div className="flex-1 space-y-6 p-4 pt-4 sm:p-8 sm:pt-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="icon" aria-label="Go back">
            <Link href="/leads">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold">
              <Snowflake className="h-6 w-6 text-sky-500" /> Going cold
            </h1>
            <p className="text-sm text-muted-foreground">
              New or active leads with no contact in {days}+ days. Reach out before they&apos;re gone.
            </p>
          </div>
        </div>
        {total > 0 && <ReclaimStaleButton days={days} />}
      </div>

      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="text-base">{total} cold {total === 1 ? "lead" : "leads"}</CardTitle>
        </CardHeader>
        <CardContent>
          {stale.length === 0 ? (
            <EmptyState
              icon={<Snowflake className="h-10 w-10 text-muted-foreground" />}
              title="No cold leads"
              description={`Every new or active lead has been contacted within ${days} days. Nice work.`}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Lead</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Inactive</TableHead>
                  <TableHead className="text-right">Reach out</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stale.map((l) => {
                  const wa = waLink(l.phone, l.name);
                  return (
                    <TableRow key={l.id}>
                      <TableCell>
                        <Link href={`/leads/${l.id}`} className="font-medium hover:underline">
                          {l.name || "Unnamed lead"}
                        </Link>
                        <div className="text-xs text-muted-foreground">{l.phone || l.email || "No contact info"}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{l.status}</Badge>
                      </TableCell>
                      <TableCell>
                        <span className="font-medium">{l.daysInactive}d</span>
                        <div className="text-xs text-muted-foreground">
                          {l.lastContactedAt
                            ? `last contact ${formatDistanceToNow(new Date(l.lastContactedAt), { addSuffix: true })}`
                            : `added ${formatDistanceToNow(new Date(l.createdAt), { addSuffix: true })}, never contacted`}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          {wa && (
                            <Button asChild variant="outline" size="sm">
                              <a href={wa} target="_blank" rel="noopener noreferrer">
                                <MessageCircle className="h-4 w-4" /> WhatsApp
                              </a>
                            </Button>
                          )}
                          {l.phone && (
                            <Button asChild variant="ghost" size="sm">
                              <a href={`tel:${l.phone}`}>
                                <Phone className="h-4 w-4" /> Call
                              </a>
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t pt-3 mt-3 text-sm text-muted-foreground">
              <span>
                {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
              </span>
              <div className="flex gap-2">
                {page > 1 ? (
                  <Button variant="outline" size="sm" asChild><Link href={pageHref(page - 1)}>Previous</Link></Button>
                ) : (
                  <Button variant="outline" size="sm" disabled>Previous</Button>
                )}
                {page < totalPages ? (
                  <Button variant="outline" size="sm" asChild><Link href={pageHref(page + 1)}>Next</Link></Button>
                ) : (
                  <Button variant="outline" size="sm" disabled>Next</Button>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
