"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRightLeft, BadgeCheck, BadgeX, BellOff, CalendarCheck, CalendarPlus, CircleHelp, ClipboardCheck,
  Copy, FileText, Mail, MessageSquare, PauseCircle, PenLine, Phone, Send, Siren, Sparkles, UserPen, Workflow, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/hooks/use-toast";
import { emitLeadAction } from "@/components/leads/leadEvents";
import { executeAiActionAction } from "@/lib/actions/aiActions";
import { dismissAiSuggestionAction } from "@/lib/actions/ai";
import type { NextAction, NextActionKind } from "@/domains/leads/nextAction";
import type { ExecuteAnswer, ExecuteResult, NextActionPrompt } from "@/lib/ai/leadSuggestions";

/** One icon per kind, so a suggestion always looks like the thing it is. */
export function iconFor(kind: NextActionKind): React.ElementType {
  switch (kind) {
    case "call": return Phone;
    case "whatsapp": return MessageSquare;
    case "email": return Mail;
    case "meeting": return CalendarCheck;
    case "follow_up": return CalendarPlus;
    case "share_document": return FileText;
    case "enroll_sequence": return Workflow;
    case "stop_sequence": return BellOff;
    case "change_status": return ArrowRightLeft;
    case "assign": return UserPen;
    case "escalate": return Siren;
    case "log_meeting_outcome": return ClipboardCheck;
    case "confirm_meeting": return CalendarCheck;
    case "ask_for_info": return CircleHelp;
    case "qualify": return BadgeCheck;
    case "mark_qualified": return BadgeCheck;
    case "mark_unqualified": return BadgeX;
    case "wait": return PauseCircle;
    case "do_nothing": return PauseCircle;
  }
}

const URGENCY_LABEL = { now: "Now", today: "Today", this_week: "This week" } as const;
const CHANNEL_NAME = { whatsapp: "WhatsApp", email: "email" } as const;
const OUTCOMES = [
  { key: "completed", label: "It happened" },
  { key: "no_show", label: "No-show" },
  { key: "cancelled", label: "Cancelled" },
] as const;

