import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Pencil } from "lucide-react";
import { getSequenceDetailAction } from "@/lib/actions/sequences";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SequenceFlow } from "@/components/sequences/SequenceFlow";

export default async function SequenceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const seq = await getSequenceDetailAction(id);
  if (!seq) notFound();

  const days = seq.steps.reduce((m, s) => Math.max(m, s.dayOffset), 0);

  return (
    <div className="flex-1 space-y-6 p-4 pt-4 sm:p-8 sm:pt-6 max-w-4xl">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Button asChild variant="ghost" size="icon" aria-label="Go back">
            <Link href="/sequences"><ArrowLeft className="h-4 w-4" /></Link>
          </Button>
          <div className="min-w-0">
            <h2 className="text-2xl font-bold tracking-tight truncate">{seq.name}</h2>
            <p className="text-xs text-muted-foreground">{seq.steps.length} steps over {days} day{days === 1 ? "" : "s"}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge variant={seq.isActive ? "default" : "secondary"}>{seq.isActive ? "Active" : "Inactive"}</Badge>
          <Button asChild variant="outline" size="sm" className="gap-1">
            <Link href={`/sequences/${seq.id}/edit`}><Pencil className="h-3.5 w-3.5" /> Edit</Link>
          </Button>
        </div>
      </div>

      {seq.description && <p className="text-sm text-muted-foreground max-w-prose">{seq.description}</p>}

      {seq.steps.length === 0 ? (
        <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
          This sequence has no steps yet. <Link href={`/sequences/${seq.id}/edit`} className="text-primary hover:underline">Add steps</Link>.
        </div>
      ) : (
        <SequenceFlow steps={seq.steps} funnel={seq.funnel} />
      )}

      <p className="text-xs text-muted-foreground">
        Enroll leads from any lead&apos;s page, or auto-enroll with an{" "}
        <Link href="/automations" className="text-primary hover:underline">automation</Link> (action: Enroll in Sequence).
      </p>
    </div>
  );
}
