"use server";

import { z } from "zod";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { db } from "@/db";
import { users, passwordResets } from "@/db/schema";
import { and, eq, gt, isNull } from "drizzle-orm";
import { OrgService } from "@/domains/organizations/service";
import { ok, fail, actionFail, zodFieldErrors } from "@/lib/actions/result";
import { sendEmail, appUrl } from "@/lib/mail/mailer";

const signupSchema = z.object({
  orgName: z.string().min(1, "Workspace name is required").max(255),
  firstName: z.string().max(255).optional(),
  email: z.string().email("Enter a valid email"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

// Public — no auth. Creates a new tenant and its owner.
export async function signupAction(input: z.infer<typeof signupSchema>) {
  const parsed = signupSchema.safeParse(input);
  if (!parsed.success) {
    return fail("VALIDATION", "Please check the highlighted fields and try again.", zodFieldErrors(parsed.error));
  }
  const data = parsed.data;
  try {
    await OrgService.createWithOwner({
      orgName: data.orgName,
      email: data.email,
      password: data.password,
      firstName: data.firstName,
    });
    return ok({ created: true });
  } catch (e: any) {
    if (String(e?.message || e).includes("duplicate") || e?.code === "23505") {
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

  try {
    const [user] = await db
      .select({ id: users.id, firstName: users.firstName, email: users.email })
      .from(users)
      .where(and(eq(users.email, email), isNull(users.deletedAt)))
      .limit(1);

    // If user exists, create token and send email. Always return success to prevent user enumeration.
    if (user) {
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
      const greeting = user.firstName ? `Hi ${user.firstName},` : "Hello,";

      await sendEmail({
        to: email,
        subject: "Reset your Ridhzo password",
        html: `
          <div style="font-family: sans-serif; max-width: 540px; margin: 0 auto; padding: 24px; color: #111;">
            <h2 style="font-size: 20px; font-weight: 700; margin-bottom: 16px;">Reset your password</h2>
            <p style="font-size: 15px; line-height: 1.5;">${greeting}</p>
            <p style="font-size: 15px; line-height: 1.5;">
              We received a request to reset the password for your Ridhzo account. Click the button below to choose a new password:
            </p>
            <div style="margin: 28px 0;">
              <a href="${resetLink}" style="background-color: #0f172a; color: #fff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; display: inline-block;">
                Reset Password
              </a>
            </div>
            <p style="font-size: 13px; color: #64748b; line-height: 1.5;">
              This link is valid for 1 hour. If you didn't request a password reset, you can safely ignore this email.
            </p>
          </div>
        `,
      });
    }

    return ok({ sent: true });
  } catch (err: any) {
    console.error("[password-reset] error requesting reset:", err);
    return actionFail(err);
  }
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
      .set({ passwordHash, updatedAt: new Date() })
      .where(and(eq(users.email, reset.email), isNull(users.deletedAt)));

    // Burn token
    await db
      .update(passwordResets)
      .set({ usedAt: new Date() })
      .where(eq(passwordResets.id, reset.id));

    return ok({ reset: true });
  } catch (err: any) {
    console.error("[password-reset] error resetting password:", err);
    return actionFail(err);
  }
}
