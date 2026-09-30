// Billing-lifecycle emails to a workspace's admins: subscription started/ended, upcoming renewal,
// usage-limit warnings. Sent from billing@ (branded shell). Each one-shot email is guarded by a key in
// the org's lifecycle JSON so hourly scans and webhook retries never repeat it.
import { db } from "@/db";
import { organizations, users, roles } from "@/db/schema";
import { and, eq, gt, isNotNull, isNull, lte } from "drizzle-orm";
import { sendEmail, appUrl } from "@/lib/mail/mailer";
import { mh, mp, mbtn, mfine, mtag, mfacts, mcallout } from "@/lib/mail/layout";
import { escapeHtml as esc } from "@/lib/utils";
import { PlanService, limitsFor } from "./planService";
import { PLAN_LABELS, canonicalPlan, trialExpired } from "./planNames";
import { BillingLifecycleService } from "./lifecycleService";

const DAY = 86_400_000;
const REMIND_DAYS = 3;
const fmtDate = (d: Date) => d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

async function adminEmails(orgId: string): Promise<{ email: string; firstName: string | null }[]> {
  const rows = await db
    .select({ email: users.email, firstName: users.firstName, roleName: roles.name, perms: roles.permissions })
    .from(users)
    .leftJoin(roles, eq(users.roleId, roles.id))
    .where(and(eq(users.organizationId, orgId), eq(users.isActive, true), isNull(users.deletedAt)));
  return rows
    .filter((u) => (u.roleName ?? "").toLowerCase() === "admin" || (u.perms ?? []).includes("*"))
    .filter((u) => !u.email.endsWith("@phone.ridhzo.com")); // placeholder address, undeliverable
}

async function mailAdmins(orgId: string, build: (firstName: string) => { subject: string; preheader: string; html: string }) {
  for (const a of await adminEmails(orgId)) {
    try {
      await sendEmail({ from: "billing", to: a.email, ...build(esc(a.firstName || "there")) });
    } catch (e) {
      console.warn("[billingEmails] send failed", e);
    }
  }
}

// Runs `send` once per key. Marks first, so a crash mid-send skips rather than double-sends.
async function once(orgId: string, key: string, send: () => Promise<void>) {
  const lc = await BillingLifecycleService.getLifecycle(orgId);
  if (lc.emailsSent?.[key]) return false;
  await BillingLifecycleService.setLifecycle(orgId, { ...lc, emailsSent: { ...lc.emailsSent, [key]: new Date().toISOString() } });
  await send();
  return true;
}

async function clearKey(orgId: string, key: string) {
  const lc = await BillingLifecycleService.getLifecycle(orgId);
  if (!lc.emailsSent?.[key]) return;
  const { [key]: _drop, ...rest } = lc.emailsSent;
  await BillingLifecycleService.setLifecycle(orgId, { ...lc, emailsSent: rest });
}

export class BillingEmails {
  // Paid subscription became active (or the plan changed). Keyed by plan + period so renewals stay quiet.
  static async subscriptionStarted(orgId: string, plan: string, periodEnd?: Date | null) {
    const label = PLAN_LABELS[canonicalPlan(plan)];
    await once(orgId, `sub-start:${canonicalPlan(plan)}:${periodEnd?.toISOString().slice(0, 7) ?? "na"}`, () =>
      mailAdmins(orgId, (name) => ({
        subject: `Your Ridhzo ${label} subscription is active`,
        preheader: `Thanks for subscribing — ${label} is now live on your workspace`,
        html:
          mtag("Subscription active", "ok") +
          mh(`You're on ${label}`) +
          mp(`Hi ${name}, thanks for subscribing. Your <strong>${label}</strong> plan is active and all its features are unlocked.`) +
          mfacts([["Plan", label], ...(periodEnd ? ([["Current period ends", fmtDate(periodEnd)]] as [string, string][]) : [])]) +
          mbtn("Open billing", appUrl("/settings/billing")) +
          mfine("Your GST tax invoice is emailed separately after each payment."),
      })),
    );
  }

  // Current subscription ended (cancelled or completed) — the workspace is back on Free.
  static async subscriptionEnded(orgId: string, oldPlan: string) {
    const label = PLAN_LABELS[canonicalPlan(oldPlan)];
    await once(orgId, `sub-end:${Date.now().toString().slice(0, 8)}`, () =>
      mailAdmins(orgId, (name) => ({
        subject: `Your Ridhzo ${label} subscription has ended`,
        preheader: "Your leads are safe — resubscribe any time",
        html:
          mtag("Subscription ended", "warn") +
          mh("Your subscription has ended") +
          mp(`Hi ${name}, your <strong>${label}</strong> subscription has ended and the workspace is now on <strong>Free</strong>.`) +
          mcallout("Your leads and follow-ups are safe. Anything above the Free limits is paused, not deleted.") +
          mbtn("Resubscribe", appUrl("/settings/billing")),
      })),
    );
  }

