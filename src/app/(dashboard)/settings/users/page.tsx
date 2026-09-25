import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UserService } from "@/domains/users/service";
import { TeamService } from "@/domains/teams/service";
import { RoleService } from "@/domains/roles/service";
import { InvitationService } from "@/domains/invitations/service";
import { requireOrg, hasPermission } from "@/lib/rbac";
import { UsersManager } from "@/components/users/UsersManager";
import { RolesManager } from "@/components/users/RolesManager";

export default async function UsersPage() {
  // The settings nav hides this link without users.manage; a direct visit goes back to settings.
  if (!(await hasPermission("users.manage"))) redirect("/settings");
  const { organizationId, userId } = await requireOrg();
  const canManageRoles = await hasPermission("roles.manage");
  const [users, teams, roles, invites, leadCounts, roleMembers] = await Promise.all([
    UserService.list(organizationId),
    TeamService.list(organizationId),
    RoleService.list(organizationId),
    InvitationService.list(organizationId),
    UserService.leadCounts(organizationId),
    RoleService.memberCounts(organizationId),
  ]);
  // Not-yet-accepted invites, including expired ones (shown as "Expired" with a Resend button).
  const openInvites = invites
    .filter((i) => !i.acceptedAt)
    .map((i) => ({ id: i.id, email: i.email, roleId: i.roleId, expiresAt: i.expiresAt.toISOString() }));
  // New people default to the least-privileged system role.
  const defaultRoleId = roles.find((r) => r.organizationId === null && r.name.toLowerCase() === "member")?.id ?? roles[0]?.id ?? "";

  return (
    <div className="flex-1 space-y-6 p-4 pt-4 sm:p-8 sm:pt-6 max-w-5xl">
      <div className="flex items-center gap-3">
        <Link href="/settings">
          <Button variant="ghost" size="icon" aria-label="Go back"><ArrowLeft className="h-5 w-5" /></Button>
        </Link>
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Team members</h2>
          <p className="text-sm text-muted-foreground">Invite teammates, choose what each person can do, and group them into teams.</p>
        </div>
      </div>

      <UsersManager
        initialUsers={users}
        initialTeams={teams}
        initialInvites={openInvites}
        roles={roles.map((r) => ({ id: r.id, name: r.name }))}
        defaultRoleId={defaultRoleId}
        leadCounts={leadCounts}
        currentUserId={userId}
      />

      {canManageRoles && <RolesManager initialRoles={roles} memberCounts={roleMembers} />}
    </div>
  );
}
