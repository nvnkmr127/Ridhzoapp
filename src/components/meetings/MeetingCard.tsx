"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Video, MapPin, Store, Users, Clock, ExternalLink, Navigation, Pencil, Check, UserX, X, RotateCcw, LocateFixed, CalendarCheck, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LocalTime } from "@/components/LocalTime";
import { checkInMeetingAction, reopenMeetingAction, sendMeetingConfirmationAction, setMeetingOutcomeAction } from "@/lib/actions/meetings";
import { logLeadContactAction } from "@/lib/actions/messaging";
import { buildDeepLink } from "@/lib/messaging/deeplink";
import { MEETING_STATUSES, isInPersonMode, meetingEnd, modeLabel, type MeetingStatus, type MeetingView } from "@/domains/meetings/format";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const MODE_ICONS: Record<string, React.ElementType> = { online: Video, site_visit: MapPin, store_visit: Store, in_person: Users };

function mapsLink(m: MeetingView) {
  if (m.mapUrl) return m.mapUrl;
  const q = [m.locationName, m.address].filter(Boolean).join(", ");
  return q ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}` : null;
}

const pad = (n: number) => String(n).padStart(2, "0");
const toLocalInput = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

type OutcomeStatus = Exclude<MeetingStatus, "scheduled">;

export function MeetingCard({
  meeting: m,
  lead,
  assigneeName,
  onEdit,
  showLead = false,
}: {
  meeting: MeetingView;
  lead: { id: string; name: string; phone: string | null };
  assigneeName?: string | null;
  onEdit?: () => void;
  showLead?: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = React.useState(false);
  const [outcomeFor, setOutcomeFor] = React.useState<OutcomeStatus | null>(null);
  const Icon = MODE_ICONS[m.mode] ?? CalendarCheck;
  const scheduled = m.status === "scheduled";
  // Time-dependent UI waits for mount so the server and browser render the same markup.
  const [now, setNow] = React.useState<number | null>(null);
  React.useEffect(() => setNow(Date.now()), []);
  const ended = now !== null && meetingEnd(m).getTime() < now;
  const startsSoon = now !== null && new Date(m.startAt).getTime() - now < 3 * 60 * 60 * 1000;
  const map = isInPersonMode(m.mode) ? mapsLink(m) : null;

  async function run(fn: () => Promise<{ ok: boolean; message?: string }>, success: string) {
    setBusy(true);
    try {
      const res = await fn();
      if (!res.ok) {
        toast({ variant: "destructive", title: "Couldn't update the meeting", description: res.message });
        return false;
      }
      toast({ title: success });
      router.refresh();
      return true;
    } catch {
      toast({ variant: "destructive", title: "Couldn't update the meeting", description: "We couldn't reach the server. Please try again." });
      return false;
    } finally {
      setBusy(false);
    }
  }

  // GPS is best-effort: a denied/unavailable location still records the check-in time.
  function checkIn() {
    const save = (coords: { lat: number; lng: number } | null) =>
      run(() => checkInMeetingAction(m.id, coords), coords ? "Checked in with your location" : "Checked in (location not shared)");
    if (!navigator.geolocation) return void save(null);
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (p) => void save({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => void save(null),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  // Email goes out server-side; WhatsApp opens on the rep's phone unless the Business API already sent it.
  async function confirmWithLead() {
    setBusy(true);
    try {
      const res = await sendMeetingConfirmationAction(m.id);
      if (!res.ok) {
        toast({ variant: "destructive", title: "Couldn't send the confirmation", description: res.message });
        return;
      }
      const n = res.data;
      const wa = !n.whatsappSent && lead.phone ? buildDeepLink("whatsapp", { name: lead.name, phone: lead.phone }, n.whatsappText) : null;
      if (wa) {
        // Opened after an await, so some browsers block the popup — fall back to navigating.
        if (!window.open(wa, "_blank")) window.location.href = wa;
        void logLeadContactAction({ leadId: lead.id, channel: "whatsapp", message: n.whatsappText });
      }
      toast({
        title: "Confirmation sent",
        description: [n.emailed && "Emailed", n.whatsappSent && "WhatsApp sent", wa && "WhatsApp opened"].filter(Boolean).join(" · ") || "This lead has no email or phone.",
      });
      router.refresh();
    } catch {
      toast({ variant: "destructive", title: "Couldn't send the confirmation", description: "We couldn't reach the server. Please try again." });
    } finally {
      setBusy(false);
    }
  }

  const statusTone: Record<string, string> = {
    completed: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    no_show: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
    cancelled: "bg-muted text-muted-foreground",
  };

  return (
    <div className={cn("rounded-2xl border bg-card p-3.5 space-y-2.5", scheduled && ended && "border-amber-500/40 bg-amber-500/5", !scheduled && "opacity-80")}>
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn("text-sm font-semibold", m.status === "cancelled" && "line-through")}>{m.title}</span>
            {!scheduled && <Badge variant="secondary" className={cn("h-5 px-1.5 text-[10px]", statusTone[m.status])}>{MEETING_STATUSES[m.status as MeetingStatus] ?? m.status}</Badge>}
            {scheduled && ended && <Badge variant="secondary" className="h-5 bg-amber-500/15 px-1.5 text-[10px] text-amber-700 dark:text-amber-300">Needs outcome</Badge>}
          </div>
          <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><Clock className="h-3 w-3" /><LocalTime iso={m.startAt} mode="full" /></span>
            <span>· {m.durationMinutes} min</span>
            <span>· {modeLabel(m.mode)}</span>
            {assigneeName && <span>· {assigneeName}</span>}
          </p>
          {showLead && (
            <p className="text-xs">
              Lead: <Link href={`/leads/${lead.id}`} className="font-medium underline-offset-2 hover:underline">{lead.name}</Link>
            </p>
          )}
          {isInPersonMode(m.mode) && (m.locationName || m.address) && (
            <p className="text-xs text-foreground/80">{[m.locationName, m.address].filter(Boolean).join(", ")}</p>
          )}
          {m.mode === "online" && m.meetingUrl && <p className="truncate text-xs text-foreground/80">{m.meetingUrl}</p>}
          {m.notes && <p className="whitespace-pre-wrap text-xs text-muted-foreground">{m.notes}</p>}
          {m.outcome && <p className="whitespace-pre-wrap rounded-md bg-muted/60 p-2 text-xs">{m.outcome}</p>}
          {m.checkedInAt && (
            <p className="flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-300">
              <LocateFixed className="h-3 w-3" /> Checked in <LocalTime iso={m.checkedInAt} mode="time" />
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 pl-11">
        {scheduled && m.mode === "online" && m.meetingUrl && (
          <Button size="sm" variant={startsSoon ? "default" : "outline"} className="h-8 gap-1.5" asChild>
            <a href={m.meetingUrl} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-3.5 w-3.5" /> Join</a>
          </Button>
        )}
        {scheduled && map && (
          <Button size="sm" variant="outline" className="h-8 gap-1.5" asChild>
            <a href={map} target="_blank" rel="noopener noreferrer"><Navigation className="h-3.5 w-3.5" /> Directions</a>
          </Button>
        )}
        {scheduled && isInPersonMode(m.mode) && !m.checkedInAt && startsSoon && (
          <Button size="sm" variant="outline" className="h-8 gap-1.5" disabled={busy} onClick={checkIn}>
            <LocateFixed className="h-3.5 w-3.5" /> Check in
          </Button>
        )}
        {scheduled && (
          <>
            <Button size="sm" variant={ended ? "default" : "outline"} className="h-8 gap-1.5" disabled={busy} onClick={() => setOutcomeFor("completed")}>
              <Check className="h-3.5 w-3.5" /> Done
            </Button>
            <Button size="sm" variant="outline" className="h-8 gap-1.5" disabled={busy} onClick={() => setOutcomeFor("no_show")}>
              <UserX className="h-3.5 w-3.5" /> No-show
            </Button>
            {!ended && (
              <Button size="sm" variant="ghost" className="h-8 gap-1.5" disabled={busy} onClick={confirmWithLead} title="Send the details to the lead again">
                <Send className="h-3.5 w-3.5" /> Confirm with lead
              </Button>
            )}
            {onEdit && (
              <Button size="sm" variant="ghost" className="h-8 gap-1.5" disabled={busy} onClick={onEdit}>
                <Pencil className="h-3.5 w-3.5" /> Reschedule
              </Button>
            )}
            <Button size="sm" variant="ghost" className="h-8 gap-1.5 text-muted-foreground" disabled={busy} onClick={() => setOutcomeFor("cancelled")}>
              <X className="h-3.5 w-3.5" /> Cancel
            </Button>
          </>
        )}
        {!scheduled && (
          <Button size="sm" variant="ghost" className="h-8 gap-1.5 text-muted-foreground" disabled={busy} onClick={() => run(() => reopenMeetingAction(m.id), "Meeting reopened")}>
            <RotateCcw className="h-3.5 w-3.5" /> Reopen
          </Button>
        )}
      </div>

      <OutcomeDialog meeting={m} lead={lead} status={outcomeFor} onClose={() => setOutcomeFor(null)} />
    </div>
  );
}

function OutcomeDialog({
  meeting,
  lead,
  status,
  onClose,
}: {
  meeting: MeetingView;
  lead: { id: string; name: string; phone: string | null };
  status: OutcomeStatus | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [note, setNote] = React.useState("");
  const [next, setNext] = React.useState("");
  const [notify, setNotify] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [cancelText, setCancelText] = React.useState<string | null>(null);

  // No-show almost always needs a call back — prefill tomorrow 11 AM.
  React.useEffect(() => {
    if (!status) return;
    setNote("");
    setCancelText(null);
    if (status === "no_show") {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      d.setHours(11, 0, 0, 0);
      setNext(toLocalInput(d));
    } else setNext("");
  }, [status]);

  const copy = {
    completed: { title: "How did it go?", cta: "Mark done", placeholder: "What happened, what they liked, objections, next step…" },
    no_show: { title: "Lead didn't show up", cta: "Mark no-show", placeholder: "Optional note" },
    cancelled: { title: "Cancel this meeting?", cta: "Cancel meeting", placeholder: "Reason (optional)" },
  };
  const c = status ? copy[status] : null;

  async function save() {
    if (!status) return;
    const nextDate = next ? new Date(next) : null;
    if (nextDate && Number.isNaN(nextDate.getTime())) {
      toast({ variant: "destructive", title: "Pick a valid follow-up time" });
      return;
    }
    setSaving(true);
    try {
      const res = await setMeetingOutcomeAction(meeting.id, {
        status,
        outcome: note || null,
        nextFollowUpAt: nextDate ? nextDate.toISOString() : null,
        notifyLead: status === "cancelled" && notify,
      });
      if (!res.ok) {
        toast({ variant: "destructive", title: "Couldn't save", description: res.message });
        return;
      }
      toast({ title: status === "completed" ? "Meeting marked done" : status === "no_show" ? "Marked as no-show" : "Meeting cancelled", description: nextDate ? "Follow-up scheduled." : undefined });
      router.refresh();
      const notice = res.data.notice;
      // Cancelled + lead not reached automatically → offer the WhatsApp message.
      if (notice && notify && !notice.whatsappSent && lead.phone) setCancelText(notice.whatsappText);
      else onClose();
    } catch {
      toast({ variant: "destructive", title: "Couldn't save", description: "We couldn't reach the server. Please try again." });
    } finally {
      setSaving(false);
    }
  }

  const waLink = cancelText ? buildDeepLink("whatsapp", { name: lead.name, phone: lead.phone }, cancelText) : null;

  return (
    <Dialog open={!!status} onOpenChange={(o) => !o && !saving && onClose()}>
      <DialogContent className="max-w-md">
        {cancelText ? (
          <>
            <DialogHeader>
              <DialogTitle>Let the lead know</DialogTitle>
              <DialogDescription>Send the cancellation on WhatsApp.</DialogDescription>
            </DialogHeader>
            <pre className="whitespace-pre-wrap rounded-lg border bg-muted/40 p-3 font-sans text-xs text-muted-foreground">{cancelText}</pre>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={onClose}>Skip</Button>
              {waLink && (
                <Button
                  onClick={() => {
                    window.open(waLink, "_blank", "noopener,noreferrer");
                    void logLeadContactAction({ leadId: lead.id, channel: "whatsapp", message: cancelText });
                    onClose();
                  }}
                >
                  Send on WhatsApp
                </Button>
              )}
            </div>
          </>
        ) : (
          c && (
            <>
              <DialogHeader>
                <DialogTitle>{c.title}</DialogTitle>
                <DialogDescription>{meeting.title}</DialogDescription>
              </DialogHeader>
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder={c.placeholder} className="min-h-[80px]" />
              {status !== "cancelled" && (
                <label className="block space-y-1">
                  <span className="text-xs text-muted-foreground">Next follow-up call (optional)</span>
                  <Input type="datetime-local" value={next} onChange={(e) => setNext(e.target.value)} className="h-9 text-sm" />
                </label>
              )}
              {status === "cancelled" && (
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} className="h-4 w-4" />
                  Tell the lead it&apos;s cancelled
                </label>
              )}
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={onClose} disabled={saving}>Back</Button>
                <Button onClick={save} disabled={saving} variant={status === "cancelled" ? "destructive" : "default"}>
                  {saving ? "Saving…" : c.cta}
                </Button>
              </div>
            </>
          )
        )}
      </DialogContent>
    </Dialog>
  );
}
