// Keeps Resend contacts (the newsletter audience) in step with platform users. Best-effort and
// server-only: never throws, no-ops without RESEND_API_KEY. Only users — tenants' leads never get
// Ridhzo mail. Properties (org, plan, plan_status) feed Resend segments.
import { Resend } from "resend";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { users, organizations } from "@/db/schema";

export const PLACEHOLDER_DOMAIN = "@phone.ridhzo.com"; // same value as lib/auth/googleLink.PHONE_EMAIL_DOMAIN

let client: Resend | null | undefined;
let propsReady = false;
const resend = () => (client !== undefined ? client : (client = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null));

// Resend rejects properties it doesn't know; define them once per process (already-exists errors are fine).
export async function ensureContactProperties(r: Resend) {
  if (propsReady) return;
  for (const key of ["org", "plan", "plan_status"]) await r.contactProperties.create({ key, type: "string", fallbackValue: "" });
  propsReady = true;
}

export type ContactInput = { email: string; firstName?: string | null; lastName?: string | null; org?: string | null; plan?: string | null; planStatus?: string | null; unsubscribed?: boolean; segmentId?: string };

// Update-then-create upsert. Returns true when Resend accepted it.
export async function upsertContact(c: ContactInput): Promise<boolean> {
  const r = resend();
  if (!r || c.email.endsWith(PLACEHOLDER_DOMAIN)) return false;
  try {
    await ensureContactProperties(r);
    const data = {
      email: c.email,
      firstName: c.firstName ?? undefined,
      lastName: c.lastName ?? undefined,
      unsubscribed: c.unsubscribed ?? false,
      properties: { org: c.org ?? "", plan: c.plan ?? "", plan_status: c.planStatus ?? "" },
    };
    let { error } = await r.contacts.update(data);
    if (error) ({ error } = await r.contacts.create({ ...data, segments: (c.segmentId ?? process.env.RESEND_SEGMENT_ID) ? [{ id: (c.segmentId ?? process.env.RESEND_SEGMENT_ID)! }] : undefined }));
    if (error) console.warn(`[contacts] ${c.email}: ${error.message}`);
    return !error;
  } catch (e) {
    console.warn("[contacts] sync failed", e);
    return false;
  }
}

// Re-sync every active user of one workspace (after a plan change or a new teammate).
export async function syncOrgContacts(organizationId: string) {
  if (!resend()) return;
  try {
    const rows = await db
      .select({ email: users.email, firstName: users.firstName, lastName: users.lastName, optOut: users.emailOptOut, org: organizations.name, plan: organizations.plan, planStatus: organizations.planStatus })
      .from(users)
      .leftJoin(organizations, eq(users.organizationId, organizations.id))
      .where(and(eq(users.organizationId, organizationId), eq(users.isActive, true), isNull(users.deletedAt)));
    for (const u of rows) {
      if (!u.email) continue; // phone-only people have no address to subscribe
      await upsertContact({ ...u, email: u.email, unsubscribed: u.optOut.includes("newsletter") });
      await new Promise((r) => setTimeout(r, 600)); // Resend default limit: 2 req/s
    }
  } catch (e) {
    console.warn("[contacts] org sync failed", e);
  }
}
