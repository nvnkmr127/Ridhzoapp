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

// Send an email. When `organizationId` is given and that tenant has turned on its own SMTP server,
// it's sent from there — and a failure throws (recorded on the settings page) rather than going out
// from the platform address. Otherwise the shared Resend transport is used (console in dev).
// The settings service is imported lazily so nodemailer never enters client/edge bundles.
export async function sendEmail(mail: Mail, organizationId?: string): Promise<void> {
  if (organizationId) {
    const { EmailSettingsService } = await import("@/domains/organizations/emailSettingsService");
    if (await EmailSettingsService.sendForOrg(organizationId, mail)) return;
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
      base = "https://app.ridhzo.com";
    }
  }
  return `${base.replace(/\/$/, "")}${path}`;
}
