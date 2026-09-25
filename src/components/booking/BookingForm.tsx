"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { requestMeetingAction } from "@/lib/actions/booking";
import { localDate, wallTimeToUtc } from "@/lib/workHours";

export type BookingSchedule = { timezone: string; workDays: number[]; workStartHour: number; workEndHour: number };

const SLOT = 30; // minutes — matches BOOKING_SLOT_MINUTES on the server
const DAYS_AHEAD = 14;

const hm = (mins: number) => `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
const label12 = (mins: number) => {
  const h = Math.floor(mins / 60), m = mins % 60;
  return `${h % 12 === 0 ? 12 : h % 12}${m ? `:${String(m).padStart(2, "0")}` : ""} ${h < 12 ? "AM" : "PM"}`;
};

// Open days (business-local dates) in the next two weeks, and the free 30-min slots on a given day.
function openDays(s: BookingSchedule, now: Date) {
  const days: { date: string; label: string }[] = [];
  for (let i = 0; i <= DAYS_AHEAD; i++) {
    const date = localDate(new Date(now.getTime() + i * 86_400_000), s.timezone);
    if (days.some((d) => d.date === date)) continue;
    const noon = new Date(`${date}T12:00:00Z`);
    if (s.workDays.length && !s.workDays.includes(noon.getUTCDay())) continue;
    if (slotsFor(s, date, now).length === 0) continue;
    const label = i === 0 ? "Today" : noon.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
    days.push({ date, label });
  }
  return days;
}

function slotsFor(s: BookingSchedule, date: string, now: Date) {
  const out: number[] = [];
  for (let m = s.workStartHour * 60; m + SLOT <= s.workEndHour * 60; m += SLOT) {
    const at = wallTimeToUtc(date, Math.floor(m / 60), m % 60, s.timezone);
    if (at.getTime() >= now.getTime() + 15 * 60_000) out.push(m);
  }
  return out;
}

export function BookingForm({ slug, schedule }: { slug: string; schedule: BookingSchedule }) {
  const { toast } = useToast();
  const [f, setF] = React.useState({ name: "", email: "", phone: "", message: "", mode: "online" as "online" | "in_person" });
  const [date, setDate] = React.useState("");
  const [time, setTime] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [done, setDone] = React.useState<string | null>(null);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((s) => ({ ...s, [k]: v }));

  // Computed after mount so server and browser render the same markup (slots depend on "now").
  const [now, setNow] = React.useState<Date | null>(null);
  React.useEffect(() => setNow(new Date()), []);
  const days = React.useMemo(() => (now ? openDays(schedule, now) : []), [now, schedule]);
  const slots = React.useMemo(() => (now && date ? slotsFor(schedule, date, now) : []), [now, date, schedule]);
  React.useEffect(() => {
    if (!date && days[0]) setDate(days[0].date);
  }, [days, date]);

  const tzName = React.useMemo(() => {
    try {
      return new Intl.DateTimeFormat("en-IN", { timeZone: schedule.timezone, timeZoneName: "long" }).formatToParts(new Date()).find((p) => p.type === "timeZoneName")?.value ?? schedule.timezone;
    } catch {
      return schedule.timezone;
    }
  }, [schedule.timezone]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!f.name.trim() || !date || !time || (!f.email && !f.phone)) return;
    setSaving(true);
    try {
      const res = await requestMeetingAction({ slug, ...f, date, time });
      if (!res.ok) {
        toast({ variant: "destructive", title: "Could not book", description: res.message });
        return;
      }
      const d = days.find((x) => x.date === date)?.label ?? date;
      setDone(`${d} at ${label12(Number(time.slice(0, 2)) * 60 + Number(time.slice(3)))}`);
    } catch {
      toast({ variant: "destructive", title: "Could not book", description: "We couldn't reach the server. Please try again." });
    } finally {
      setSaving(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-lg border border-border bg-muted p-6 text-foreground text-sm">
        Thanks! Your request for <b>{done}</b> has been sent. We&apos;ll confirm with you shortly.
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-1"><Label htmlFor="name">Your name *</Label><Input id="name" value={f.name} onChange={(e) => set("name", e.target.value)} required /></div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1"><Label htmlFor="phone">Phone / WhatsApp</Label><Input id="phone" type="tel" value={f.phone} onChange={(e) => set("phone", e.target.value)} placeholder="98765 43210" /></div>
        <div className="space-y-1"><Label htmlFor="email">Email</Label><Input id="email" type="email" value={f.email} onChange={(e) => set("email", e.target.value)} /></div>
      </div>
      <div className="space-y-1">
        <Label>How would you like to meet?</Label>
        <div className="grid grid-cols-2 gap-2" role="radiogroup">
          {([["online", "Online (video call)"], ["in_person", "In person"]] as const).map(([k, label]) => (
            <button key={k} type="button" role="radio" aria-checked={f.mode === k} onClick={() => set("mode", k)}
              className={`rounded-md border px-3 py-2 text-sm ${f.mode === k ? "border-foreground font-medium" : "border-input text-muted-foreground"}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label>Pick a day *</Label>
        {now && days.length === 0 ? (
          <p className="text-sm text-muted-foreground">No open times in the next two weeks. Please call or message us instead.</p>
        ) : (
          <div className="flex gap-2 overflow-x-auto pb-1" role="radiogroup" aria-label="Day">
            {days.map((d) => (
              <button key={d.date} type="button" role="radio" aria-checked={date === d.date}
                onClick={() => { setDate(d.date); setTime(""); }}
                className={`shrink-0 rounded-md border px-3 py-2 text-sm ${date === d.date ? "border-foreground font-medium" : "border-input text-muted-foreground"}`}>
                {d.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {date && (
        <div className="space-y-2">
          <Label>Pick a time *</Label>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4" role="radiogroup" aria-label="Time">
            {slots.map((m) => (
              <button key={m} type="button" role="radio" aria-checked={time === hm(m)} onClick={() => setTime(hm(m))}
                className={`rounded-md border px-2 py-2 text-sm ${time === hm(m) ? "border-foreground font-medium" : "border-input text-muted-foreground"}`}>
                {label12(m)}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">Times are in {tzName}. Each meeting is {SLOT} minutes.</p>
        </div>
      )}

      <div className="space-y-1">
        <Label htmlFor="message">Anything we should know?</Label>
        <textarea id="message" rows={3} value={f.message} onChange={(e) => set("message", e.target.value)}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
      </div>
      <p className="text-xs text-muted-foreground">Give a phone number or email so we can confirm.</p>
      <Button type="submit" className="w-full" disabled={saving || !f.name.trim() || !date || !time || (!f.email && !f.phone)}>
        {saving ? "Sending…" : "Request meeting"}
      </Button>
    </form>
  );
}
