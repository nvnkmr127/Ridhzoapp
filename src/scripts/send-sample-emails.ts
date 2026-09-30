// Sends one sample of each platform email design to an address (or, with HTML_OUT=dir, writes them as
// .html files to eyeball in a browser). Usage: npm run mail:samples -- you@example.com
import { writeFileSync, mkdirSync } from "node:fs";
import { sendEmail, appUrl, type Sender } from "@/lib/mail/mailer";
import { brandedHtml, mh, mp, mbtn, mfine, mtag, mcallout, mfacts, mquote, mtable, mhero, mbar, mcount, msteps, mticket, mcard, mkey, mstamp, mcompare, mping } from "@/lib/mail/layout";
import { renderSummaryHtml } from "@/domains/organizations/dailySummaryService";
import { ExecutiveDigestService } from "@/domains/platform/executiveDigestService";

const out = process.env.HTML_OUT;
const to = process.argv[2];
if (!to && !out) throw new Error("usage: npm run mail:samples -- <email>");
const B = appUrl("/settings/billing");

const samples: { from: Sender; subject: string; preheader: string; html: string }[] = [
  { from: "billing", subject: "Payment received — receipt INV-0001", preheader: "₹1,180 paid", html: mstamp("Paid") + mh("Payment received.") + mp("Thank you — your GST tax invoice is ready. Keep it for your records.") + mhero("₹1,180", "Total paid · incl. GST", false) + mfacts([["Invoice no.", "INV-0001"], ["Issued", "30 Sep 2026"], ["Amount", "₹1,180.00"]]) + mbtn("Download invoice", B) + mfine("Sent because this address is set for invoices.") },
  { from: "billing", subject: "Your payment didn't go through", preheader: "Update your payment method", html: mtag("Action required") + mh("Your payment didn't go through.") + mp("Hello, we couldn't collect the recurring payment for your workspace.") + mcallout("<strong>Reason</strong> — Card declined", "danger") + mfacts([["Workspace", "Acme Traders"], ["Plan", "Starter"], ["Fully active until", "7 Oct 2026"]]) + mbtn("Update payment method", B) },
  { from: "billing", subject: "Your Starter subscription is active", preheader: "Thanks for subscribing", html: mtag("Membership") + mh("You're in.") + mp("Hi Naveen, thanks for subscribing — everything in your plan is now unlocked.") + mcard("Ridhzo · active", "Starter", "Current period ends 30 Oct 2026") + mbtn("Open billing", B) },
  { from: "billing", subject: "Your Starter plan renews in 3 days", preheader: "Nothing to do", html: mtag("Renewal") + mh("Your Starter plan renews<br>on 3 Oct 2026.") + mcount([["3", "days to go"]]) + mp("Hi Naveen, just a heads-up: <strong>Acme</strong> renews automatically.") + mbtn("Manage billing", B, true) },
  { from: "billing", subject: "You've used 80% of your AI credits", preheader: "240 of 300", html: mtag("Usage") + mh("80% of your AI credits<br>used.") + mbar(80, "AI credits", "240 / 300") + mcallout("Upgrade before you hit the limit so nothing gets interrupted.", "info") + mbtn("Upgrade plan", B) },
  { from: "billing", subject: "You've hit your leads limit", preheader: "Upgrade to keep going", html: mtag("Limit reached") + mh("You've hit your<br>leads limit.") + mhero("100%", "leads used") + mcallout("You can't add more leads until you upgrade or free some up.", "danger") + mbtn("Upgrade plan", B) },
  { from: "billing", subject: "Your trial has ended — your leads haven't", preheader: "Your leads are safe", html: mtag("Trial complete") + mh("Your trial has ended.<br>Your leads haven't.") + mcompare({ title: "starter trial", items: ["Full feature access", "Higher limits"] }, { title: "Free plan", items: ["15 AI credits / month", "2 automations", "1 sequence", "1 lead source"] }) + mbtn("Upgrade to Starter", B) },
  { from: "billing", subject: "Your Starter subscription has ended", preheader: "Your leads are safe", html: mstamp("Ended") + mh("Your subscription has ended.") + mcallout("Your leads and follow-ups are safe. Anything above the Free limits is paused — not deleted.", "ok") + mbtn("Resubscribe", B) },
  { from: "noreply", subject: "Reset your Ridhzo password", preheader: "Valid for 1 hour", html: mtag("Security") + mh("Reset your password.") + mp("Someone — hopefully you — asked to reset the password on your account. It works once, and only for the next hour.") + mcount([["60", "minutes left"]]) + mbtn("Choose a new password", appUrl("/reset-password/x")) + mkey("Button not working? Paste this link", appUrl("/reset-password/abc123")) },
  { from: "noreply", subject: "You've been invited to Acme Traders", preheader: "Join Acme on Ridhzo", html: mh("You're on the list.") + mp("A teammate invited you to work on leads together in Ridhzo.") + mticket("Workspace invitation", "Acme Traders", "Admit one · valid for 7 days") + mbtn("Accept invitation", appUrl("/invite/x")) },
  { from: "hello", subject: "Welcome to Ridhzo, Naveen", preheader: "Three moves and you're running", html: mtag("Welcome") + mh("Hello, Naveen.<br>Acme Traders is live.") + msteps([["Add your leads", "Import a CSV, connect a lead source, or add one by hand."], ["Bring your team", "Invite teammates so every lead has an owner."], ["Never miss a follow-up", "Give every lead a next step and a reminder."]]) + mbtn("Enter your workspace", appUrl("/")) },
  { from: "hello", subject: "We've replied to your support request", preheader: "Fixed", html: mtag("Support") + mh("We've replied.") + mp("Your ticket was updated.") + mquote("Thanks for reaching out — this is fixed now. Let us know if it comes back.") + mbtn("Open your support requests", appUrl("/settings/support")) },
  { from: "hello", subject: "Data retention notice", preheader: "30 days", html: mstamp("Notice") + mh("Data retention notice.") + mhero("30", "days until anonymization") + mfacts([["Workspace", "Acme"], ["Suspended for", "60 days"]]) + mbtn("Contact support", "mailto:hello@ridhzo.com") },
  { from: "notifications", subject: "Overdue follow-up", preheader: "", html: mping("!", "Overdue follow-up", "Overdue follow-up") + mp("Open Ridhzo to see the lead's details and next steps.") + mbtn("Follow up now", appUrl("/follow-ups")) + mfine("The sooner you follow up, the better the chance of winning the lead.") },
  { from: "notifications", subject: "New lead", preheader: "", html: mping("+", "New lead", "New lead") + mp("Open Ridhzo to see the lead's details and next steps.") + mbtn("Open lead", appUrl("/leads")) },
  { from: "notifications", subject: "Today at Acme: 3 overdue follow-ups", preheader: "Your team's day", html: renderSummaryHtml("Acme Traders", { overdueFollowUps: 3, meetingsNeedOutcome: 1, meetingsToday: 2, newLeads: 5, uncontactedLeads: 2, unassignedLeads: 1, byRep: [{ name: "Ravi", overdue: 3, needOutcome: 1 }], calls: [{ name: "Priya", calls: 34, attempts: 30, answered: 21, talkSec: 5400 }], people: [] }) },
  { from: "notifications", subject: "Executive briefing", preheader: "Weekly overview", html: ExecutiveDigestService.renderDigestHtml({ generatedAt: new Date().toISOString(), frequency: "weekly", metrics: { totalOrgs: 42, totalLeads: 18250, totalUsers: 120, dbHealthy: true, failedDeliveries: 2 } as any, revops: { arr: 1500000, mrr: 125000, arpu: 2976, paidAccounts: 30, freeAccounts: 12 } as any, openTicketsCount: 3, atRiskTenants: [{ name: "Acme Corp", plan: "pro", daysInactive: 21, health: "critical" } as any, { name: "Globex", plan: "starter", daysInactive: 12, health: "at_risk" } as any] }) },
];

(async () => {
  if (out) {
    mkdirSync(out, { recursive: true });
    samples.forEach((s, i) => writeFileSync(`${out}/${String(i + 1).padStart(2, "0")}.html`, brandedHtml(s.html, appUrl("").replace(/\/$/, ""), s.preheader)));
    console.log(`wrote ${samples.length} files to ${out}`);
    return;
  }
  for (const s of samples) { await sendEmail({ ...s, subject: `[Sample] ${s.subject}`, to }); console.log("sent:", s.subject); await new Promise((r) => setTimeout(r, 600)); }
})();
