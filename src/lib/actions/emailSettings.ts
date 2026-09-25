"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/rbac";
import { EmailSettingsService, type EmailSettingsInput } from "@/domains/organizations/emailSettingsService";
import { AuditService } from "@/domains/audit/service";
import { RateLimiter } from "@/lib/rate-limit";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { ok, fail, actionFail, zodFieldErrors, type ActionError } from "@/lib/actions/result";

const blank = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);
const optText = z.preprocess(blank, z.string().trim().max(255).nullable());
const optEmail = (msg: string) => z.preprocess(blank, z.string().trim().email(msg).max(255).nullable());

const schema = z.object({
  fromName: optText,
  fromEmail: optEmail("Enter a valid from-address."),
  replyTo: optEmail("Enter a valid reply-to address."),
  // Just the hostname — no scheme, port or path.
  smtpHost: z.preprocess(blank, z.string().trim().max(255).regex(/^[A-Za-z0-9.-]+$/, "Enter just the hostname, e.g. smtp.acme.com.").nullable()),
  smtpPort: z.preprocess(blank, z.coerce.number({ message: "Port must be a number." }).int("Port must be a number.").min(1, "Port must be 1–65535.").max(65535, "Port must be 1–65535.").nullable()),
  smtpUser: optText,
  smtpPassword: z.string().max(512).optional(), // blank = keep existing
  enabled: z.boolean(),
});
export type EmailSettingsForm = z.input<typeof schema>;

function parse(input: EmailSettingsForm): EmailSettingsInput | ActionError {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors = zodFieldErrors(parsed.error);
    return fail("VALIDATION", Object.values(fieldErrors)[0] ?? "Please check the form.", fieldErrors);
  }
  return parsed.data as EmailSettingsInput;
}

// SMTP host/credential errors belong on the form fields where possible.
function smtpFail(e: unknown): ActionError {
  const msg = e instanceof Error ? e.message : "SMTP send failed";
  const fieldErrors = (e as { fieldErrors?: Record<string, string> })?.fieldErrors;
  if (fieldErrors) return fail("VALIDATION", msg, fieldErrors);
  if (/private or reserved|could not be resolved/i.test(msg)) return fail("VALIDATION", msg, { smtpHost: msg });
  return fail("SERVER", `Test failed: ${msg}`);
}

// Sends a test of `input` (unsaved edits included) to the caller. Throttled: it makes an outbound
// connection to an admin-chosen host.
async function runTest(organizationId: string, userId: string, input: EmailSettingsInput): Promise<ActionError | { sentTo: string }> {
  const limit = await RateLimiter.checkLimit(`smtp-test:${organizationId}`, 5, 60);
  if (!limit.success) return fail("RATE_LIMIT", "Too many test emails. Please wait a minute and try again.");
  const [u] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
  if (!u?.email) return fail("VALIDATION", "Your account has no email address to send the test to.");
  try {
    const cfg = await EmailSettingsService.resolveConfig(organizationId, input);
    await EmailSettingsService.sendTest(cfg, u.email);
    return { sentTo: u.email };
  } catch (e) {
    return smtpFail(e);
  }
}

async function save(organizationId: string, userId: string, input: EmailSettingsInput, verified: boolean) {
  const existing = await EmailSettingsService.getRaw(organizationId);
  const view = await EmailSettingsService.upsert(organizationId, input, { verified });
  await AuditService.log({
    organizationId,
    userId,
    action: "settings.email_updated",
    entityType: "email_settings",
    metadata: { enabled: input.enabled, host: input.smtpHost, credentialsChanged: EmailSettingsService.credentialsChanged(existing, input) },
  });
  revalidatePath("/settings/email");
  return view;
}

export async function updateEmailSettingsAction(form: EmailSettingsForm) {
  const { organizationId, userId } = await requirePermission("settings.manage");
  const input = parse(form);
  if ("ok" in input) return input;
  try {
    // Turning it on (or changing credentials while on) must pass a test first — a broken config
    // never goes live. A config already verified and unchanged saves without re-sending.
    const existing = await EmailSettingsService.getRaw(organizationId);
    const needsTest = input.enabled && (!existing?.verifiedAt || EmailSettingsService.credentialsChanged(existing, input));
    if (needsTest) {
      const res = await runTest(organizationId, userId, input);
      if ("ok" in res) return res;
    }
    return ok({ view: await save(organizationId, userId, input, needsTest), tested: needsTest });
  } catch (e) {
    return actionFail(e);
  }
}

// Tests the form as it is now; on success saves it and marks it verified.
export async function sendTestEmailAction(form: EmailSettingsForm) {
  const { organizationId, userId } = await requirePermission("settings.manage");
  const input = parse(form);
  if ("ok" in input) return input;
  const res = await runTest(organizationId, userId, input);
  if ("ok" in res) return res;
  try {
    return ok({ sentTo: res.sentTo, view: await save(organizationId, userId, input, true) });
  } catch (e) {
    return actionFail(e);
  }
}

export async function removeEmailSettingsAction() {
  const { organizationId, userId } = await requirePermission("settings.manage");
  try {
    await EmailSettingsService.remove(organizationId);
    await AuditService.log({ organizationId, userId, action: "settings.email_removed", entityType: "email_settings" });
    revalidatePath("/settings/email");
    return ok({ view: await EmailSettingsService.getView(organizationId) });
  } catch (e) {
    return actionFail(e);
  }
}
