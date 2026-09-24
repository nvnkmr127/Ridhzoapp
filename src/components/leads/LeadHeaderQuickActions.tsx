"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Phone, Mail, MessageSquare, Calendar, Clock, Trash2, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { QuickResponseDialog } from "@/components/leads/QuickResponseDialog";
import { EditLeadDialog } from "@/components/leads/EditLeadDialog";
import { DeleteLeadButton } from "@/components/leads/DeleteLeadButton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { updateLeadFollowUpAction } from "@/lib/actions/leads";
import { useToast } from "@/hooks/use-toast";
import { formatLocalDateTime, LocalTime } from "@/components/LocalTime";
import { useLogContact } from "@/components/leads/useLogContact";
import { cn } from "@/lib/utils";

interface LeadHeaderQuickActionsProps {
  lead: {
    id: string;
    name: string;
    email?: string | null;
    phone?: string | null;
    company?: string | null;
    nextFollowUpAt?: Date | string | null;
  };
  whatsappMode?: "personal" | "bsp";
}

const CALL_OUTCOMES = [
  { key: "answered", label: "Answered" },
  { key: "no_answer", label: "No answer" },
  { key: "busy", label: "Busy / call back" },
  { key: "wrong_number", label: "Wrong number" },
] as const;

// Follow-up presets relative to now. "Today 9 AM" used to be offered all day, which created an
// already-overdue follow-up after 9 AM — so "today" adapts to the time of day.
function followUpPresets(now = new Date()): { label: string; date: Date }[] {
  const at = (days: number, hour = 9) => {
    const d = new Date(now);
    d.setDate(d.getDate() + days);
    d.setHours(hour, 0, 0, 0);
    return d;
  };
  const out: { label: string; date: Date }[] = [];
  if (now.getHours() < 9) out.push({ label: "Today, 9:00 AM", date: at(0) });
  else if (now.getHours() < 19) {
    const d = new Date(now.getTime() + 2 * 60 * 60 * 1000);
    d.setMinutes(d.getMinutes() < 30 ? 30 : 60, 0, 0);
    out.push({ label: `Later today (${formatLocalDateTime(d, "time")})`, date: d });
  }
  out.push(
    { label: "Tomorrow, 9:00 AM", date: at(1) },
    { label: "In 3 days", date: at(3) },
    { label: "In 1 week", date: at(7) },
    { label: "In 1 month", date: at(30) },
    { label: "In 3 months", date: at(90) },
  );
  return out;
}

