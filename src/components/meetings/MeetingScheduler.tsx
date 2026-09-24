"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Video, MapPin, Store, Users, CheckCircle2, Send, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLeadAction, type LeadUiAction } from "@/components/leads/leadEvents";
import { createMeetingAction, updateMeetingAction } from "@/lib/actions/meetings";
import { logLeadContactAction } from "@/lib/actions/messaging";
import { buildDeepLink } from "@/lib/messaging/deeplink";
import { MEETING_DURATIONS, MEETING_MODES, type MeetingMode, type MeetingView } from "@/domains/meetings/format";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

export interface MeetingLocationOption {
  id: string;
  name: string;
  address: string | null;
}

const MODE_ICONS: Record<MeetingMode, React.ElementType> = {
  online: Video,
  site_visit: MapPin,
  store_visit: Store,
  in_person: Users,
};

const pad = (n: number) => String(n).padStart(2, "0");
function toLocalInput(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function tomorrowAt(hour: number) {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(hour, 0, 0, 0);
  return d;
}

type Form = {
  mode: MeetingMode;
  startAt: string;
  durationMinutes: number;
  assigneeId: string;
  linkKind: "meet" | "paste";
  meetingUrl: string;
  locationId: string;
  locationName: string;
  address: string;
  mapUrl: string;
  title: string;
  notes: string;
  notifyLead: boolean;
};

function initialForm(m: MeetingView | undefined, defaults: { assigneeId: string; canAutoMeet: boolean; hasLocations: boolean }): Form {
  if (m) {
    return {
      mode: m.mode as MeetingMode,
      startAt: toLocalInput(new Date(m.startAt)),
      durationMinutes: m.durationMinutes,
      assigneeId: m.assigneeId ?? defaults.assigneeId,
      linkKind: "paste",
      meetingUrl: m.meetingUrl ?? "",
      locationId: "",
      locationName: m.locationName ?? "",
      address: m.address ?? "",
      mapUrl: m.mapUrl ?? "",
      title: m.title,
      notes: m.notes ?? "",
      notifyLead: true,
    };
  }
  return {
    mode: "online",
    startAt: toLocalInput(tomorrowAt(11)),
    durationMinutes: 30,
    assigneeId: defaults.assigneeId,
    linkKind: defaults.canAutoMeet ? "meet" : "paste",
    meetingUrl: "",
    locationId: "",
    locationName: "",
    address: "",
    mapUrl: "",
    title: "",
    notes: "",
    notifyLead: true,
  };
}

type Done = { whatsappText: string; emailed: boolean; whatsappSent: boolean; moved: boolean };

// The one dialog for booking or editing a meeting with a lead. Mounted once on the lead page and
// opened via the lead event bus ({ type: "meeting" }) from the header, the NBA card and the Meetings tab.
export function MeetingScheduler({
  lead,
  users,
  locations,
  canAutoMeet,
  canManageLocations,
  defaultAssigneeId,
}: {
  lead: { id: string; name: string; phone: string | null; email: string | null };
  users: { id: string; name: string }[];
  locations: MeetingLocationOption[];
  canAutoMeet: boolean;
  canManageLocations: boolean;
  defaultAssigneeId: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<MeetingView | undefined>();
  const defaults = { assigneeId: defaultAssigneeId, canAutoMeet, hasLocations: locations.length > 0 };
  const [f, setF] = React.useState<Form>(() => initialForm(undefined, defaults));
  const [saving, setSaving] = React.useState(false);
  const [done, setDone] = React.useState<Done | null>(null);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((s) => ({ ...s, [k]: v }));

  const onLeadAction = React.useCallback(
    (a: LeadUiAction) => {
      if (a.type !== "meeting") return;
      setEditing(a.meeting);
      setF(initialForm(a.meeting, defaults));
      setDone(null);
      setOpen(true);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [defaultAssigneeId, canAutoMeet, locations.length],
  );
  useLeadAction(onLeadAction);

  // Store visits default to the first saved location.
  const pickMode = (mode: MeetingMode) =>
    setF((s) => ({
      ...s,
      mode,
      locationId: mode === "store_visit" && !s.locationId && !s.address && locations[0] ? locations[0].id : s.locationId,
    }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const start = new Date(f.startAt);
    if (!f.startAt || Number.isNaN(start.getTime())) {
      toast({ variant: "destructive", title: "Pick a date and time first" });
      return;
    }
    const online = f.mode === "online";
    const useSaved = !online && !!f.locationId;
    const payload = {
      mode: f.mode,
      title: f.title || null,
      startAt: start.toISOString(),
      durationMinutes: f.durationMinutes,
      assigneeId: f.assigneeId || null,
      autoMeet: online && f.linkKind === "meet",
      meetingUrl: online && f.linkKind === "paste" ? f.meetingUrl || null : null,
      locationId: useSaved ? f.locationId : null,
      locationName: !online && !useSaved ? f.locationName || null : null,
      address: !online && !useSaved ? f.address || null : null,
      mapUrl: !online && !useSaved ? f.mapUrl || null : null,
      notes: f.notes || null,
      notifyLead: f.notifyLead,
    };
    setSaving(true);
    try {
      const res = editing ? await updateMeetingAction(editing.id, payload) : await createMeetingAction(lead.id, payload);
      if (!res.ok) {
        toast({ variant: "destructive", title: editing ? "Meeting not updated" : "Meeting not scheduled", description: res.message });
        return;
      }
      const moved = !editing || new Date(editing.startAt).getTime() !== start.getTime();
      router.refresh();
      if (!moved) {
        toast({ title: "Meeting updated" });
        setOpen(false);
        return;
      }
      setDone({ ...res.data.notice, moved });
    } catch {
      toast({ variant: "destructive", title: "Meeting not saved", description: "We couldn't reach the server. Please try again." });
    } finally {
      setSaving(false);
    }
  }

  const waLink = done && lead.phone ? buildDeepLink("whatsapp", { name: lead.name, phone: lead.phone }, done.whatsappText) : null;
  async function sendWhatsApp() {
    if (!waLink || !done) return;
    window.open(waLink, "_blank", "noopener,noreferrer");
    const res = await logLeadContactAction({ leadId: lead.id, channel: "whatsapp", message: done.whatsappText }).catch(() => null);
    if (res && !res.ok) toast({ variant: "destructive", title: "Opened WhatsApp, but couldn't log it", description: res.message });
    setOpen(false);
    router.refresh();
  }

  const selectedLocation = locations.find((l) => l.id === f.locationId);

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && setOpen(o)}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        {done ? (
          <div className="space-y-4">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                {editing ? "Meeting rescheduled" : "Meeting scheduled"}
              </DialogTitle>
              <DialogDescription>Let {lead.name.split(" ")[0] || "the lead"} know so they turn up.</DialogDescription>
            </DialogHeader>
            {(done.emailed || done.whatsappSent) && (
              <p className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm">
                <Mail className="h-4 w-4 text-muted-foreground" />
                {[done.emailed && "Emailed", done.whatsappSent && "WhatsApp sent"].filter(Boolean).join(" · ")} to the lead automatically.
              </p>
            )}
            {!done.whatsappSent && (
              <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-lg border bg-muted/40 p-3 font-sans text-xs text-muted-foreground">{done.whatsappText}</pre>
            )}
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Button variant="outline" onClick={() => setOpen(false)}>Done</Button>
              {!done.whatsappSent && waLink && (
                <Button onClick={sendWhatsApp} className="gap-1.5">
                  <Send className="h-4 w-4" /> Send on WhatsApp
                </Button>
              )}
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <DialogHeader>
              <DialogTitle>{editing ? "Edit meeting" : "Schedule meeting"}</DialogTitle>
              <DialogDescription>With {lead.name}</DialogDescription>
            </DialogHeader>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-label="Meeting type">
              {(Object.keys(MEETING_MODES) as MeetingMode[]).map((m) => {
                const Icon = MODE_ICONS[m];
                return (
                  <button
                    key={m}
                    type="button"
                    role="radio"
                    aria-checked={f.mode === m}
                    onClick={() => pickMode(m)}
                    className={cn(
                      "flex flex-col items-center gap-1 rounded-lg border px-2 py-2.5 text-xs font-medium transition-colors",
                      f.mode === m ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {MEETING_MODES[m]}
                  </button>
                );
              })}
            </div>

            <div className="grid grid-cols-3 gap-3">
              <label className="col-span-2 space-y-1">
                <span className="text-xs text-muted-foreground">Date & time *</span>
                <Input type="datetime-local" value={f.startAt} onChange={(e) => set("startAt", e.target.value)} required className="h-9 text-sm" />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-muted-foreground">Length</span>
                <Select value={String(f.durationMinutes)} onValueChange={(v) => set("durationMinutes", Number(v))}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MEETING_DURATIONS.map((d) => (
                      <SelectItem key={d} value={String(d)}>{d < 60 ? `${d} min` : `${d / 60} hr${d > 60 ? "s" : ""}`}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
            </div>

            {f.mode === "online" && (
              <div className="space-y-2">
                <span className="text-xs text-muted-foreground">Meeting link</span>
                <div className="grid grid-cols-2 gap-2">
                  {(["meet", "paste"] as const).map((k) => (
                    <button
                      key={k}
                      type="button"
                      disabled={k === "meet" && !canAutoMeet && !editing}
                      onClick={() => set("linkKind", k)}
                      className={cn(
                        "rounded-lg border px-2 py-2 text-xs font-medium disabled:opacity-50",
                        f.linkKind === k ? "border-foreground" : "border-border text-muted-foreground",
                      )}
                    >
                      {k === "meet" ? (editing ? "Keep current link" : "Create Google Meet") : "Paste a link (Zoom, Teams…)"}
                    </button>
                  ))}
                </div>
                {f.linkKind === "paste" && (
                  <Input type="url" placeholder="https://zoom.us/j/…" value={f.meetingUrl} onChange={(e) => set("meetingUrl", e.target.value)} className="h-9 text-sm" />
                )}
                {!canAutoMeet && !editing && (
                  <p className="text-xs text-muted-foreground">
                    <Link href="/settings/integrations" className="underline">Connect Google Calendar</Link> to create Meet links automatically.
                  </p>
                )}
              </div>
            )}

            {f.mode !== "online" && (
              <div className="space-y-2">
                {locations.length > 0 && (f.mode === "store_visit" || f.mode === "in_person") && (
                  <label className="block space-y-1">
                    <span className="text-xs text-muted-foreground">Where</span>
                    <Select value={f.locationId || "custom"} onValueChange={(v) => v && set("locationId", v === "custom" ? "" : v)}>
                      <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {locations.map((l) => (
                          <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                        ))}
                        <SelectItem value="custom">Another place…</SelectItem>
                      </SelectContent>
                    </Select>
                    {selectedLocation?.address && <span className="block text-xs text-muted-foreground">{selectedLocation.address}</span>}
                  </label>
                )}
                {!f.locationId && (
                  <>
                    {f.mode !== "site_visit" && (
                      <Input placeholder="Place name (e.g. Banjara Hills showroom)" value={f.locationName} onChange={(e) => set("locationName", e.target.value)} className="h-9 text-sm" />
                    )}
                    <Textarea
                      placeholder={f.mode === "site_visit" ? "Site address" : "Address"}
                      value={f.address}
                      onChange={(e) => set("address", e.target.value)}
                      className="min-h-[60px]"
                    />
                    <Input type="url" placeholder="Google Maps link (optional)" value={f.mapUrl} onChange={(e) => set("mapUrl", e.target.value)} className="h-9 text-sm" />
                  </>
                )}
                {f.mode === "store_visit" && locations.length === 0 && canManageLocations && (
                  <p className="text-xs text-muted-foreground">
                    Tip: <Link href="/settings/meetings" className="underline">save your stores and offices</Link> to pick them in one tap.
                  </p>
                )}
              </div>
            )}

            {users.length > 1 && (
              <label className="block space-y-1">
                <span className="text-xs text-muted-foreground">Who attends</span>
                <Select value={f.assigneeId} onValueChange={(v) => set("assigneeId", v)}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Pick a team member" /></SelectTrigger>
                  <SelectContent>
                    {users.map((u) => (
                      <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
            )}

            <Input placeholder="Title (optional)" value={f.title} onChange={(e) => set("title", e.target.value)} className="h-9 text-sm" />
            <Textarea placeholder="Notes for the team (optional)" value={f.notes} onChange={(e) => set("notes", e.target.value)} className="min-h-[60px]" />

            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" checked={f.notifyLead} onChange={(e) => set("notifyLead", e.target.checked)} className="mt-0.5 h-4 w-4" />
              <span>
                {editing ? "Tell the lead if the time changes" : "Send confirmation to the lead"}
                <span className="block text-xs text-muted-foreground">
                  {lead.email ? "Emailed automatically. " : ""}
                  {lead.phone ? "You'll get a ready WhatsApp message to send." : ""}
                  {!lead.email && !lead.phone ? "This lead has no email or phone." : ""}
                </span>
              </span>
            </label>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving ? "Saving…" : editing ? "Save changes" : "Schedule"}</Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
