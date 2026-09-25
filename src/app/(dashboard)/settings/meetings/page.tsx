import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, CalendarCheck, BellRing, MapPin, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { requireOrg, hasPermission } from "@/lib/rbac";
import { MeetingService } from "@/domains/meetings/service";
import { MeetingLocationsManager } from "@/components/settings/MeetingLocationsManager";
import { MeetingTemplatesForm } from "@/components/settings/MeetingTemplatesForm";
import { BookingLinkCard } from "@/components/settings/BookingLinkCard";
import { GoogleCalendarService } from "@/domains/integrations/googleCalendarService";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { eq } from "drizzle-orm";

const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const h12 = (h: number) => (h === 24 ? "12 AM" : `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? "AM" : "PM"}`);

// "Mon–Sat", "Mon, Wed, Fri", "Every day"
function daysLabel(days: number[]) {
  const d = [...new Set(days)].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)); // Monday first
  if (d.length === 0 || d.length === 7) return "Every day";
  const idx = d.map((x) => (x + 6) % 7);
  const run = idx.every((v, i) => i === 0 || v === idx[i - 1] + 1);
  return run && d.length > 2 ? `${DAY[d[0]]}–${DAY[d[d.length - 1]]}` : d.map((x) => DAY[x]).join(", ");
}

function Section({ icon: Icon, title, desc, children }: { icon: React.ElementType; title: string; desc: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded-2xl border bg-card p-5">
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 h-5 w-5 text-muted-foreground" />
        <div>
          <h3 className="font-semibold">{title}</h3>
          <p className="text-sm text-muted-foreground">{desc}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

export default async function MeetingSettingsPage() {
  if (!(await hasPermission("settings.manage"))) redirect("/meetings");
  const { organizationId, userId } = await requireOrg();
  const [locations, [org], googleConnected] = await Promise.all([
    MeetingService.listLocations(organizationId),
    db
      .select({
        slug: organizations.slug,
        name: organizations.name,
        addressLine1: organizations.addressLine1,
        city: organizations.city,
        timezone: organizations.timezone,
        workDays: organizations.workDays,
        workStartHour: organizations.workStartHour,
        workEndHour: organizations.workEndHour,
        whatsappMode: organizations.whatsappMode,
        confirmTemplate: organizations.meetingConfirmTemplate,
        reminderTemplate: organizations.meetingReminderTemplate,
        language: organizations.meetingTemplateLanguage,
      })
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1),
    GoogleCalendarService.isConnected(userId).catch(() => false),
  ]);
  const bsp = org?.whatsappMode === "bsp";
  const inPersonAt = locations[0]
    ? `${locations[0].name}${locations[0].address ? ` — ${locations[0].address}` : ""}`
    : [org?.addressLine1, org?.city].filter(Boolean).join(", ");

  return (
    <div className="flex-1 space-y-6 p-4 pt-4 sm:p-8 sm:pt-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <Link href="/settings"><Button variant="ghost" size="icon" aria-label="Go back"><ArrowLeft className="h-5 w-5" /></Button></Link>
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Meetings &amp; booking</h2>
          <p className="text-sm text-muted-foreground">Let customers book a call or visit, and send them the time, address and reminders automatically.</p>
        </div>
      </div>

      <Section icon={CalendarCheck} title="Your booking page" desc="Share this link on WhatsApp, Instagram or your website. Customers pick a time; you get the request as a lead.">
        {org?.slug && <BookingLinkCard slug={org.slug} />}
        <ul className="space-y-1 text-sm">
          <li>
            <span className="text-muted-foreground">Open for booking:</span>{" "}
            {daysLabel(org?.workDays ?? [])}, {h12(org?.workStartHour ?? 9)}–{h12(org?.workEndHour ?? 20)} ({org?.timezone}) ·{" "}
            <Link href="/settings#business-hours" className="underline underline-offset-2">change business hours</Link>
          </li>
          <li><span className="text-muted-foreground">Meeting length:</span> 30 minutes, up to 2 weeks ahead</li>
          <li>
            <span className="text-muted-foreground">In-person visits at:</span>{" "}
            {inPersonAt || <span className="text-amber-600">no address yet — add a location below or your shop address in General</span>}
          </li>
          <li><span className="text-muted-foreground">Who gets it:</span> the lead&apos;s owner (or your auto-assign rules); if nobody, admins are notified</li>
        </ul>
      </Section>

      <Section icon={MapPin} title="Locations" desc="Your stores, offices or branches. Pick one in a tap when booking a visit — the customer gets the address, phone and map link.">
        <MeetingLocationsManager initial={locations} />
      </Section>

      <Section icon={Video} title="Online meetings" desc="Connect Google Calendar to add meetings to your calendar and create Google Meet links automatically.">
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span>
            Your Google Calendar:{" "}
            {googleConnected ? <b className="text-emerald-600">Connected</b> : <b className="text-amber-600">Not connected</b>}
          </span>
          <Button asChild variant="outline" size="sm">
            <Link href="/settings/integrations">{googleConnected ? "Manage" : "Connect Google Calendar"}</Link>
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">Each teammate connects their own calendar, so their meetings land on it.</p>
      </Section>

      <Section icon={BellRing} title="Reminders (automatic)" desc="Fewer no-shows with no extra work.">
        <ul className="list-disc space-y-1 pl-5 text-sm">
          <li>The customer gets a reminder <b>1 day before</b> and <b>1 hour before</b> (by email, and by WhatsApp {bsp ? "automatically" : "when you tap send"}).</li>
          <li>The person meeting them gets a phone alert <b>30 minutes before</b>.</li>
          <li>After the meeting, Ridhzo asks how it went so the next step isn&apos;t forgotten.</li>
        </ul>
      </Section>

      {bsp ? (
        <MeetingTemplatesForm
          initial={{ confirmTemplate: org?.confirmTemplate ?? null, reminderTemplate: org?.reminderTemplate ?? null, language: org?.language ?? "en" }}
        />
      ) : (
        <p className="text-xs text-muted-foreground">
          WhatsApp meeting templates are only needed with the WhatsApp Business API. You&apos;re sending from your own WhatsApp, so meeting messages open
          ready to send — nothing to set up.
        </p>
      )}
    </div>
  );
}
