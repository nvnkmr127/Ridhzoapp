"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { GitFork, Plus, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { SectionCard } from "./SectionCard";
import { enrollLeadsAction, stopEnrollmentAction } from "@/lib/actions/sequences";

interface SequenceOption {
  id: string;
  name: string;
}
interface EnrolledSequence {
  enrollmentId: string;
  sequenceId: string;
  name: string;
  status: string;
}

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

  const activeIds = new Set(enrolled.filter((e) => e.status === "active").map((e) => e.sequenceId));

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
        setEnrolled((cur) => [...cur, { enrollmentId: "new", sequenceId: seq.id, name: seq.name, status: "active" }]);
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
          ? "WhatsApp steps arrive in Follow-ups with the message ready — you send them from your WhatsApp. Emails send automatically. Stops when the lead replies or is closed."
          : "Sends automatically. Stops when the lead replies or is closed."
      }
      action={
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 font-medium text-primary">
              <Plus className="h-3.5 w-3.5" /> Add to Sequence
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
          <p className="text-xs text-muted-foreground">Tap &apos;+ Add to Sequence&apos; to start automated follow-ups.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {enrolled.map((seq) => (
            <div key={seq.enrollmentId} className="flex items-center justify-between p-3 rounded-lg border bg-muted/30 text-sm">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                <span className="font-medium">{seq.name}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">{seq.status}</span>
                {seq.status === "active" && seq.enrollmentId !== "new" && (
                  <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" disabled={pending === seq.enrollmentId}
                    onClick={async () => {
                      setPending(seq.enrollmentId);
                      try {
                        const res = await stopEnrollmentAction(seq.enrollmentId, leadId);
                        if (!res.ok) {
                          toast({ variant: "destructive", title: "Couldn't stop", description: res.message });
                          return;
                        }
                        setEnrolled((cur) => cur.map((e) => e.enrollmentId === seq.enrollmentId ? { ...e, status: "stopped" } : e));
                        toast({ title: "Sequence stopped" });
                        router.refresh();
                      } catch {
                        toast({ variant: "destructive", title: "Couldn't stop", description: "We couldn't reach the server. Please try again." });
                      } finally { setPending(null); }
                    }}>
                    Stop
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}