  // Scan: renewals / scheduled endings due within REMIND_DAYS. Returns how many were sent.
  static async sendRenewalReminders(now = new Date()): Promise<number> {
    const rows = await db
      .select({ id: organizations.id, name: organizations.name, plan: organizations.plan, end: organizations.currentPeriodEnd, cancelling: organizations.cancelAtPeriodEnd })
      .from(organizations)
      .where(and(
        eq(organizations.planStatus, "active"),
        eq(organizations.complimentary, 0),
        isNotNull(organizations.razorpaySubscriptionId),
        isNull(organizations.suspendedAt),
        gt(organizations.currentPeriodEnd, now),
        lte(organizations.currentPeriodEnd, new Date(now.getTime() + REMIND_DAYS * DAY)),
      ));
    let sent = 0;
    for (const o of rows) {
      if (!o.end || o.plan === "free") continue;
      const label = PLAN_LABELS[canonicalPlan(o.plan)];
      const days = Math.max(1, Math.ceil((o.end.getTime() - now.getTime()) / DAY));
      const ending = o.cancelling === 1;
      const ok = await once(o.id, `${ending ? "ending" : "renewal"}:${o.end.toISOString().slice(0, 10)}`, () =>
        mailAdmins(o.id, (name) => ({
          subject: ending ? `Your ${label} plan ends in ${days} day${days === 1 ? "" : "s"}` : `Your ${label} plan renews in ${days} day${days === 1 ? "" : "s"}`,
          preheader: ending ? "Keep your plan to avoid losing paid features" : "No action needed — just a heads-up",
          html: ending
            ? mtag("Plan ending soon", "warn") + mh(`Your ${label} plan ends on ${fmtDate(o.end!)}`) +
              mp(`Hi ${name}, you've cancelled, so <strong>${esc(o.name)}</strong> moves to Free after this date. Your leads are safe, but paid features (AI replies, extra automations and sources) will pause.`) +
              mbtn("Keep my plan", appUrl("/settings/billing"))
            : mtag("Upcoming renewal") + mh(`Your ${label} plan renews on ${fmtDate(o.end!)}`) +
              mp(`Hi ${name}, a heads-up that <strong>${esc(o.name)}</strong> renews automatically on this date using your saved payment method. No action is needed.`) +
              mbtn("Manage billing", appUrl("/settings/billing")) + mfine("Want to change or cancel? Do it from the billing page before the renewal date."),
        })),
      );
      if (ok) sent++;
    }
    return sent;
  }

  // Scan: warn admins at 80% and 100% of AI credits, leads and seats. Resets once usage falls back.
  // ponytail: per-org usage queries every hour; move to a daily tick if org count grows large.
  static async sendUsageAlerts(now = new Date()): Promise<number> {
    const orgs = await db
      .select({ id: organizations.id, name: organizations.name, plan: organizations.plan, trialEndsAt: organizations.trialEndsAt })
      .from(organizations)
      .where(isNull(organizations.suspendedAt));
    const period = now.toISOString().slice(0, 7);
    const meters: [string, string, "current" | "used"][] = [["aiCredits", "AI credits", "current"], ["leads", "leads", "current"], ["seats", "team seats", "current"]];
    let sent = 0;
    for (const o of orgs) {
      try {
        const plan = trialExpired(o, now.getTime()) ? "free" : o.plan ?? "free";
        const stats = await PlanService.getUsageStats(o.id, plan);
        for (const [key, label] of meters) {
          const m = (stats as any)[key] as { current: number; max: number };
          if (!m || !Number.isFinite(m.max) || m.max <= 0) continue;
          const pct = (m.current / m.max) * 100;
          const scope = key === "aiCredits" ? period : "all"; // credits reset monthly; leads/seats are standing
          for (const t of [80, 100]) {
            const k = `usage:${key}:${t}:${scope}`;
            if (pct >= t) {
              const ok = await once(o.id, k, () =>
                mailAdmins(o.id, (name) => ({
                  subject: t === 100 ? `You've reached your ${label} limit on ${o.name}` : `You've used ${Math.floor(pct)}% of your ${label} on ${o.name}`,
                  preheader: t === 100 ? "Upgrade to keep going" : `${m.current} of ${m.max} used`,
                  html:
                    mtag(t === 100 ? "Limit reached" : "Usage warning", t === 100 ? "danger" : "warn") +
                    mh(t === 100 ? `You've reached your ${label} limit` : `You've used ${Math.floor(pct)}% of your ${label}`) +
                    mp(`Hi ${name}, <strong>${esc(o.name)}</strong> is on the <strong>${PLAN_LABELS[canonicalPlan(plan)]}</strong> plan.`) +
                    mfacts([[label.replace(/^./, (c) => c.toUpperCase()), `${m.current} / ${m.max}`], ["Plan", PLAN_LABELS[canonicalPlan(plan)]]]) +
                    mcallout(t === 100
                      ? key === "aiCredits" ? "AI features are paused until your credits reset next month, or until you upgrade." : `You can't add more ${label} until you upgrade or free some up.`
                      : "Upgrade before you hit the limit so nothing is interrupted.", t === 100 ? "danger" : "warn") +
                    mbtn(canonicalPlan(plan) === "unlimited" ? "View usage" : "Upgrade plan", appUrl("/settings/billing")),
                })),
              );
              if (ok) sent++;
            } else if (scope === "all") {
              await clearKey(o.id, k); // dropped back under — allow a future warning
            }
          }
        }
      } catch (e) {
        console.warn(`[billingEmails] usage scan failed for ${o.id}`, e);
      }
    }
    return sent;
  }
}
