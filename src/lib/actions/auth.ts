"use server";

import { z } from "zod";
import { ipFromHeaders } from "@/lib/clientIp";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { db } from "@/db";
import { users, organizations, passwordResets, phoneOtps } from "@/db/schema";
import { and, eq, gt, isNull } from "drizzle-orm";
import { OrgService } from "@/domains/organizations/service";
import { ok, fail, actionFail, zodFieldErrors } from "@/lib/actions/result";
import { sendEmail, appUrl } from "@/lib/mail/mailer";
import { keepAlive } from "@/lib/keepAlive";
import { mh, mp, mbtn, mfine, mkey, mcount, mtag } from "@/lib/mail/layout";
import { requireOrg } from "@/lib/rbac";
import { RateLimiter } from "@/lib/rate-limit";
import { headers } from "next/headers";
import type { StoredAttribution } from "@/lib/tracking/utm";
import { isPlaceholderEmail } from "@/lib/auth/googleLink";

const signupSchema = z.object({
  orgName: z.string().max(255).optional(),
  firstName: z.string().max(255).optional(),
  email: z.string().email("Enter a valid email"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  attribution: z
    .object({
      utmSource: z.string().optional(),
      utmMedium: z.string().optional(),
      utmCampaign: z.string().optional(),
      utmContent: z.string().optional(),
      utmTerm: z.string().optional(),
      fbclid: z.string().optional(),
      gclid: z.string().optional(),
      fbp: z.string().optional(),
      fbc: z.string().optional(),
      referrer: z.string().optional(),
      landingPage: z.string().optional(),
    })
    .optional(),
});

// Public — no auth. Creates a new tenant and its owner.
export async function signupAction(input: z.infer<typeof signupSchema>) {
  const parsed = signupSchema.safeParse(input);
  if (!parsed.success) {
    return fail("VALIDATION", "Please check the highlighted fields and try again.", zodFieldErrors(parsed.error));
  }
  const data = { ...parsed.data, email: parsed.data.email.trim().toLowerCase() };
  // Throttle workspace creation per client (bots can't mass-create accounts).
  const ip = ipFromHeaders(await headers());
  if (!(await RateLimiter.checkLimit(`auth:signup:ip:${ip}`, 20, 60 * 60)).success) {
    return fail("RATE_LIMIT", "Too many sign-ups from this network. Please try again in an hour.");
  }
  // Business name is optional; fall back to "<name>'s Workspace" like the Google/phone flows.
  const orgName = data.orgName?.trim() || `${data.firstName?.trim() || data.email.split("@")[0]}'s Workspace`;
  try {
    const created = await OrgService.createWithOwner({
      orgName,
      email: data.email,
      password: data.password,
      firstName: data.firstName,
    });

    // Record Campaign Attribution & Dispatch Server-Side Meta CAPI Event
    if (created?.organizationId) {
      if (data.attribution) {
        try {
          const { PlatformAttributionService } = await import("@/domains/platform/attributionService");
          await PlatformAttributionService.recordAttribution(created.organizationId, data.attribution);
        } catch (err) {
          console.warn("[signupAction] failed to record attribution", err);
        }
      }

      // Meta Conversions API (CAPI) CompleteRegistration
      try {
        const { MetaCapiService } = await import("@/domains/platform/capiService");
        await MetaCapiService.sendEvent({
          eventName: "CompleteRegistration",
          email: data.email,
          orgId: created.organizationId,
          orgName,
          fbp: data.attribution?.fbp,
          fbc: data.attribution?.fbc,
          eventSourceUrl: data.attribution?.landingPage,
        });
      } catch (err) {
        console.warn("[signupAction] failed to dispatch Meta CAPI event", err);
      }
    }

    // Verification link: unlocks sending / exports / API keys (see emailGate). Best-effort — they can resend.
    try {
      const [u] = await db.select({ id: users.id }).from(users).where(eq(users.email, data.email)).limit(1);
      if (u) {
        const { issueEmailVerification } = await import("@/lib/auth/emailVerify");
        await issueEmailVerification(u.id, data.email, data.firstName);
      }
    } catch (err) {
      console.warn("[signupAction] verification email failed", err);
    }

    // Welcome email + newsletter-audience sync — best-effort, never block signup.
    {
      const [{ sendWelcomeEmail }, { upsertContact }] = await Promise.all([import("@/lib/mail/welcome"), import("@/lib/mail/contacts")]);
      await sendWelcomeEmail({ email: data.email, firstName: data.firstName, orgName });
      keepAlive(upsertContact({ email: data.email, firstName: data.firstName, org: orgName, plan: "starter", planStatus: "active" }), "resend contact");
    }

    return ok({ created: true });
  } catch (e: any) {
    if (/duplicate|already exists/i.test(String(e?.message || e)) || e?.code === "23505") {
      return fail("CONFLICT", "An account with that email already exists. Try signing in instead.", { email: "This email is already registered." });
    }
    return actionFail(e);
  }
}

function hashToken(raw: string) {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

const forgotPasswordSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
});

