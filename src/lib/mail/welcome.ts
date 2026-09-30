import { sendEmail, appUrl } from "./mailer";
import { mh, mp, mbtn, mfine, mtag, msteps } from "./layout";

// Welcome email for a brand-new workspace owner (email or Google signup). Best-effort: never throws.
export async function sendWelcomeEmail(input: { email: string; firstName?: string | null; orgName: string }) {
  try {
    const clean = (s: string) => s.replace(/[&<>"']/g, "").trim();
    const name = clean(input.firstName ?? "");
    const org = clean(input.orgName);
    await sendEmail({
      from: "hello",
      to: input.email,
      subject: `Welcome to Ridhzo, ${name || "there"} — your workspace is ready`,
      preheader: "Three quick steps to get your first leads moving",
      html:
        mtag("Welcome") +
        mh(`Hello, ${name || "there"}.<br>${org} is live.`) +
        mp("Leads move faster here. Three moves and you're running:") +
        msteps([
          ["Add your leads", "Import a CSV, connect a lead source, or add one by hand."],
          ["Bring your team", "Invite teammates so every lead has an owner."],
          ["Never miss a follow-up", "Give every lead a next step and a reminder."],
        ]) +
        mbtn("Enter your workspace", appUrl("/")) +
        mfine("Stuck? Reply to this email — a real person answers."),
    });
  } catch (err) {
    console.warn("[welcome] email failed", err);
  }
}
