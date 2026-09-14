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
  if (!(await hasPermission("users.manage"))) redirect("/leads");
  const { organizationId, userId } = await requireOrg();
  const canManageRoles = await hasPermission("roles.manage");
  const [users, teams, roles, invites] = await Promise.all([
    UserService.list(organizationId),
    TeamService.list(organizationId),
    RoleService.list(organizationId),
    InvitationService.list(organizationId),
  ]);
  // Only invites still awaiting acceptance belong in the pending list.
  const pendingInvites = invites
    .filter((i) => !i.acceptedAt)
    .map((i) => ({ id: i.id, email: i.email, roleId: i.roleId, expiresAt: i.expiresAt.toISOString() }));

  return (
    <div className="flex-1 space-y-6 p-4 pt-4 sm:p-8 sm:pt-6">
      <div className="flex items-center gap-3">
        <Link href="/settings">
          <Button variant="ghost" size="icon" aria-label="Go back"><ArrowLeft className="h-5 w-5" /></Button>
        </Link>
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Users &amp; Roles</h2>
          <p className="text-sm text-muted-foreground">Invite teammates, assign roles, and manage access.</p>
        </div>
      </div>

      <UsersManager
        initialUsers={users}
        initialTeams={teams}
        initialInvites={pendingInvites}
        roles={roles.map((r) => ({ id: r.id, name: r.name }))}
        currentUserId={userId}
      />

      {canManageRoles && <RolesManager initialRoles={roles} />}
    </div>
  );
}