// Requests a password reset link sent to email.
export async function requestPasswordResetAction(input: { email: string }) {
  const parsed = forgotPasswordSchema.safeParse(input);
  if (!parsed.success) {
    return fail("VALIDATION", "Please enter a valid email address.");
  }
  const email = parsed.data.email.trim().toLowerCase();

  // Same answer whether or not the account exists (no email enumeration), and throttled per email
  // and per IP so the form can't be used to flood someone's inbox.
  const ip = ipFromHeaders(await headers());
  const [byEmail, byIp] = await Promise.all([
    RateLimiter.checkLimit(`auth:reset:email:${email}`, 3, 60 * 60),
    RateLimiter.checkLimit(`auth:reset:ip:${ip}`, 10, 60 * 60),
  ]);
  if (!byIp.success) return fail("RATE_LIMIT", "Too many reset requests. Please try again in an hour.");
  if (!byEmail.success) return ok({ sent: true });

  try {
    const [user] = await db
      .select({ id: users.id, firstName: users.firstName, email: users.email })
      .from(users)
      .where(and(eq(users.email, email), isNull(users.deletedAt)))
      .limit(1);

    if (!user) return ok({ sent: true });

    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // Invalidate earlier unused reset tokens for this email
    await db
      .delete(passwordResets)
      .where(and(eq(passwordResets.email, email), isNull(passwordResets.usedAt)));

    await db.insert(passwordResets).values({
      email,
      tokenHash,
      expiresAt,
    });

    const resetLink = appUrl(`/reset-password/${rawToken}`);
    const safeName = (user.firstName ?? "").replace(/[&<>"']/g, "");
    const greeting = safeName ? `Hi ${safeName},` : "Hello,";

    await sendEmail({ from: "noreply",
      to: email,
      subject: "Reset your Ridhzo password",
      preheader: "Use this link within 1 hour to choose a new password",
      html:
        mtag("Security") +
        mh("Reset your password.") +
        mp(greeting) +
        mp("Someone — hopefully you — asked to reset the password on your Ridhzo account. Use the button below to choose a new one. It works once, and only for the next hour.") +
        mcount([["60", "minutes left"]]) +
        mbtn("Choose a new password", resetLink) +
        mkey("Button not working? Paste this link", resetLink) +
        mfine("Didn't ask for this? Ignore this email — your password stays exactly as it is."),
    });

    return ok({ sent: true });
  } catch (err: any) {
    console.error("[password-reset] error requesting reset:", err);
    return actionFail(err);
  }
}

// Checks if an account exists with the given phone number
const sendOtpSchema = z.object({
  phone: z.string().min(10, "Please enter a valid phone number"),
  purpose: z.enum(["login", "signup", "link"]).default("login"),
});

// Generates and delivers a 6-digit verification OTP over WhatsApp via Watxio
export async function sendWhatsAppOtpAction(input: z.infer<typeof sendOtpSchema>) {
  const parsed = sendOtpSchema.safeParse(input);
  if (!parsed.success) {
    return fail("VALIDATION", "Please enter a valid phone number.");
  }
  const clean = parsed.data.phone.trim();
  const formatted = clean.startsWith("+") ? clean : `+91${clean.replace(/^0+/, "")}`;

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.phone, formatted), isNull(users.deletedAt)))
    .limit(1);

  if (parsed.data.purpose === "login" && !existing) {
    return fail(
      "NOT_FOUND",
      "We don't have an account with this mobile number. Check the country code, or sign up to create one."
    );
  }
  if (parsed.data.purpose === "signup" && existing) {
    return fail("CONFLICT", "This number already has an account. Log in instead.");
  }
  if (parsed.data.purpose === "link" && existing) {
    return fail("CONFLICT", "This number is already used by another Ridhzo account.");
  }

  // Per-client cap so one network can't trigger codes to unlimited numbers (WhatsApp cost / harassment).
  const otpIp = ipFromHeaders(await headers());
  if (!(await RateLimiter.checkLimit(`auth:otp:send-action:${otpIp}`, 15, 10 * 60)).success) {
    return fail("RATE_LIMIT", "Too many code requests. Please wait a few minutes.");
  }

  // Per-destination and platform-wide ceilings: whatever the source IPs, one number can't be flooded with
  // codes (harassment) and the WhatsApp bill for OTPs is bounded.
  const [perNumber, platformWide] = await Promise.all([
    RateLimiter.checkLimit(`auth:otp:number:${formatted}`, 5, 60 * 60),
    RateLimiter.checkLimit("auth:otp:global", 3000, 60 * 60),
  ]);
  if (!perNumber.success) return fail("RATE_LIMIT", "Too many codes were requested for this number. Please try again in an hour.");
  if (!platformWide.success) return fail("RATE_LIMIT", "WhatsApp sign-in is busy right now. Please try again shortly or use Google or email.");

  // Rate limit: 45s between OTP requests to prevent spamming
  const [recent] = await db
    .select({ createdAt: phoneOtps.createdAt })
    .from(phoneOtps)
    .where(
      and(
        eq(phoneOtps.phone, formatted),
        gt(phoneOtps.createdAt, new Date(Date.now() - 45 * 1000))
      )
    )
    .limit(1);

  if (recent) {
    return fail("RATE_LIMIT", "Please wait 45 seconds before requesting another OTP.");
  }

  // 6-digit numeric OTP
  const code = crypto.randomInt(100000, 1000000).toString();
  const otpHash = crypto.createHash("sha256").update(code).digest("hex");
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 mins

  await db.insert(phoneOtps).values({
    phone: formatted,
    otpHash,
    expiresAt,
  });

  // Send via Watxio
  const { WatxioClient, isConfigured } = await import("@/lib/messaging/whatsapp/client");
  if (isConfigured()) {
    try {
      const template = process.env.WATXIO_OTP_TEMPLATE;
      if (template) {
        try {
          await WatxioClient.sendTemplate(
            formatted,
            template,
            [code],
            process.env.WATXIO_TEMPLATE_LANG || "en_US"
          );
        } catch (templateErr: any) {
          console.warn(
            "[watxio-otp] Template send failed, attempting text fallback:",
            templateErr?.message || templateErr
          );
          await WatxioClient.sendText(
            formatted,
            `Your Ridhzo verification code is ${code}. Valid for 5 minutes. Do not share this code with anyone.`
          );
        }
      } else {
        await WatxioClient.sendText(
          formatted,
          `Your Ridhzo verification code is ${code}. Valid for 5 minutes. Do not share this code with anyone.`
        );
      }
    } catch (err: any) {
      console.error("[watxio-otp] Failed to dispatch WhatsApp OTP:", err);
      return fail(
        "SERVER",
        "We couldn't send the code on WhatsApp. Make sure this number uses WhatsApp, or sign up with Google or email instead."
      );
    }
  } else {
    // Never "send" a code nobody receives in production (and never put one in the server logs).
    if (process.env.NODE_ENV === "production") {
      console.error("[watxio-otp] WhatsApp OTP is not configured (WATXIO_API_KEY / WATXIO_BASE_URL)");
      return fail("SERVER", "WhatsApp sign-in isn't available right now. Sign up with Google or email instead.");
    }
    // Dev fallback: log the code for local testing.
    console.log(`\n========================================`);
    console.log(`[WATXIO WHATSAPP OTP] Phone: ${formatted} | Code: ${code}`);
    console.log(`========================================\n`);
  }

  return ok({ sent: true, phone: formatted });
}

