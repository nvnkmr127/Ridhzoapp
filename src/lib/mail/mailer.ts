// Mailer backed by the Resend SDK. With RESEND_API_KEY set it sends via Resend; otherwise it logs
// to the console so invite/notification flows work end-to-end in dev.
import { Resend } from "resend";
import { brandedHtml } from "./layout";

// `from` picks the platform sender: hello (support), notifications (alerts), billing (invoices/receipts),
// noreply (password resets, invites). Default = MAIL_FROM.
export type Sender = "hello" | "notifications" | "billing" | "noreply";
type Mail = { to: string; subject: string; html: string; from?: Sender };

const FROM = process.env.MAIL_FROM || "Ridhzo <onboarding@resend.dev>";
// Set MAIL_DOMAIN to the domain verified in Resend (e.g. send.ridhzo.com) to use these senders;
// unset = MAIL_FROM. Replies go to the same name at the root domain (MAIL_REPLY_DOMAIN, default ridhzo.com).
const NAMES: Record<Sender, string> = { hello: "Ridhzo", notifications: "Ridhzo Notifications", billing: "Ridhzo Billing", noreply: "Ridhzo" };
const LOCAL: Record<Sender, string> = { hello: "hello", notifications: "notifications", billing: "billing", noreply: "no-reply" };
function senderFor(k?: Sender) {
  const domain = process.env.MAIL_DOMAIN;
  if (!k || !domain) return { from: FROM };
  const reply = k === "noreply" ? undefined : `${LOCAL[k]}@${process.env.MAIL_REPLY_DOMAIN || "ridhzo.com"}`;
  return { from: `${NAMES[k]} <${LOCAL[k]}@${domain}>`, replyTo: reply };
}

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
    // Production must not report success for mail that went nowhere — or log bodies that carry
    // password-reset and invitation links.
    if (process.env.NODE_ENV === "production") throw new Error("Email is not configured (RESEND_API_KEY)");
    console.log(`[mail:dev] to=${mail.to} subject="${mail.subject}"\n${mail.html}`);
    return;
  }
  // Platform mail (has a `from` kind) gets the Ridhzo shell; tenant-to-lead mail stays unbranded.
  const html = mail.from ? brandedHtml(mail.html, appUrl("").replace(/\/$/, "")) : mail.html;
  const { error } = await r.emails.send({ ...senderFor(mail.from), to: mail.to, subject: mail.subject, html });
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