// Value for <input type="datetime-local"> in the user's local time.
function toLocalInputValue(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const actionBtn = "h-12 sm:h-9 px-1 sm:px-3 gap-1 sm:gap-1.5 text-xs font-medium flex-col sm:flex-row";

export function LeadHeaderQuickActions({ lead, whatsappMode = "personal" }: LeadHeaderQuickActionsProps) {
  const router = useRouter();
  const { toast } = useToast();
  const logContact = useLogContact(lead.id);
  const [reminderOpen, setReminderOpen] = useState(false);
  const [customDate, setCustomDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [callOpen, setCallOpen] = useState(false);
  const [callNote, setCallNote] = useState("");
  const [savingCall, setSavingCall] = useState(false);

  const phoneClean = lead.phone ? lead.phone.replace(/[^0-9+]/g, "") : "";
  const waUrl = phoneClean ? `https://wa.me/${phoneClean.replace("+", "")}` : "";

  const currentDate = lead.nextFollowUpAt ? new Date(lead.nextFollowUpAt) : null;
  const isOverdue = currentDate ? currentDate < new Date() : false;

  const handleSetFollowUp = async (targetDate: Date | null) => {
    setLoading(true);
    try {
      const res = await updateLeadFollowUpAction(lead.id, targetDate ? targetDate.toISOString() : null);
      if (!res.ok) {
        toast({ title: "Failed to update follow-up", description: res.message, variant: "destructive" });
        return;
      }
      toast({
        title: targetDate ? "Follow-up scheduled" : "Follow-up cleared",
        description: targetDate ? `Due ${formatLocalDateTime(targetDate, "datetime")}` : undefined,
      });
      setReminderOpen(false);
      setCustomDate("");
      router.refresh();
    } catch {
      toast({ title: "Failed to update follow-up", description: "We couldn't reach the server. Please try again.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const setCustom = () => {
    const d = new Date(customDate);
    if (!customDate || Number.isNaN(d.getTime())) {
      toast({ variant: "destructive", title: "Pick a date and time first" });
      return;
    }
    if (d < new Date()) {
      toast({ variant: "destructive", title: "That time has already passed", description: "Pick a time in the future." });
      return;
    }
    handleSetFollowUp(d);
  };

  const saveCall = async (outcome: (typeof CALL_OUTCOMES)[number]["key"]) => {
    setSavingCall(true);
    const done = await logContact({ channel: "call", outcome, note: callNote || undefined }, "Call logged");
    setSavingCall(false);
    if (done) {
      setCallOpen(false);
      setCallNote("");
      // A call that didn't connect almost always needs a retry — offer to schedule it right away.
      if (outcome === "no_answer" || outcome === "busy") setReminderOpen(true);
    }
  };

  return (
    <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
      {/* Contact actions: a 4-up grid of big tap targets on phones, a compact row on desktop. */}
      <div className="grid grid-cols-4 gap-2 sm:flex sm:flex-wrap">
        {lead.phone ? (
          <Button variant="outline" size="sm" className={actionBtn} asChild>
            <a href={`tel:${phoneClean}`} onClick={() => setCallOpen(true)} title={`Call ${lead.phone}`}>
              <Phone className="h-4 w-4 sm:h-3.5 sm:w-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>Call</span>
            </a>
          </Button>
        ) : (
          <Button variant="outline" size="sm" className={actionBtn} disabled title="No phone number">
            <Phone className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
            <span>Call</span>
          </Button>
        )}

        {waUrl ? (
          <Button variant="outline" size="sm" className={actionBtn} asChild>
            <a href={waUrl} target="_blank" rel="noopener noreferrer" onClick={() => logContact({ channel: "whatsapp" })} title="Open WhatsApp chat">
              <MessageSquare className="h-4 w-4 sm:h-3.5 sm:w-3.5 text-emerald-500" />
              <span>WhatsApp</span>
            </a>
          </Button>
        ) : (
          <Button variant="outline" size="sm" className={actionBtn} disabled title="No phone number">
            <MessageSquare className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
            <span>WhatsApp</span>
          </Button>
        )}

        {lead.email ? (
          <Button variant="outline" size="sm" className={actionBtn} asChild>
            <a href={`mailto:${lead.email}`} onClick={() => logContact({ channel: "email" })} title={`Email ${lead.email}`}>
              <Mail className="h-4 w-4 sm:h-3.5 sm:w-3.5 text-blue-500" />
              <span>Email</span>
            </a>
          </Button>
        ) : (
          <Button variant="outline" size="sm" className={actionBtn} disabled title="No email address">
            <Mail className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
            <span>Email</span>
          </Button>
        )}

        {/* Follow-up: the single place to schedule the next touch (the Follow-ups tab lists history). */}
        <Popover open={reminderOpen} onOpenChange={setReminderOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className={cn(
                actionBtn,
                isOverdue && "border-red-500/50 bg-red-500/10 text-red-600 dark:text-red-300",
                !isOverdue && currentDate && "border-primary/40",
              )}
              disabled={loading}
              title={currentDate ? `Next follow-up: ${formatLocalDateTime(currentDate, "datetime")}` : "Schedule a follow-up"}
            >
              {isOverdue ? <Clock className="h-4 w-4 sm:h-3.5 sm:w-3.5" /> : <Calendar className="h-4 w-4 sm:h-3.5 sm:w-3.5 text-amber-500" />}
              <span className="truncate max-w-full">
                {currentDate ? (
                  <>
                    <span className="sm:hidden">{isOverdue ? "Overdue" : "Follow-up"}</span>
                    <span className="hidden sm:inline">
                      {isOverdue ? "Overdue · " : "Follow-up · "}
                      <LocalTime iso={currentDate} mode="datetime" />
                    </span>
                  </>
                ) : (
                  "Follow-up"
                )}
              </span>
              <ChevronDown className="hidden sm:block h-3 w-3 opacity-60" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-2 space-y-1 text-sm" align="end">
            <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {currentDate ? (
                <>
                  {isOverdue ? "Overdue since " : "Due "}
                  <LocalTime iso={currentDate} mode="datetime" />
                </>
              ) : (
                "Schedule follow-up"
              )}
            </div>
            {followUpPresets().map((p) => (
              <button
                key={p.label}
                type="button"
                disabled={loading}
                onClick={() => handleSetFollowUp(p.date)}
                className="w-full rounded-md px-2.5 py-2 text-left hover:bg-muted transition-colors disabled:opacity-50"
              >
                {p.label}
              </button>
            ))}
            <div className="border-t pt-2 mt-1 space-y-2 px-1">
              <Input
                type="datetime-local"
                aria-label="Custom follow-up date and time"
                value={customDate}
                min={toLocalInputValue(new Date())}
                onChange={(e) => setCustomDate(e.target.value)}
                className="h-9 text-xs"
              />
              <Button size="sm" className="w-full" onClick={setCustom} disabled={loading || !customDate}>
                Set custom time
              </Button>
            </div>
            {currentDate && (
              <div className="border-t pt-1 mt-1">
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => handleSetFollowUp(null)}
                  className="w-full rounded-md px-2.5 py-2 text-left text-red-600 dark:text-red-300 hover:bg-red-500/10 transition-colors flex items-center gap-1.5 font-medium"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Clear follow-up
                </button>
              </div>
            )}
          </PopoverContent>
        </Popover>
      </div>

      <div className="flex flex-wrap items-center gap-2 [&>*]:flex-1 sm:[&>*]:flex-none">
        <QuickResponseDialog leadId={lead.id} leadName={lead.name} email={lead.email} phone={lead.phone} whatsappMode={whatsappMode} />
        <EditLeadDialog lead={lead} />
        <DeleteLeadButton leadId={lead.id} leadName={lead.name} />
      </div>

      {/* After tapping Call: capture how it went so the attempt is on record. */}
      <Dialog open={callOpen} onOpenChange={(o) => !savingCall && setCallOpen(o)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>How did the call go?</DialogTitle>
            <DialogDescription>Log it so your follow-ups and response times stay accurate.</DialogDescription>
          </DialogHeader>
          <Textarea
            value={callNote}
            onChange={(e) => setCallNote(e.target.value)}
            placeholder="Optional note — e.g. interested, call back after 5 PM"
            className="min-h-[72px]"
          />
          <div className="grid grid-cols-2 gap-2">
            {CALL_OUTCOMES.map((o) => (
              <Button key={o.key} variant={o.key === "answered" ? "default" : "outline"} disabled={savingCall} onClick={() => saveCall(o.key)}>
                {o.label}
              </Button>
            ))}
          </div>
          <button
            type="button"
            className="text-xs text-muted-foreground underline hover:text-foreground"
            onClick={() => setCallOpen(false)}
            disabled={savingCall}
          >
            I didn&apos;t call — don&apos;t log anything
          </button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
