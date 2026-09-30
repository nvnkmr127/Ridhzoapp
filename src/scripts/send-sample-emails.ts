// Sends one sample of each platform email style to an address, to eyeball the branded template.
// Usage: npm run mail:samples -- you@example.com
import { sendEmail, appUrl, type Sender } from "@/lib/mail/mailer";

const to = process.argv[2];
if (!to) throw new Error("usage: npm run mail:samples -- <email>");

const p = (t: string) => `<div style="padding:8px 24px"><p>${t}</p></div>`;
const btn = (label: string, href: string) => `<div style="padding:0 24px 16px"><a href="${href}" style="background:#111;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:500;display:inline-block">${label}</a></div>`;

const samples: { from: Sender; subject: string; html: string }[] = [
  { from: "billing", subject: "[Sample] Ridhzo tax invoice INV-0001 — ₹1,180", html: p("Hi, thanks for your payment. Your GST tax invoice <strong>INV-0001</strong> for ₹1,180 (incl. GST) is ready.") + btn("View invoice", appUrl("/settings/billing")) },
  { from: "noreply", subject: "[Sample] Reset your Ridhzo password", html: p("We received a request to reset your password. This link expires in 1 hour.") + btn("Reset password", appUrl("/reset-password")) },
  { from: "noreply", subject: "[Sample] You've been invited to Acme", html: p("You've been invited to join <strong>Acme</strong>.") + btn("Accept your invitation", appUrl("/invite")) },
  { from: "notifications", subject: "[Sample] New lead assigned to you", html: p("Priya Sharma (Acme Traders) was just assigned to you.") + btn("Open in Ridhzo", appUrl("/leads")) },
  { from: "hello", subject: "[Sample] Re: your support request", html: p("Thanks for reaching out — we've looked into this and it's fixed.") + btn("Open your support requests", appUrl("/settings/support")) },
];

(async () => {
  for (const s of samples) { await sendEmail({ ...s, to }); console.log("sent:", s.subject); await new Promise((r) => setTimeout(r, 600)); }
})();
