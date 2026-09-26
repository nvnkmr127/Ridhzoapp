"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, X, PenLine, ArrowRightLeft, CalendarPlus, Phone, MessageSquare, Mail, CalendarCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { emitLeadAction } from "@/components/leads/leadEvents";
import { applyAiSuggestionAction, dismissAiSuggestionAction } from "@/lib/actions/ai";
import type { LeadPlan, NextStep } from "@/lib/ai/leadPlan";

function fmtWhen(iso: string) {
  return new Date(iso).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

// The AI's proposals under the recap — values it found for custom fields, a status change, and the
// next step. Nothing happens until the rep taps Apply; Dismiss hides it for good (it isn't proposed
// again). Applying goes through the normal actions, so permissions and validation still apply.
export function AiLeadSuggestions({ leadId, plan, onChange }: { leadId: string; plan: LeadPlan; onChange: (plan: LeadPlan) => void }) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = React.useState<string | null>(null);

  const drop = (id: string) =>
    onChange({
      fields: plan.fields.filter((f) => f.id !== id),
      status: plan.status?.id === id ? null : plan.status,
      next: plan.next?.id === id ? null : plan.next,
    });

  async function apply(id: string) {
    setBusy(id);
    try {
      const res = await applyAiSuggestionAction({ leadId, id });
      if (!res.ok) {
        toast({ variant: "destructive", title: "Couldn't apply that", description: res.message });
        return;
      }
      toast({ title: res.data.applied });
      drop(id);
      router.refresh();
    } catch {
      toast({ variant: "destructive", title: "Couldn't apply that", description: "We couldn't reach the server. Please try again." });
    } finally {
      setBusy(null);
    }
  }

  async function dismiss(id: string) {
    drop(id);
    await dismissAiSuggestionAction({ leadId, id }).catch(() => {});
  }

  const count = plan.fields.length + (plan.status ? 1 : 0) + (plan.next ? 1 : 0);
  if (count === 0) return null;

  const dismissBtn = (id: string) => (
    <Button type="button" size="icon" variant="ghost" className="h-7 w-7 shrink-0 text-muted-foreground" onClick={() => dismiss(id)} disabled={busy === id} aria-label="Dismiss suggestion">
      <X className="h-3.5 w-3.5" />
    </Button>
  );

  return (
    <div className="space-y-2 border-t border-violet-500/20 pt-2.5">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">AI suggestions · {count}</p>

      {plan.next && <NextStepRow step={plan.next} busy={busy === plan.next.id} onApply={() => apply(plan.next!.id)} dismiss={dismissBtn(plan.next.id)} />}

      {plan.status && (
        <Row icon={ArrowRightLeft} dismiss={dismissBtn(plan.status.id)}>
          <p className="font-medium">
            Move to <span className="text-foreground">{plan.status.label}</span>
          </p>
          <p className="text-xs text-muted-foreground">{plan.status.reason}</p>
          <Button size="sm" variant="outline" className="mt-1.5 h-7 gap-1 text-xs" onClick={() => apply(plan.status!.id)} disabled={busy === plan.status.id}>
            <Check className="h-3.5 w-3.5" /> {busy === plan.status.id ? "Changing…" : "Change status"}
          </Button>
        </Row>
      )}

      {plan.fields.map((f) => (
        <Row key={f.id} icon={PenLine} dismiss={dismissBtn(f.id)}>
          <p className="font-medium">
            {f.label}: <span className="text-foreground">{f.display}</span>
          </p>
          <p className="text-xs italic text-muted-foreground">&ldquo;{f.evidence}&rdquo;</p>
          <Button size="sm" variant="outline" className="mt-1.5 h-7 gap-1 text-xs" onClick={() => apply(f.id)} disabled={busy === f.id}>
            <Check className="h-3.5 w-3.5" /> {busy === f.id ? "Saving…" : "Fill in"}
          </Button>
        </Row>
      ))}
    </div>
  );
}

function Row({ icon: Icon, dismiss, children }: { icon: React.ElementType; dismiss: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-border/60 bg-background/40 p-2 text-sm">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-violet-500" />
      <div className="min-w-0 flex-1">{children}</div>
      {dismiss}
    </div>
  );
}

const KIND_ICON: Record<NextStep["kind"], React.ElementType> = {
  call: Phone,
  whatsapp: MessageSquare,
  email: Mail,
  meeting: CalendarCheck,
  follow_up: CalendarPlus,
  wait: CalendarPlus,
};

function NextStepRow({ step, busy, onApply, dismiss }: { step: NextStep; busy: boolean; onApply: () => void; dismiss: React.ReactNode }) {
  const doNow =
    step.kind === "call" ? (
      <Button size="sm" className="h-7 gap-1 text-xs" onClick={() => emitLeadAction({ type: "call" })}>
        <Phone className="h-3.5 w-3.5" /> Call now
      </Button>
    ) : (step.kind === "whatsapp" || step.kind === "email") && step.message ? (
      <Button size="sm" className="h-7 gap-1 text-xs" onClick={() => emitLeadAction({ type: "compose", channel: step.kind as "whatsapp" | "email", text: step.message })}>
        <PenLine className="h-3.5 w-3.5" /> Use this message
      </Button>
    ) : step.kind === "meeting" ? (
      <Button size="sm" className="h-7 gap-1 text-xs" onClick={() => emitLeadAction({ type: "meeting" })}>
        <CalendarCheck className="h-3.5 w-3.5" /> Book meeting
      </Button>
    ) : null;

  return (
    <Row icon={KIND_ICON[step.kind]} dismiss={dismiss}>
      <p className="font-medium">{step.title}</p>
      {step.reason && <p className="text-xs text-muted-foreground">{step.reason}</p>}
      {step.message && <p className="mt-1 line-clamp-3 whitespace-pre-wrap rounded bg-muted/40 px-2 py-1 text-xs">{step.message}</p>}
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {doNow}
        {step.kind !== "wait" && (
          <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={onApply} disabled={busy}>
            <CalendarPlus className="h-3.5 w-3.5" />
            {busy ? "Adding…" : step.followUpAt ? `Add follow-up · ${fmtWhen(step.followUpAt)}` : "Add follow-up"}
          </Button>
        )}
      </div>
    </Row>
  );
}
