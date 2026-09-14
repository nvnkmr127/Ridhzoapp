import Link from "next/link";
import { Trash2, ArrowLeft } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { requireOrg, hasPermission } from "@/lib/rbac";
import { LeadService } from "@/domains/leads/service";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { RecycleBinRowActions, EmptyBinButton } from "@/components/leads/RecycleBinActions";

export default async function RecycleBinPage() {
  const { organizationId } = await requireOrg();
  const [deleted, canPurge] = await Promise.all([
    LeadService.listDeletedLeads(organizationId),
    hasPermission("leads.purge"),
  ]);

  return (
    <div className="space-y-6 p-4 pt-4 sm:p-8 sm:pt-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="icon" aria-label="Go back">
            <Link href="/leads"><ArrowLeft className="h-4 w-4" /></Link>
          </Button>
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold">
              <Trash2 className="h-6 w-6 text-muted-foreground" /> Recycle bin
            </h1>
            <p className="text-sm text-muted-foreground">
              Deleted leads are kept for 30 days, then permanently removed automatically.
            </p>
          </div>
        </div>
        {canPurge && deleted.length > 0 && <EmptyBinButton />}
      </div>

      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="text-base">{deleted.length} deleted {deleted.length === 1 ? "lead" : "leads"}</CardTitle>
        </CardHeader>
        <CardContent>
          {deleted.length === 0 ? (
            <EmptyState
              icon={<Trash2 className="h-10 w-10 text-muted-foreground" />}
              title="Recycle bin is empty"
              description="Deleted leads will appear here and can be restored within 30 days."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Lead</TableHead>
                  <TableHead>Deleted</TableHead>
                  <TableHead>Auto-purge in</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {deleted.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell>
                      <span className="font-medium">{l.name || "Unnamed lead"}</span>
                      <div className="text-xs text-muted-foreground">{l.phone || l.email || "No contact info"}</div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {l.deletedAt ? formatDistanceToNow(new Date(l.deletedAt), { addSuffix: true }) : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={l.daysLeft <= 3 ? "destructive" : "outline"}>{l.daysLeft}d left</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <RecycleBinRowActions leadId={l.id} canPurge={canPurge} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {!canPurge && deleted.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Only an admin can permanently delete leads or empty the recycle bin.
        </p>
      )}
    </div>
  );
}
