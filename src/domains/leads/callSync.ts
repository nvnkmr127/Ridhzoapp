import { and, desc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { db } from "@/db";
import { leads } from "@/db/schema";
import { normalizePhone } from "@/lib/leads/normalize";
import { orgDialCode } from "@/lib/leads/orgDialCode";
import { recordLeadContact, type CallDirection } from "./contactLog";

export type DeviceCall = {
  externalRef: string; // the phone's call-log id — the same ref the in-app call logger sends
  number: string;
  direction: CallDirection;
  startedAt: Date;
  durationSec: number; // 0 = not answered
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
      money = new Intl.NumberFormat(fmt.locale, { style: "currency", currency: fmt.currency, notation: "compact", maximumFractionDigits: 1 }).format(n);
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
}): Promise<{ matched: number; logged: number }> {
  const { organizationId, userId, calls, canOpen, now = new Date() } = input;
  const dial = await orgDialCode(organizationId);
  // Leads are stored normalized ("+919876543210"); older rows may hold the raw digits.
  const keysFor = (n: string) => [...new Set([normalizePhone(n, dial), n.replace(/\D/g, "")].filter((k): k is string => !!k))];
  const allKeys = [...new Set(calls.flatMap((c) => keysFor(c.number)))];
  if (!allKeys.length) return { matched: 0, logged: 0 };

  const rows = await db
    .select({ id: leads.id, name: leads.name, phone: leads.phone, ownerId: leads.ownerId, createdAt: leads.createdAt })
    .from(leads)
    .where(and(eq(leads.organizationId, organizationId), isNull(leads.deletedAt), inArray(leads.phone, allKeys)));
  const byPhone = new Map(rows.map((r) => [r.phone!, r]));

  const allowed = new Map<string, boolean>();
  let matched = 0;
  let logged = 0;
  for (const call of calls) {
    const lead = keysFor(call.number).map((k) => byPhone.get(k)).find(Boolean);
    if (!lead || call.startedAt.getTime() < lead.createdAt.getTime() - BEFORE_LEAD_MS) continue;
    if (!allowed.has(lead.id)) allowed.set(lead.id, await canOpen(lead.id));
    if (!allowed.get(lead.id)) continue;
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

    if (call.direction === "incoming" && call.durationSec === 0 && now.getTime() - call.startedAt.getTime() < NOTIFY_WITHIN_MS) {
      const { NotificationService } = await import("@/domains/notifications/service");
      await NotificationService.create({
        userId: lead.ownerId ?? userId,
        type: "missed_call",
        title: "Missed call from {name}",
        titleVars: { name: lead.name },
        body: "Tap to reply on WhatsApp or call back",
        leadId: lead.id,
      }).catch(() => {});
    }
  }
  return { matched, logged };
}
