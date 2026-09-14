import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Pencil, Clock, Paperclip, MessageSquare, Mail } from "lucide-react";
import { getSequenceDetailAction } from "@/lib/actions/sequences";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

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

      {/* Enrollment funnel */}
      <div className="grid grid-cols-3 gap-3">
        {([["In sequence", seq.funnel.active], ["Completed", seq.funnel.completed], ["Removed", seq.funnel.removed]] as const).map(([label, n]) => (
          <div key={label} className="rounded-xl border bg-card p-4">
            <p className="text-2xl font-bold tabular-nums">{n}</p>
            <p className="text-xs text-muted-foreground">{label}</p>
          </div>
        ))}
      </div>

      {/* Steps */}
      <div className="space-y-3">
        <p className="text-sm font-medium">Sequence steps</p>
        {seq.steps.map((s, i) => (
          <div key={s.stepIndex}>
            {i > 0 && s.dayOffset > 0 && (
              <div className="flex items-center gap-1.5 pl-3 py-1 text-xs text-muted-foreground">
                <Clock className="h-3.5 w-3.5" /> Wait until day {s.dayOffset}
              </div>
            )}
            <div className="rounded-xl border bg-card p-4 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  {s.channel === "email" ? <Mail className="h-3.5 w-3.5" /> : <MessageSquare className="h-3.5 w-3.5" />}
                  Step {i + 1} · {s.channel}
                </span>
                <span className="text-xs text-muted-foreground">{s.clients} client{s.clients === 1 ? "" : "s"}</span>
              </div>
              <p className="text-sm whitespace-pre-wrap">{s.body}</p>
              {s.attachmentUrl && (
                <a href={s.attachmentUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline">
                  <Paperclip className="h-3.5 w-3.5" /> {s.attachmentName || "Attachment"}
                </a>
              )}
            </div>
          </div>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        Enroll leads from any lead&apos;s page, or auto-enroll with an{" "}
        <Link href="/automations" className="text-primary hover:underline">automation</Link> (action: Enroll in Sequence).
      </p>
    </div>
  );
}
