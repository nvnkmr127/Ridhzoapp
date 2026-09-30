// Builds the Ridhzo newsletter as one HTML file to paste into a Resend Broadcast (Broadcasts → Create →
// HTML). Uses the same monochrome design as the system emails. Resend fills the merge tags when sending:
//   {{{FIRST_NAME|there}}} → the contact's first name (or "there"), {{{RESEND_UNSUBSCRIBE_URL}}} → unsubscribe link.
// Usage: npm run newsletter:build   →   docs/newsletter/ridhzo-newsletter.html
import { writeFileSync } from "node:fs";
import { brandedHtml, mtag, mh, mp, mbtn, mfine, mtable, mfacts, mcallout } from "@/lib/mail/layout";

const APP = "https://app.ridhzo.com";
const SITE = "https://ridhzo.com";

const body =
  mtag("Product update") +
  mh("Leads move faster.<br>Here's what's new.") +
  mp("Hi {{{FIRST_NAME|there}}}, thanks for being on Ridhzo. Here are the things we've added lately to help your team reply sooner, follow up on time and see what's working.") +
  mtable(
    ["New", "What it does for you"],
    [
      ["<strong>Android call sync</strong>", "Calls with your leads are logged automatically — direction, talk time, outcome. An answered call closes the follow-up for you."],
      ["<strong>Caller ID</strong>", "When a lead rings you, see their name and where the deal stands before you pick up."],
      ["<strong>Pre-call brief</strong>", "Your last contact, latest note and what to ask — on one card, in seconds, before you dial."],
      ["<strong>One-tap AI suggestions</strong>", "Fill in details spotted in the conversation and move the lead to the next status with a single tap."],
      ["<strong>Today panel &amp; morning email</strong>", "See overdue follow-ups, uncontacted and unassigned leads at a glance — and get the same summary in your inbox."],
    ],
  ) +
  mbtn("Open Ridhzo", APP) +
  mp("<strong>Get more from it in 10 minutes</strong>") +
  mcallout("Connect a lead source, turn on round-robin so every lead gets an owner, and install the Android app to switch on call logging.") +
  mp("<strong>Plans, in short</strong> — flat price for your whole workspace, not per user:") +
  mfacts([
    ["Free", "₹0 · 300 leads · 1 user"],
    ["Starter", "₹249/mo · 5,000 leads · 3 users"],
    ["Unlimited", "₹449/mo · unlimited leads & users"],
  ]) +
  mfine("Prices exclude 18% GST. Every new workspace starts with a 14-day Starter trial, no card needed.") +
  mbtn("Read the guides", `${SITE}/help`, true) +
  mfine("Have a question or an idea? Just reply to this email — a real person reads it.");

// Preheader = the grey preview line next to the subject in the inbox.
const html = brandedHtml(body, APP, "New: Android call sync, Caller ID, pre-call briefs and more.", "{{{RESEND_UNSUBSCRIBE_URL}}}");

writeFileSync("docs/newsletter/ridhzo-newsletter.html", html);
console.log("wrote docs/newsletter/ridhzo-newsletter.html", `(${html.length} bytes)`);
