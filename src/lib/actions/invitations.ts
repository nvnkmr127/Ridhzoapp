"use server";

import { requirePermission } from "@/lib/rbac";
import { InvitationService } from "@/domains/invitations/service";
import { OrgService } from "@/domains/organizations/service";
import { AuditService } from "@/domains/audit/service";

// Escape a tenant-controlled string before putting it in email HTML.
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
import { PlanService } from "@/domains/billing/planService";
import { sendEmail, appUrl } from "@/lib/mail/mailer";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ok, fail, actionFail, zodFieldErrors } from "@/lib/actions/result";

const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  roleId: z.guid().nullable().optional(),
});

export async function inviteUserAction(input: z.infer<typeof inviteSchema>) {
  const { organizationId, userId } = await requirePermission("users.manage");
  const parsed = inviteSchema.safeParse(input);
  if (!parsed.success) {
    return fail("VALIDATION", "Please enter a valid email address.", zodFieldErrors(parsed.error));
  }
  const data = parsed.data;

  try {
    await PlanService.assertCanAddSeat(organizationId);

    const { token, invite } = await InvitationService.create(organizationId, data.email, data.roleId ?? null, userId);
    const link = appUrl(`/invite/${token}`);

    // Tenant-branded: name the inviting workspace, not the platform.
    const org = await OrgService.getOrganization(organizationId);
    const orgName = esc(org?.name || "your workspace");

    // Email delivery is best-effort: the invite already exists in the DB, so a mail failure
    // must not roll it back or report the whole invite as failed. Surface `emailed` + `link`
    // so the admin can copy the join link when delivery didn't go through.
    let emailed = true;
    try {
      await sendEmail({
        to: data.email,
        subject: `You've been invited to ${orgName}`,
        html: `<p>You've been invited to join <strong>${orgName}</strong>.</p><p><a href="${link}">Accept your invitation</a> (expires in 7 days).</p>`,
      }, organizationId);
    } catch (mailErr) {
      emailed = false;
      console.error("[invite] email delivery failed; invite still created", (mailErr as Error)?.message);
    }
    await AuditService.log({ organizationId, userId, action: "user.invite", entityType: "invitation", entityId: invite.id, metadata: { email: data.email, emailed } });

    revalidatePath("/settings/users");
    return ok({ invite, emailed, link });
  } catch (e) {
    return actionFail(e);
  }
}

export async function revokeInvitationAction(id: string) {
  const { organizationId, userId } = await requirePermission("users.manage");
  try {
    const revoked = await InvitationService.revoke(organizationId, id);
    if (!revoked) return fail("NOT_FOUND", "That invitation no longer exists.");
    await AuditService.log({ organizationId, userId, action: "invitation.revoke", entityType: "invitation", entityId: id, metadata: { email: revoked.email } });
    revalidatePath("/settings/users");
    return ok({ id });
  } catch (e) {
    return actionFail(e);
  }
}

// Public — used by the /invite/[token] accept page. No auth: the token IS the credential.
const acceptSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(6, "Password must be at least 6 characters"),
  firstName: z.string().max(255).optional(),
  lastName: z.string().max(255).optional(),
});

export async function acceptInvitationAction(input: z.infer<typeof acceptSchema>) {
  const parsed = acceptSchema.safeParse(input);
  if (!parsed.success) {
    return fail("VALIDATION", "Please choose a password of at least 6 characters.", zodFieldErrors(parsed.error));
  }
  try {
    const user = await InvitationService.accept(parsed.data.token, parsed.data);
    // System-attributed (no signed-in actor yet): this is the other path an account is created
    // through, and it should be as visible in the trail as createUserAction's user.create.
    await AuditService.log({
      organizationId: user.organizationId,
      action: "user.invite_accepted",
      entityType: "user",
      entityId: user.id,
      metadata: { email: user.email, roleId: user.roleId },
    });
    return ok({ accepted: true });
  } catch (e) {
    // Invalid/expired/already-used token surfaces here.
    const msg = e instanceof Error ? e.message : "";
    // A live account already owns this email (couldn't be restored) — tell them to sign in instead
    // of showing the misleading "invalid or expired" copy.
    if (/already exists/i.test(msg)) {
      return fail("CONFLICT", "An account with this email already exists. Please sign in instead.");
    }
    if (/expired|invalid|not found|used|already/i.test(msg)) {
      return fail("NOT_FOUND", "This invitation is invalid or has expired. Ask an admin to send a new one.");
    }
    return actionFail(e);
  }
}
