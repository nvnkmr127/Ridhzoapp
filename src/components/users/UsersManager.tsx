"use client"
import * as React from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import {
  createUserAction,
  setUserActiveAction,
  setUserTeamAction,
  setUserRoleAction,
  deleteUserAction,
} from "@/lib/actions/users"
import { createTeamAction } from "@/lib/actions/teams"
import { inviteUserAction, revokeInvitationAction } from "@/lib/actions/invitations"
import { UserPlus, Plus, Trash2, Mail, X } from "lucide-react"

type User = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  isActive: boolean;
  roleId: string | null;
  teamId: string | null;
};
type Team = { id: string; name: string };
type Role = { id: string; name: string };
// `link` is only present for invites created in this session whose email failed to send —
// the token is hashed server-side and can't be recovered after a reload.
type Invite = { id: string; email: string; roleId: string | null; expiresAt: string; link?: string };

const NO_TEAM = "__none__"; // Select can't use "" as a value
const NO_ROLE = "__none__";

export function UsersManager({
  initialUsers,
  initialTeams,
  initialInvites = [],
  roles,
  currentUserId,
}: {
  initialUsers: User[];
  initialTeams: Team[];
  initialInvites?: Invite[];
  roles: Role[];
  currentUserId: string;
}) {
  const { toast } = useToast();
  const [users, setUsers] = React.useState<User[]>(initialUsers);
  const [teams, setTeams] = React.useState<Team[]>(initialTeams);
  const [invites, setInvites] = React.useState<Invite[]>(initialInvites);
  const [teamName, setTeamName] = React.useState("");
  const [creatingTeam, setCreatingTeam] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [form, setForm] = React.useState({ firstName: "", lastName: "", email: "", password: "", roleId: NO_ROLE });
  const [saving, setSaving] = React.useState(false);
  const [inviteEmail, setInviteEmail] = React.useState("");
  const [inviteRole, setInviteRole] = React.useState(NO_ROLE);
  const [inviting, setInviting] = React.useState(false);

  async function invite() {
    if (!inviteEmail.trim()) return;
    setInviting(true);
    try {
      const res = await inviteUserAction({ email: inviteEmail.trim(), roleId: inviteRole === NO_ROLE ? null : inviteRole });
      if (!res.ok) {
        toast({ variant: "destructive", title: "Could not send invite", description: res.message });
        return;
      }
      const { invite: inv, emailed, link } = res.data as unknown as { invite: Invite; emailed: boolean; link: string };
      // Show the pending invite immediately, replacing any earlier pending row for the same email.
      // Keep the join link on the row when email didn't send, so the admin can still copy it.
      setInvites((prev) => [...prev.filter((i) => i.email !== inv.email), { ...inv, link: emailed ? undefined : link }]);
      setInviteEmail(""); setInviteRole(NO_ROLE);
      if (emailed) {
        toast({ title: "Invitation sent", description: "They'll get an email with a link to join." });
      } else {
        toast({ title: "Invite created — email not sent", description: `Share this join link: ${link}` });
      }
    } catch {
      toast({ variant: "destructive", title: "Could not send invite", description: "We couldn't reach the server. Please try again." });
    } finally {
      setInviting(false);
    }
  }

  async function createTeam() {
    if (!teamName.trim() || creatingTeam) return; // guard double-submit (no duplicate teams)
    setCreatingTeam(true);
    try {
      const res = await createTeamAction({ name: teamName.trim() });
      if (!res.ok) {
        toast({ variant: "destructive", title: "Could not create team", description: res.message });
        return;
      }
      setTeams((prev) => [...prev, res.data as Team]);
      setTeamName("");
      toast({ title: "Team created" });
    } catch {
      toast({ variant: "destructive", title: "Could not create team", description: "We couldn't reach the server. Please try again." });
    } finally {
      setCreatingTeam(false);
    }
  }

  async function assignTeam(u: User, value: string) {
    const teamId = value === NO_TEAM ? null : value;
    setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, teamId } : x)));
    try {
      const res = await setUserTeamAction(u.id, teamId);
      if (!res.ok) {
        setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, teamId: u.teamId } : x)));
        toast({ variant: "destructive", title: "Could not update team", description: res.message });
      }
    } catch {
      setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, teamId: u.teamId } : x)));
      toast({ variant: "destructive", title: "Could not update team", description: "We couldn't reach the server. Please try again." });
    }
  }

  async function assignRole(u: User, value: string) {
    const roleId = value === NO_ROLE ? null : value;
    setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, roleId } : x)));
    try {
      const res = await setUserRoleAction(u.id, roleId);
      if (!res.ok) {
        setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, roleId: u.roleId } : x)));
        toast({ variant: "destructive", title: "Could not update role", description: res.message });
        return;
      }
      toast({ title: "Role updated" });
    } catch {
      setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, roleId: u.roleId } : x)));
      toast({ variant: "destructive", title: "Could not update role", description: "We couldn't reach the server. Please try again." });
    }
  }

  function set(k: keyof typeof form, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  // Case-insensitive, trimmed search over name + email.
  const filteredUsers = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) =>
      [u.firstName, u.lastName, u.email].filter(Boolean).join(" ").toLowerCase().includes(q),
    );
  }, [users, query]);

  async function create() {
    const trimmedEmail = form.email.trim();
    if (!trimmedEmail) {
      toast({ variant: "destructive", title: "Email required", description: "Please enter an email address." });
      return;
    }
    if (form.password.length < 6) {
      toast({ variant: "destructive", title: "Password too short", description: "Initial password must be at least 6 characters." });
      return;
    }
    setSaving(true);
    try {
      const res = await createUserAction({
        email: trimmedEmail,
        firstName: form.firstName.trim() || undefined,
        lastName: form.lastName.trim() || undefined,
        password: form.password,
        roleId: form.roleId === NO_ROLE ? null : form.roleId,
      });
      if (!res.ok) {
        toast({ variant: "destructive", title: "Could not create user", description: res.message });
        return;
      }
      const newUser = res.data as User;
      setUsers((prev) => [...prev.filter((u) => u.id !== newUser.id), newUser]);
      setForm({ firstName: "", lastName: "", email: "", password: "", roleId: NO_ROLE });
      toast({ title: "User created" });
    } catch {
      toast({ variant: "destructive", title: "Could not create user", description: "We couldn't reach the server. Please try again." });
    } finally {
      setSaving(false);
    }
  }

  async function revokeInvite(id: string) {
    const prev = invites;
    setInvites((p) => p.filter((i) => i.id !== id));
    try {
      const res = await revokeInvitationAction(id);
      if (!res.ok) {
        setInvites(prev);
        toast({ variant: "destructive", title: "Could not revoke invite", description: res.message });
        return;
      }
      toast({ title: "Invitation revoked" });
    } catch {
      setInvites(prev);
      toast({ variant: "destructive", title: "Could not revoke invite", description: "We couldn't reach the server. Please try again." });
    }
  }

  async function toggle(u: User) {
    const next = !u.isActive;
    setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, isActive: next } : x)));
    try {
      const res = await setUserActiveAction(u.id, next);
      if (!res.ok) {
        setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, isActive: u.isActive } : x)));
        toast({ variant: "destructive", title: "Could not update user", description: res.message });
      }
    } catch {
      setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, isActive: u.isActive } : x)));
      toast({ variant: "destructive", title: "Could not update user", description: "We couldn't reach the server. Please try again." });
    }
  }

  async function remove(u: User) {
    if (!confirm(`Delete ${u.email}? This cannot be undone.`)) return;
    const prev = users;
    setUsers((p) => p.filter((x) => x.id !== u.id));
    try {
      const res = await deleteUserAction(u.id);
      if (!res.ok) {
        setUsers(prev);
        toast({ variant: "destructive", title: "Could not delete user", description: res.message });
        return;
      }
      toast({ title: "User deleted" });
    } catch {
      setUsers(prev);
      toast({ variant: "destructive", title: "Could not delete user", description: "We couldn't reach the server. Please try again." });
    }
  }

  return (
    <div className="space-y-6">
      <div className="border rounded-2xl p-6 bg-card space-y-3">
        <h3 className="font-semibold">Teams</h3>
        <div className="flex flex-wrap gap-1.5">
          {teams.length === 0 && <span className="text-xs text-muted-foreground">No teams yet</span>}
          {teams.map((t) => <Badge key={t.id} variant="secondary">{t.name}</Badge>)}
        </div>
        <div className="flex gap-2">
          <Input placeholder="New team name" value={teamName} onChange={(e) => setTeamName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); createTeam(); } }} className="flex-1" />
          <Button variant="outline" onClick={createTeam} disabled={creatingTeam || !teamName.trim()} className="gap-1">
            <Plus className="h-4 w-4" /> {creatingTeam ? "Adding…" : "Add team"}
          </Button>
        </div>
      </div>

      <div className="border rounded-2xl p-6 bg-card space-y-3">
        <div className="flex items-center gap-2"><Mail className="h-4 w-4 text-muted-foreground" /><h3 className="font-semibold">Invite by email</h3></div>
        <p className="text-sm text-muted-foreground">They set their own password via a secure link — no need to share one.</p>
        <div className="flex flex-col sm:flex-row gap-2">
          <Input type="email" placeholder="teammate@company.com" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} className="flex-1" />
          <Select value={inviteRole} onValueChange={setInviteRole}>
            <SelectTrigger className="sm:w-40"><SelectValue placeholder="No role" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_ROLE}>No role</SelectItem>
              {roles.map((r) => <SelectItem key={r.id} value={r.id} className="capitalize">{r.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button onClick={invite} disabled={inviting || !inviteEmail.trim()} className="gap-2">
            <Mail className="h-4 w-4" />{inviting ? "Sending…" : "Send invite"}
          </Button>
        </div>
      </div>

      <div className="border rounded-2xl p-6 bg-card space-y-4">
        <h3 className="font-semibold">Or add a member directly</h3>
        <form onSubmit={(e) => { e.preventDefault(); create(); }} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input placeholder="First name" value={form.firstName} onChange={(e) => set("firstName", e.target.value)} />
            <Input placeholder="Last name" value={form.lastName} onChange={(e) => set("lastName", e.target.value)} />
            <Input type="email" placeholder="Email" value={form.email} onChange={(e) => set("email", e.target.value)} />
            <div>
              <Input type="password" placeholder="Initial password (min 6 characters)" value={form.password}
                onChange={(e) => set("password", e.target.value)} />
              {form.password && form.password.length < 6 && (
                <p className="text-xs text-destructive mt-1">Must be at least 6 characters</p>
              )}
            </div>
            <Select value={form.roleId} onValueChange={(v) => set("roleId", v)}>
              <SelectTrigger><SelectValue placeholder="No role" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_ROLE}>No role</SelectItem>
                {roles.map((r) => <SelectItem key={r.id} value={r.id} className="capitalize">{r.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end">
            <Button type="submit" disabled={saving || !form.email.trim()} className="gap-2">
              <UserPlus className="h-4 w-4" />{saving ? "Creating…" : "Create user"}
            </Button>
          </div>
        </form>
      </div>

      {invites.length > 0 && (
        <div className="border rounded-2xl p-6 bg-card space-y-3">
          <div className="flex items-center gap-2"><Mail className="h-4 w-4 text-muted-foreground" /><h3 className="font-semibold">Pending invitations</h3></div>
          <p className="text-sm text-muted-foreground">Invited but not yet accepted. They appear as members once they set a password.</p>
          <div className="divide-y">
            {invites.map((inv) => {
              const roleName = roles.find((r) => r.id === inv.roleId)?.name;
              return (
                <div key={inv.id} className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-3">
                    <span className="text-sm">{inv.email}</span>
                    {roleName && <Badge variant="outline" className="capitalize">{roleName}</Badge>}
                    <Badge variant="secondary">Pending</Badge>
                  </div>
                  <div className="flex items-center gap-3">
                    {inv.link && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          navigator.clipboard?.writeText(inv.link!).then(
                            () => toast({ title: "Join link copied" }),
                            () => toast({ variant: "destructive", title: "Couldn't copy", description: inv.link }),
                          );
                        }}
                        title="Email delivery failed — copy the join link to share manually"
                      >
                        Copy link
                      </Button>
                    )}
                    <span className="text-xs text-muted-foreground">Expires {new Date(inv.expiresAt).toLocaleDateString()}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => revokeInvite(inv.id)}
                      title="Revoke invitation"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <h3 className="font-semibold">Members</h3>
        <Input
          placeholder="Search by name or email"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="max-w-xs"
        />
      </div>

      <div className="border rounded-2xl bg-card divide-y">
        {filteredUsers.length === 0 && (
          <p className="p-4 text-sm text-muted-foreground">
            {query.trim() ? "No members match your search." : "No members yet."}
          </p>
        )}
        {filteredUsers.map((u) => {
          const isSelf = u.id === currentUserId;
          return (
            <div key={u.id} className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <span className="font-medium">{[u.firstName, u.lastName].filter(Boolean).join(" ") || "—"}</span>
                <span className="text-sm text-muted-foreground">{u.email}</span>
                {isSelf && <Badge variant="outline">You</Badge>}
                <Badge variant={u.isActive ? "default" : "secondary"}>{u.isActive ? "Active" : "Inactive"}</Badge>
              </div>
              <div className="flex items-center gap-2">
                <Select value={u.roleId ?? NO_ROLE} onValueChange={(v) => assignRole(u, v)} disabled={isSelf}>
                  <SelectTrigger className="w-32 h-9"><SelectValue placeholder="No role" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_ROLE}>No role</SelectItem>
                    {roles.map((r) => <SelectItem key={r.id} value={r.id} className="capitalize">{r.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={u.teamId ?? NO_TEAM} onValueChange={(v) => assignTeam(u, v)}>
                  <SelectTrigger className="w-40 h-9"><SelectValue placeholder="No team" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_TEAM}>No team</SelectItem>
                    {teams.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button variant="outline" size="sm" onClick={() => toggle(u)} disabled={isSelf}>
                  {u.isActive ? "Deactivate" : "Activate"}
                </Button>
                <Button variant="ghost" size="icon" onClick={() => remove(u)} disabled={isSelf}
                  title={isSelf ? "You cannot delete yourself" : "Delete user"}>
                  <Trash2 className="h-4 w-4 text-white" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
