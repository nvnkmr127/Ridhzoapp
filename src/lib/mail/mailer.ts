// Mailer backed by the Resend SDK. With RESEND_API_KEY set it sends via Resend; otherwise it logs
// to the console so invite/notification flows work end-to-end in dev.
import { Resend } from "resend";

type Mail = { to: string; subject: string; html: string };

const FROM = process.env.MAIL_FROM || "Ridhzo <onboarding@resend.dev>";

// Lazily construct one client (reads the key at first use, then caches null-or-client).
let client: Resend | null | undefined;
function resend(): Resend | null {
  if (client !== undefined) return client;
  const key = process.env.RESEND_API_KEY;
  client = key ? new Resend(key) : null;
  return client;
}

// Send via the tenant's own SMTP server. nodemailer + the settings service are imported lazily so
// they never enter client/edge bundles. Returns true if it sent, false if this org has no usable
// SMTP config (caller then falls back to the shared transport).
async function sendViaOrgSmtp(organizationId: string, mail: Mail): Promise<boolean> {
  const { EmailSettingsService } = await import("@/domains/organizations/emailSettingsService");
  const cfg = await EmailSettingsService.getSendingConfig(organizationId);
  if (!cfg) return false;
  const nodemailer = (await import("nodemailer")).default;
  const transport = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.user, pass: cfg.pass },
  });
  const from = cfg.fromName ? `${cfg.fromName} <${cfg.fromEmail}>` : cfg.fromEmail;
  await transport.sendMail({ from, to: mail.to, subject: mail.subject, html: mail.html });
  return true;
}

// Send an email. When `organizationId` is given and that tenant has SMTP configured, it's sent from
// the tenant's own mail server; otherwise the shared Resend transport is used (console in dev).
export async function sendEmail(mail: Mail, organizationId?: string): Promise<void> {
  if (organizationId) {
    try {
      if (await sendViaOrgSmtp(organizationId, mail)) return;
    } catch (e) {
      // A misconfigured tenant SMTP shouldn't silently drop the mail — fall back to the shared
      // transport, but log so the tenant can fix their settings.
      console.error("[mail] tenant SMTP send failed, falling back to shared transport", (e as Error)?.message);
    }
  }

  const r = resend();
  if (!r) {
    console.log(`[mail:dev] to=${mail.to} subject="${mail.subject}"\n${mail.html}`);
    return;
  }
  const { error } = await r.emails.send({ from: FROM, to: mail.to, subject: mail.subject, html: mail.html });
  if (error) {
    throw new Error(`Email send failed: ${error.name ? `${error.name}: ` : ""}${error.message}`);
  }
}

export function appUrl(path: string) {
  let base = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL;
  if (!base || (process.env.NODE_ENV === "production" && base.includes("localhost"))) {
    if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
      base = `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
    } else if (process.env.VERCEL_URL) {
      base = `https://${process.env.VERCEL_URL}`;
    } else {
      base = "https://ridhzo.vercel.app";
    }
  }
  return `${base.replace(/\/$/, "")}${path}`;
}