function fmtWhen(iso: string) {
  return new Date(iso).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

/**
 * One next action, one card, both producers.
 *
 * The point of the shared `NextAction` type was to stop the lead page showing two competing panels;
 * this is where that lands. It renders the same way whether the action came from the deterministic
 * rules or the model, and every button either completes the action or hands it to the screen that
 * can. A kind with nothing behind it gets a line saying so rather than a button that lies.
 *
 * Outbound actions are the one irreversible thing here, so they always go through the review dialog
 * — the model drafts, the rep sends.
 */
export function NextActionCard({
  action,
  leadId,
  canEdit = true,
  hasPhone = false,
  hasEmail = false,
  dismissible = false,
  extraActions,
  onExecuted,
  onDismiss,
}: {
  action: NextAction;
  leadId: string;
  canEdit?: boolean;
  hasPhone?: boolean;
  hasEmail?: boolean;
  /**
   * Offer the dismiss button, and dismiss server-side by calling the action below. This is a flag
   * rather than a callback because the lead page is a server component: it cannot hand a function to
   * this client component, so the card has to own the call. `onDismiss` stays for in-app client
   * callers that need to react locally; it runs *after* the action succeeds.
   */
  dismissible?: boolean;
  /** Buttons the caller owns — "Set follow-up", "Call now" — rendered after the action's own. */
  extraActions?: React.ReactNode;
  onExecuted?: (applied: string) => void;
  onDismiss?: () => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [confirm, confirmDialog] = useConfirm();
  const [busy, setBusy] = React.useState(false);
  const [review, setReview] = React.useState<Extract<NextActionPrompt, { kind: "review_send" }> | null>(null);
  const [outcome, setOutcome] = React.useState<Extract<NextActionPrompt, { kind: "log_meeting_outcome" }> | null>(null);

  const Icon = iconFor(action.kind);

  const finish = React.useCallback(
    (applied: string) => {
      toast({ title: applied });
      onExecuted?.(applied);
      router.refresh();
    },
    [onExecuted, router, toast],
  );

  /** Asks the server to do the thing, then handles whichever shape comes back. */
  const runAction = React.useCallback(
    async (opts: { confirm?: boolean; answer?: ExecuteAnswer } = {}) => {
      setBusy(true);
      let res: ExecuteResult | null = null;
      try {
        res = await executeAiActionAction({ leadId, id: action.id, ...opts });
      } catch {
        res = { ok: false, code: "SERVER", message: "Something went wrong. Check your connection, or you may not have permission for this, then try again." };
      } finally {
        setBusy(false);
      }
      if (!res.ok) {
        toast({ variant: "destructive", title: "Couldn't do that", description: res.message });
        return;
      }
      if ("prompt" in res) return showPrompt(res.prompt);
      finish(res.applied);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [action.id, leadId, finish, toast],
  );

  const showPrompt = React.useCallback(
    async (p: NextActionPrompt) => {
      switch (p.kind) {
        case "review_send":
          setReview(p);
          return;
        case "log_meeting_outcome":
          setOutcome(p);
          return;
        case "confirm_meeting": {
          const yes = await confirm({
            title: "Confirm this meeting with the lead?",
            description: "Ridhzo will send them a confirmation on their preferred channel. This cannot be undone.",
            confirmLabel: "Send confirmation",
          });
          if (yes) await runAction({ confirm: true });
          return;
        }
        case "choose_owner":
        case "choose_content":
          // No dialog worth building here: both already have one, and they are on this page.
          toast({ title: "Pick it from the lead", description: p.kind === "choose_owner" ? "Use the Assign control above." : "Use the Share panel below." });
          return;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [confirm, runAction, toast],
  );

  const sendReviewed = React.useCallback(
    async (subject: string) => {
      setReview(null);
      await runAction({ confirm: true, answer: { subject } });
    },
    [runAction],
  );

  const saveOutcome = React.useCallback(
    async (status: "completed" | "no_show" | "cancelled", note: string) => {
      setOutcome(null);
      await runAction({ answer: { meetingOutcome: { status, outcome: note || null } } });
    },
    [runAction],
  );

  const copy = React.useCallback(
    async (text: string) => {
      await navigator.clipboard?.writeText(text);
      toast({ title: "Copied" });
    },
    [toast],
  );

  const sendPrompt = action.kind === "whatsapp" || action.kind === "email" ? action.message?.trim() : undefined;

  return (
    <div className="space-y-2">
      <div className="flex items-start gap-2">
        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-violet-500" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="font-medium leading-snug">{action.title}</p>
            <Badge variant="outline" className="h-4 gap-1 px-1.5 text-[10px] font-normal text-muted-foreground">
              {action.source === "ai" ? <Sparkles className="h-2.5 w-2.5" /> : null}
              {action.source === "ai" ? "AI" : "Rule"}
            </Badge>
            {action.urgency !== "this_week" && (
              <Badge variant={action.urgency === "now" ? "destructive" : "secondary"} className="h-4 px-1.5 text-[10px] font-normal">
                {URGENCY_LABEL[action.urgency]}
              </Badge>
            )}
            {action.confidence === "low" && (
              <Badge variant="outline" className="h-4 px-1.5 text-[10px] font-normal text-muted-foreground">
                Worth a look, not a must-do
              </Badge>
            )}
          </div>
          {action.reason && <p className="text-xs text-muted-foreground">{action.reason}</p>}
          {action.evidence.map((q, i) => (
            <p key={i} className="mt-0.5 text-xs italic text-muted-foreground/80">
              &ldquo;{q}&rdquo;
            </p>
          ))}
        </div>
        {(dismissible || onDismiss) && (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-7 w-7 shrink-0 text-muted-foreground"
            disabled={busy}
            onClick={async () => {
              if (!dismissible) {
                onDismiss?.();
                return;
              }
              setBusy(true);
              const res = await dismissAiSuggestionAction({ leadId, id: action.id });
              setBusy(false);
              if (!res?.ok) {
                toast({ title: res?.message ?? "Couldn't dismiss that suggestion.", variant: "destructive" });
                return;
              }
              // The dismissed action was rendered from the lead's cached plan, so the server has to
              // re-render to drop it — otherwise the rep dismisses and it stays on screen.
              router.refresh();
              onDismiss?.();
            }}
            aria-label="Dismiss suggestion"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      {sendPrompt && <div className="ml-6 whitespace-pre-wrap rounded bg-muted/40 px-2 py-1.5 text-xs leading-relaxed">{sendPrompt}</div>}

      {canEdit && (
        <div className="ml-6 flex flex-wrap gap-1.5">
          <Buttons action={action} hasPhone={hasPhone} hasEmail={hasEmail} busy={busy} sendPrompt={sendPrompt} run={runAction} copy={copy} />
          {extraActions}
        </div>
      )}

      {confirmDialog}
      <ReviewDialog prompt={review} onClose={() => setReview(null)} onSend={sendReviewed} />
      <OutcomeDialog prompt={outcome} onClose={() => setOutcome(null)} onSave={saveOutcome} />
    </div>
  );
}

function ReviewDialog({
  prompt,
  onClose,
  onSend,
}: {
  prompt: Extract<NextActionPrompt, { kind: "review_send" }> | null;
  onClose: () => void;
  onSend: (subject: string) => void;
}) {
  const [subject, setSubject] = React.useState(prompt?.subject ?? "");
  const isEmail = prompt?.channel === "email";
  return (
    <Dialog open={!!prompt} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEmail ? "Send this email?" : "Send this WhatsApp?"}</DialogTitle>
          <DialogDescription>Check it reads like you. Once sent, it can&rsquo;t be unsent.</DialogDescription>
        </DialogHeader>
        {isEmail && (
          <div className="space-y-1.5">
            <Label htmlFor="na-subject">Subject</Label>
            <Input id="na-subject" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={255} />
          </div>
        )}
        <Textarea readOnly rows={7} value={prompt?.body ?? ""} className="text-sm" />
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onSend(subject)} disabled={isEmail && !subject.trim()}>
            <Send className="mr-1.5 h-3.5 w-3.5" /> Send now
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function OutcomeDialog({
  prompt,
  onClose,
  onSave,
}: {
  prompt: Extract<NextActionPrompt, { kind: "log_meeting_outcome" }> | null;
  onClose: () => void;
  onSave: (status: "completed" | "no_show" | "cancelled", note: string) => void;
}) {
  const [note, setNote] = React.useState("");
  return (
    <Dialog open={!!prompt} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>How did the meeting go?</DialogTitle>
          <DialogDescription>This is what moves the lead forward, so it&rsquo;s yours to say — Ridhzo won&rsquo;t guess.</DialogDescription>
        </DialogHeader>
        <Textarea rows={3} placeholder="What happened? Optional, but it's what the AI reads next time." value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} />
        <DialogFooter className="flex-wrap gap-2">
          {OUTCOMES.map((o) => (
            <Button key={o.key} variant="outline" onClick={() => onSave(o.key, note)}>{o.label}</Button>
          ))}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Not a button: says why there isn't one. A blank row reads as a broken card. */
function Hint({ text, onClick }: { text: string; onClick?: () => void }) {
  return (
    <Button size="sm" variant="ghost" className="h-7 px-1 text-xs font-normal text-muted-foreground" onClick={onClick} disabled={!onClick}>
      {text}
    </Button>
  );
}

/**
 * The buttons for one kind. Two families: the model's action is done server-side, and the rule's is
 * handed to the screen that already does it. Both are real — there is no third case where a button
 * quietly becomes something else.
 */
function Buttons({
  action,
  hasPhone,
  hasEmail,
  busy,
  sendPrompt,
  run,
  copy,
}: {
  action: NextAction;
  hasPhone: boolean;
  hasEmail: boolean;
  busy: boolean;
  sendPrompt: string | undefined;
  run: (opts?: { confirm?: boolean; answer?: ExecuteAnswer }) => Promise<void>;
  copy: (text: string) => void;
}) {
  const kind = action.kind;
  const cls = "h-7 gap-1 text-xs";

  // A rule action carries no AI wording, so it hands off to the composer rather than pretend to send.
  if (action.source === "rule") {
    const call = hasPhone ? (
      <Button key="c" size="sm" className={cls} onClick={() => emitLeadAction({ type: "call" })}>
        <Phone className="h-3.5 w-3.5" /> Call now
      </Button>
    ) : null;
    const compose = hasEmail ? (
      <Button key="e" size="sm" variant="outline" className={cls} onClick={() => emitLeadAction({ type: "compose", channel: "email", ai: true })}>
        <Mail className="h-3.5 w-3.5" /> Write email with AI
      </Button>
    ) : null;

    switch (kind) {
      case "call":
        return <>{call}</>;
      case "whatsapp":
      case "email":
        return (
          <>
            <Button size="sm" className={cls} onClick={() => emitLeadAction({ type: "compose", channel: kind, ai: true })}>
              <MessageSquare className="h-3.5 w-3.5" /> Write {CHANNEL_NAME[kind]} with AI
            </Button>
            {call}
          </>
        );
      case "meeting":
        return (
          <Button size="sm" className={cls} onClick={() => emitLeadAction({ type: "meeting" })}>
            <CalendarPlus className="h-3.5 w-3.5" /> Book meeting
          </Button>
        );
      case "log_meeting_outcome":
      case "confirm_meeting":
        return (
          <>
            <Button size="sm" className={cls} onClick={() => emitLeadAction({ type: "open-tab", tab: "meetings" })}>
              <CalendarCheck className="h-3.5 w-3.5" /> {kind === "log_meeting_outcome" ? "Log outcome" : "Open meeting"}
            </Button>
            {kind === "confirm_meeting" ? compose : call}
          </>
        );
      case "ask_for_info":
        return (
          <>
            {call}
            {compose}
            <Button size="sm" variant="outline" className={cls} onClick={() => emitLeadAction({ type: "edit" })}>
              <UserPen className="h-3.5 w-3.5" /> Add phone / email
            </Button>
          </>
        );
      case "wait":
      case "do_nothing":
        return <></>;
      default:
        return <></>;
    }
  }

  const doIt = (key: string, label: string, Icon: React.ElementType, variant: "default" | "outline" = "default") => (
    <Button key={key} size="sm" variant={variant} className={cls} disabled={busy} onClick={() => run()}>
      <Icon className="h-3.5 w-3.5" /> {busy ? "Working…" : label}
    </Button>
  );
  const callNow = hasPhone ? (
    <Button key="now" size="sm" className={cls} onClick={() => emitLeadAction({ type: "call" })}>
      <Phone className="h-3.5 w-3.5" /> Call now
    </Button>
  ) : null;
  const side = hasPhone ? "outline" : "default";

  switch (kind) {
    case "whatsapp":
    case "email": {
      if (!sendPrompt) return <Hint text="Ridhzo has no wording for this — write it in the composer." onClick={() => emitLeadAction({ type: "compose", channel: kind })} />;
      return (
        <>
          {doIt("send", `Send ${CHANNEL_NAME[kind]}`, Send)}
          <Button size="sm" variant="outline" className={cls} disabled={busy} onClick={() => emitLeadAction({ type: "compose", channel: kind, text: sendPrompt })}>
            <PenLine className="h-3.5 w-3.5" /> Edit first
          </Button>
          <Button size="sm" variant="outline" className={cls} onClick={() => copy(sendPrompt)}>
            <Copy className="h-3.5 w-3.5" /> Copy
          </Button>
        </>
      );
    }
    case "call":
      return <>{callNow}{doIt("sched", "Add to my list", CalendarPlus, side)}</>;
    case "meeting":
      return (
        <>
          <Button size="sm" className={cls} onClick={() => emitLeadAction({ type: "meeting" })}>
            <CalendarPlus className="h-3.5 w-3.5" /> Book meeting
          </Button>
          {doIt("task", "Just remind me", CalendarPlus, "outline")}
        </>
      );
    case "follow_up":
    case "ask_for_info":
      return <>{callNow}{doIt("sched", action.followUpAt ? `Schedule · ${fmtWhen(action.followUpAt)}` : "Add to my list", CalendarPlus, side)}</>;
    case "change_status":
    case "qualify":
    case "mark_qualified":
    case "mark_unqualified":
      return <>{doIt("st", "Change status", ArrowRightLeft)}</>;
    case "enroll_sequence":
      return <>{doIt("en", "Enroll in sequence", Workflow)}</>;
    case "stop_sequence":
      return <>{doIt("sp", "Stop the sequence", BellOff, "outline")}</>;
    case "log_meeting_outcome":
      return <>{doIt("lo", "Log the outcome", ClipboardCheck)}</>;
    case "confirm_meeting":
      return <>{doIt("cm", "Confirm with the lead", CalendarCheck)}</>;
    case "wait":
    case "do_nothing":
      // Nothing is the right answer — but the rep can always disagree and put it on their list.
      return <>{doIt("rem", "Remind me anyway", CalendarPlus, "outline")}</>;
    case "assign":
      return <Hint text="Pick an owner from the Assign control above." />;
    case "share_document":
      return <Hint text="Send it from the Share panel below — Ridhzo won't invent a link." />;
    case "escalate":
      return <Hint text="Overdue leads escalate on their own — nothing to press." />;
  }
}