// Verifies whether a reset token is valid and not expired
export async function verifyResetTokenAction(rawToken: string) {
  if (!rawToken || rawToken.trim().length < 10) {
    return { valid: false };
  }
  const tokenHash = hashToken(rawToken.trim());
  const [reset] = await db
    .select({ id: passwordResets.id, email: passwordResets.email })
    .from(passwordResets)
    .where(
      and(
        eq(passwordResets.tokenHash, tokenHash),
        isNull(passwordResets.usedAt),
        gt(passwordResets.expiresAt, new Date())
      )
    )
    .limit(1);

  return { valid: Boolean(reset), email: reset?.email };
}

const resetPasswordSchema = z.object({
  token: z.string().min(10, "Invalid token"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

// Sets a new password using a verified reset token
export async function resetPasswordAction(input: z.infer<typeof resetPasswordSchema>) {
  const parsed = resetPasswordSchema.safeParse(input);
  if (!parsed.success) {
    return fail("VALIDATION", "Password must be at least 6 characters.");
  }
  const { token, password } = parsed.data;
  const tokenHash = hashToken(token.trim());

  try {
    const [reset] = await db
      .select({ id: passwordResets.id, email: passwordResets.email })
      .from(passwordResets)
      .where(
        and(
          eq(passwordResets.tokenHash, tokenHash),
          isNull(passwordResets.usedAt),
          gt(passwordResets.expiresAt, new Date())
        )
      )
      .limit(1);

    if (!reset) {
      return fail("VALIDATION", "This password reset link is invalid or has expired. Please request a new one.");
    }

    const passwordHash = await bcrypt.hash(password, 10);

    // Update password
    await db
      .update(users)
      .set({ passwordHash, passwordSet: true, updatedAt: new Date() })
      .where(and(eq(users.email, reset.email), isNull(users.deletedAt)));

    // Burn token
    await db
      .update(passwordResets)
      .set({ usedAt: new Date() })
      .where(eq(passwordResets.id, reset.id));

    // A reset usually means the old password (and any session made with it) can't be trusted:
    // close every session issued before now (honoured within the jwt() refresh window).
    try {
      const [u] = await db.select({ id: users.id }).from(users).where(and(eq(users.email, reset.email), isNull(users.deletedAt))).limit(1);
      if (u) {
        const { SessionService } = await import("@/domains/platform/sessionService");
        await SessionService.revokeUserSessions(u.id);
      }
    } catch (e) {
      console.warn("[password-reset] session revoke failed", e);
    }

    return ok({ reset: true });
  } catch (err: any) {
    console.error("[password-reset] error resetting password:", err);
    return actionFail(err);
  }
}

// Google and WhatsApp signups can't carry attribution through signupAction, so the dashboard calls
// this once after landing. Only records for a user+org created in the last 30 minutes that has no
// attribution yet, so invited members, old accounts and email signups (already recorded) are skipped.
export async function recordSignupAttributionAction(input: StoredAttribution) {
  const parsed = signupSchema.shape.attribution.safeParse(input);
  const attribution = parsed.success ? parsed.data : undefined;
  if (!attribution) return ok({ recorded: false });
  const { userId, organizationId } = await requireOrg();
  if (!organizationId) return ok({ recorded: false });
  const cutoff = new Date(Date.now() - 30 * 60 * 1000);
  const [row] = await db
    .select({ email: users.email, phone: users.phone, orgName: organizations.name })
    .from(users)
    .innerJoin(organizations, eq(organizations.id, users.organizationId))
    .where(and(eq(users.id, userId), eq(users.organizationId, organizationId), gt(users.createdAt, cutoff), gt(organizations.createdAt, cutoff)))
    .limit(1);
  if (!row) return ok({ recorded: false });

  const { PlatformAttributionService } = await import("@/domains/platform/attributionService");
  if (await PlatformAttributionService.getAttribution(organizationId)) return ok({ recorded: false });
  await PlatformAttributionService.recordAttribution(organizationId, attribution);

  try {
    const { MetaCapiService } = await import("@/domains/platform/capiService");
    await MetaCapiService.sendEvent({
      eventName: "CompleteRegistration",
      email: !row.email || isPlaceholderEmail(row.email) ? undefined : row.email,
      phone: row.phone ?? undefined,
      orgId: organizationId,
      orgName: row.orgName,
      fbp: attribution.fbp,
      fbc: attribution.fbc,
      eventSourceUrl: attribution.landingPage,
    });
  } catch (err) {
    console.warn("[recordSignupAttributionAction] failed to dispatch Meta CAPI event", err);
  }
  return ok({ recorded: true });
}
