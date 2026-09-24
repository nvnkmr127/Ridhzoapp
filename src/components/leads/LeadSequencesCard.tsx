"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { GitFork, Plus, Pause, Play, Square, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { SectionCard } from "./SectionCard";
import { enrollLeadsAction, pauseEnrollmentAction, resumeEnrollmentAction, stopEnrollmentAction } from "@/lib/actions/sequences";
import { LocalTime } from "@/components/LocalTime";
import { cn } from "@/lib/utils";

interface SequenceOption {
  id: string;
  name: string;
}
interface EnrolledSequence {
  enrollmentId: string;
  sequenceId: string;
  name: string;
  status: string;
  nextRunAt?: Date | string | null;
}

const STATUS_STYLE: Record<string, string> = {
  active: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  paused: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  completed: "bg-muted text-muted-foreground",
  stopped: "bg-muted text-muted-foreground",
};
const STATUS_LABEL: Record<string, string> = { active: "Running", paused: "Paused", completed: "Completed", stopped: "Stopped" };

interface LeadSequencesCardProps {
  leadId: string;
  availableSequences?: SequenceOption[];
  initialEnrolled?: EnrolledSequence[];
  whatsappMode?: "personal" | "bsp";
}

export function LeadSequencesCard({ leadId, availableSequences = [], initialEnrolled = [], whatsappMode = "personal" }: LeadSequencesCardProps) {
  const [enrolled, setEnrolled] = useState<EnrolledSequence[]>(initialEnrolled);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const router = useRouter();
  const { toast } = useToast();

  // Server data is the source of truth after every change (router.refresh re-renders with fresh rows).
  useEffect(() => setEnrolled(initialEnrolled), [initialEnrolled]);

  const activeIds = new Set(enrolled.filter((e) => e.status === "active" || e.status === "paused").map((e) => e.sequenceId));

  // Runs a pause/resume/stop and reflects it immediately, then refreshes from the server.
  async function change(seq: EnrolledSequence, kind: "pause" | "resume" | "stop") {
    setPending(seq.enrollmentId);
    try {
      const res =
        kind === "pause"
          ? await pauseEnrollmentAction(seq.enrollmentId)
          : kind === "resume"
            ? await resumeEnrollmentAction(seq.enrollmentId)
            : await stopEnrollmentAction(seq.enrollmentId, leadId);
      if (!res.ok) {
        toast({ variant: "destructive", title: `Couldn't ${kind} the sequence`, description: res.message });
        return;
      }
      const status = kind === "pause" ? "paused" : kind === "resume" ? "active" : "stopped";
      setEnrolled((cur) => cur.map((e) => (e.enrollmentId === seq.enrollmentId ? { ...e, status } : e)));
      toast({
        title: kind === "pause" ? "Sequence paused" : kind === "resume" ? "Sequence resumed" : "Sequence stopped",
        description:
          kind === "pause"
            ? `No messages from '${seq.name}' until you resume.`
            : kind === "resume"
              ? "Remaining steps keep their spacing, shifted by the time it was paused."
              : `'${seq.name}' won't send anything more to this lead.`,
      });
      router.refresh();
    } catch {
      toast({ variant: "destructive", title: `Couldn't ${kind} the sequence`, description: "We couldn't reach the server. Please try again." });
    } finally {
      setPending(null);
    }
  }

  async function handleEnroll(seq: SequenceOption) {
    if (activeIds.has(seq.id)) return;
    setPending(seq.id);
    try {
      const res = await enrollLeadsAction(seq.id, [leadId]);
      if (!res.ok) {
        toast({ variant: "destructive", title: "Couldn't enroll", description: res.message });
        return;
      }
      if (res.data.enrolled > 0) {
        toast({ title: "Enrolled in sequence", description: `Lead added to '${seq.name}'.` });
        router.refresh();
      } else {
        toast({ title: "Already enrolled", description: `Lead is already in '${seq.name}'.` });
      }
      setOpen(false);
    } catch {
      toast({ variant: "destructive", title: "Couldn't enroll", description: "We couldn't reach the server. Please try again." });
    } finally {
      setPending(null);
    }
  }

  return (
    <SectionCard
      icon={GitFork}
      title="Sequences"
      description={
        whatsappMode === "personal"
          ? "Automatic follow-up messages. WhatsApp ones land in Follow-ups for you to send. Stops if they reply or the lead is closed."
          : "Automatic follow-up messages. Stops if they reply or the lead is closed."
      }
      action={
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" className="h-9 text-xs gap-1 font-medium">
              <Plus className="h-3.5 w-3.5" /> Add
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Enroll in a sequence</DialogTitle>
            </DialogHeader>
            <div className="space-y-2 py-3">
              {availableSequences.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No sequences yet.{" "}
                  <Link href="/sequences" className="text-primary underline-offset-2 hover:underline">Create one →</Link>
                </p>
              ) : (
                availableSequences.map((seq) => {
                  const isEnrolled = activeIds.has(seq.id);
                  return (
                    <div key={seq.id} className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/40 transition-colors">
                      <p className="font-medium text-sm">{seq.name}</p>
                      <Button
                        size="sm"
                        variant={isEnrolled ? "secondary" : "default"}
                        disabled={isEnrolled || pending === seq.id}
                        onClick={() => handleEnroll(seq)}
                        className="h-8 text-xs"
                      >
                        {isEnrolled ? (<><CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Enrolled</>) : pending === seq.id ? "Enrolling…" : "Enroll"}
                      </Button>
                    </div>
                  );
                })
              )}
            </div>
          </DialogContent>
        </Dialog>
      }
    >
      {enrolled.length === 0 ? (
        <div className="text-center py-8 px-4 border border-dashed rounded-lg bg-muted/20 space-y-2">
          <GitFork className="h-8 w-8 text-muted-foreground/60 mx-auto stroke-[1.5]" />
          <p className="text-sm font-medium text-foreground">Not currently part of any sequences</p>
          <p className="text-xs text-muted-foreground">Tap “Add” to send this lead a series of follow-up messages automatically.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {enrolled.map((seq) => {
            const busy = pending === seq.enrollmentId;
            return (
              <div key={seq.enrollmentId} className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium">{seq.name}</span>
                    <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider", STATUS_STYLE[seq.status] ?? STATUS_STYLE.stopped)}>
                      {STATUS_LABEL[seq.status] ?? seq.status}
                    </span>
                  </div>
                  {seq.status === "active" && seq.nextRunAt && (
                    <p className="text-xs text-muted-foreground">
                      Next message <LocalTime iso={seq.nextRunAt} mode="datetime" />
                    </p>
                  )}
                  {seq.status === "paused" && <p className="text-xs text-muted-foreground">Nothing will send until you resume.</p>}
                </div>
                {(seq.status === "active" || seq.status === "paused") && (
                  <div className="flex shrink-0 items-center gap-1.5">
                    {seq.status === "active" ? (
                      <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" disabled={busy} onClick={() => change(seq, "pause")}>
                        <Pause className="h-3.5 w-3.5" /> Pause
                      </Button>
                    ) : (
                      <Button size="sm" className="h-8 gap-1.5 text-xs" disabled={busy} onClick={() => change(seq, "resume")}>
                        <Play className="h-3.5 w-3.5" /> Resume
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs text-muted-foreground" disabled={busy} onClick={() => change(seq, "stop")}>
                      <Square className="h-3 w-3" /> Stop
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
}
