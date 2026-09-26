import { and, desc, eq, inArray, isNotNull, isNull, gte, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { leads, users, activities, organizations } from "@/db/schema";
import { normalizePhone } from "@/lib/leads/normalize";
import { orgDialCode } from "@/lib/leads/orgDialCode";
import { DEFAULT_FORMAT } from "@/lib/format";
import { startOfZonedDay } from "@/lib/tz";
import { recordLeadContact, type CallDirection } from "./contactLog";

export type DeviceCall = {
  externalRef: string; // the phone's call-log id — the same ref the in-app call logger sends
  number: string;
  direction: CallDirection;
  startedAt: Date;
  durationSec: number; // 0 = not answered
  alertedOnDevice?: boolean; // the phone already showed "Missed call from …" when the call ended
};

const DAY_MS = 24 * 60 * 60 * 1000;
// A missed call older than this is history, not something to call back now — log it, don't ping.
const NOTIFY_WITHIN_MS = DAY_MS;
// An unknown caller the rep adds as a lead afterwards: that call belongs on the new lead's timeline.
// Anything older predates the lead and is skipped.
const BEFORE_LEAD_MS = DAY_MS;

// The match key the phone filters its call log with: the last 8 digits, so every way of writing a
// number agrees — "+91 98765 43210" / "098765 43210", "+971 50 123 4567" / "050 123 4567", and
// 8-digit Singapore numbers. It's only a prefilter: syncDeviceCalls still matches the full number.
export function phoneKey(phone: string | null | undefined): string | null {
  const d = (phone ?? "").replace(/\D/g, "");
  return d.length < 6 ? null : d.slice(-8);
}

// Phone numbers of the leads this rep may open (all the org's for an admin), as phoneKeys. The app
// only sends calls with these numbers — personal calls never leave the phone.
export async function leadPhoneKeys(organizationId: string, ownerId: string | null): Promise<string[]> {
  const rows = await db
    .select({ phone: leads.phone })
    .from(leads)
    .where(and(eq(leads.organizationId, organizationId), isNull(leads.deletedAt), isNotNull(leads.phone), ownerId ? eq(leads.ownerId, ownerId) : undefined));
  return [...new Set(rows.map((r) => phoneKey(r.phone)).filter((k): k is string => !!k))];
}

// The line under the lead's name on the phone's incoming-call alert: "Interested · ₹1.5L". Compact
// money in the org's own units (en-IN gives K / L / Cr).
export function callerLine(statusLabel: string | null | undefined, value: string | number | null | undefined, fmt: { currency: string; locale: string }) {
  const n = Number(value);
  let money: string | null = null;
  if (Number.isFinite(n) && n > 0) {
    try {
      money = new Intl.NumberFormat(fmt.locale, { style: "currency", currency: fmt.currency, notation: "compact", minimumFractionDigits: 0, maximumFractionDigits: 1 }).format(n);
    } catch {
      money = `${fmt.currency} ${Math.round(n)}`;
    }
  }
  return [statusLabel, money].filter(Boolean).join(" · ");
}

export type CallerEntry = { key: string; leadId: string; name: string; line: string };

// ponytail: newest 20k leads per phone (~2 MB); page it or move to a server lookup if orgs outgrow it.
const CALLER_DIRECTORY_CAP = 20_000;

// Caller ID for the Android app: who's calling, for every lead this rep may open (all for an admin).
// Stored on the phone so the incoming-call alert works with the app closed; wiped on sign-out.
export async function callerDirectory(organizationId: string, ownerId: string | null, fmt: { currency: string; locale: string }): Promise<CallerEntry[]> {
  const [{ CustomStatusSchemaService }, rows] = await Promise.all([
    import("./customStatusSchemaService"),
    db
      .select({ id: leads.id, name: leads.name, phone: leads.phone, status: leads.status, value: leads.expectedValue })
      .from(leads)
      .where(and(eq(leads.organizationId, organizationId), isNull(leads.deletedAt), isNotNull(leads.phone), ownerId ? eq(leads.ownerId, ownerId) : undefined))
      .orderBy(desc(leads.updatedAt))
      .limit(CALLER_DIRECTORY_CAP),
  ]);
  const labels = new Map((await CustomStatusSchemaService.getTenantStatusSchema(organizationId).catch(() => [])).map((s) => [s.key, s.label]));
  const seen = new Set<string>();
  const out: CallerEntry[] = [];
  for (const r of rows) {
    const key = phoneKey(r.phone);
    if (!key || seen.has(key)) continue; // same number on two leads: the most recently active wins
    seen.add(key);
    out.push({ key, leadId: r.id, name: r.name, line: callerLine(labels.get(r.status) ?? r.status, r.value, fmt) });
  }
  return out;
}

// Logs the calls on a rep's phone that were with a lead (Android call-log sync, opt-in on the device).
// The app already filters to lead numbers; this re-checks, so anything else is dropped here unwritten.
// Re-sending a call is harmless: recordLeadContact dedupes on externalRef.
export async function syncDeviceCalls(input: {
  organizationId: string;
  userId: string;
  calls: DeviceCall[];
  canOpen: (leadId: string) => Promise<boolean>;
  now?: Date;
}): Promise<{ matched: number; logged: number; completedFollowUpIds?: string[] }> {
  const { organizationId, userId, calls, canOpen, now = new Date() } = input;
  const dial = await orgDialCode(organizationId);
  // Leads are stored normalized ("+919876543210"); older rows may hold the raw digits.
  const keysFor = (n: string) => [...new Set([normalizePhone(n, dial), n.replace(/\D/g, "")].filter((k): k is string => !!k))];
  const allKeys = [...new Set(calls.flatMap((c) => keysFor(c.number)))];
  if (!allKeys.length) return { matched: 0, logged: 0 };
  // The phone picked these calls by the last 8 digits (phoneKey), like caller ID. Match that way too,
  // or a lead saved as "98765 43210" / with another prefix passes the phone's filter, gets uploaded,
  // and is dropped here. An exact match on the stored number still wins over a last-8 one.
  const lastEight = [...new Set(calls.map((c) => phoneKey(c.number)).filter((k): k is string => !!k))];
  const phoneLastEight = sql<string>`right(regexp_replace(${leads.phone}, '\\D', '', 'g'), 8)`;

  // The same number can sit on several leads (a duplicate, a colleague's copy). Pick like caller ID
  // does: the most recently active lead this rep may open — so the call lands on the lead whose name
  // the phone showed, and never on one they can't see while another one matches.
  const rows = await db
    .select({ id: leads.id, name: leads.name, phone: leads.phone, ownerId: leads.ownerId, createdAt: leads.createdAt, updatedAt: leads.updatedAt })
    .from(leads)
    .where(and(
      eq(leads.organizationId, organizationId),
      isNull(leads.deletedAt),
      or(inArray(leads.phone, allKeys), lastEight.length ? inArray(phoneLastEight, lastEight) : undefined),
    ))
    .orderBy(desc(leads.updatedAt));

  const allowed = new Map<string, boolean>();
  let matched = 0;
  let logged = 0;
  const completedFollowUpIds = new Set<string>();
  const mayOpen = async (id: string) => {
    if (!allowed.has(id)) allowed.set(id, await canOpen(id));
    return allowed.get(id)!;
  };
  for (const call of calls) {
    const exact = new Set(keysFor(call.number));
    const key = phoneKey(call.number);
    const candidates = rows
      .filter((l) => exact.has(l.phone!) || (!!key && phoneKey(l.phone) === key))
      .filter((l) => call.startedAt.getTime() >= l.createdAt.getTime() - BEFORE_LEAD_MS)
      .sort((a, b) => Number(!exact.has(a.phone!)) - Number(!exact.has(b.phone!)) || b.updatedAt.getTime() - a.updatedAt.getTime());
    let lead: (typeof candidates)[number] | undefined;
    for (const c of candidates) if (await mayOpen(c.id)) { lead = c; break; }
    if (!lead) continue;
    matched++;

    const res = await recordLeadContact({
      leadId: lead.id,
      userId,
      channel: "call",
      direction: call.direction,
      durationSec: call.durationSec,
      startedAt: call.startedAt,
      externalRef: call.externalRef,
    });
    if (!res.logged) continue;
    logged++;
    if (res.completedFollowUpIds) {
      res.completedFollowUpIds.forEach(id => completedFollowUpIds.add(id));
    }

    // Missed call → alert the rep whose phone rang (they can call straight back), and the lead's
    // owner too when that's someone else, so the owner knows their lead is trying to reach them.
    if (call.direction === "incoming" && call.durationSec === 0 && now.getTime() - call.startedAt.getTime() < NOTIFY_WITHIN_MS) {
      const { NotificationService } = await import("@/domains/notifications/service");
      for (const to of new Set([userId, lead.ownerId ?? userId])) {
        await NotificationService.create({
          userId: to,
          type: "missed_call",
          title: "Missed call from {name}",
          titleVars: { name: lead.name },
          body: to === userId ? "Tap to reply on WhatsApp or call back" : "They called a teammate's phone — tap to follow up",
          leadId: lead.id,
          // The rep's phone alerted them the moment the call ended: keep the bell entry, skip a
          // second push. The owner (someone else) still gets theirs.
          mobilePush: !(to === userId && call.alertedOnDevice),
        }).catch(() => {});
      }
    }
  }
  return { matched, logged, completedFollowUpIds: Array.from(completedFollowUpIds) };
}

// "Logged today" counts from midnight in the workspace's timezone, not the server's (UTC).
export async function getCallSyncStatus(userId: string, organizationId: string) {
  const [user] = await db
    .select({ lastCallSyncAt: users.lastCallSyncAt })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const [org] = await db.select({ timezone: organizations.timezone }).from(organizations).where(eq(organizations.id, organizationId)).limit(1);
  const timezone = org?.timezone || DEFAULT_FORMAT.timezone;
  const startOfDay = startOfZonedDay(new Date(), timezone);

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(activities)
    .where(
      and(
        eq(activities.userId, userId),
        eq(activities.type, "call"),
        isNotNull(activities.externalRef),
        gte(activities.occurredAt, startOfDay)
      )
    );

  return {
    lastSyncAt: user?.lastCallSyncAt || null,
    loggedToday: count || 0,
  };
}
