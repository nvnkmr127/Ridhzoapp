import { and, eq, inArray, isNull } from "drizzle-orm";
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

// A missed call older than this is history, not something to call back now — log it, don't ping.
const NOTIFY_WITHIN_MS = 24 * 60 * 60 * 1000;

// Logs the calls on a rep's phone that were with a lead (Android call-log sync, opt-in on the device).
// Only numbers that match a lead the rep may open are stored; every other number is dropped here and
// never written anywhere. Calls from before the lead existed are skipped so first-response times stay
// honest. Re-sending a call is harmless: recordLeadContact dedupes on externalRef.
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
    if (!lead || call.startedAt < lead.createdAt) continue;
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
        body: "Tap to call back",
        leadId: lead.id,
      }).catch(() => {});
    }
  }
  return { matched, logged };
}
