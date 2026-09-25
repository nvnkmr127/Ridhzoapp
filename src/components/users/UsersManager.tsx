"use client"
import * as React from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PasswordInput } from "@/components/ui/password-input"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { useToast } from "@/hooks/use-toast"
import {
  createUserAction,
  setUserActiveAction,
  setUserTeamAction,
  setUserRoleAction,
  deleteUserAction,
} from "@/lib/actions/users"
import { createTeamAction, renameTeamAction, deleteTeamAction } from "@/lib/actions/teams"
import { inviteUserAction, revokeInvitationAction } from "@/lib/actions/invitations"
import { UserPlus, Plus, Trash2, Mail, MoreHorizontal, Pencil, Check, X, RotateCw } from "lucide-react"

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
// Deactivate/delete confirmation. `reassign` is where their leads go: a user id, UNASSIGNED or KEEP.
type Pending = { kind: "deactivate" | "delete"; user: User; reassign: string };

const NO_TEAM = "__none__"; // Select can't use "" as a value
const UNASSIGNED = "__unassigned__";
const KEEP = "__keep__";
const fullName = (u: User) => [u.firstName, u.lastName].filter(Boolean).join(" ");

export function UsersManager({
  initialUsers,
  initialTeams,
  initialInvites = [],
  roles,
  defaultRoleId,
  leadCounts,
  currentUserId,
}: {
  initialUsers: User[];
  initialTeams: Team[];
  initialInvites?: Invite[];
  roles: Role[];
  defaultRoleId: string;
  leadCounts: Record<string, number>;
  currentUserId: string;
}) {
  const { toast } = useToast();
  const [users, setUsers] = React.useState<User[]>(initialUsers);
  const [teams, setTeams] = React.useState<Team[]>(initialTeams);
  const [invites, setInvites] = React.useState<Invite[]>(initialInvites);
  const [counts, setCounts] = React.useState(leadCounts);
  const [teamName, setTeamName] = React.useState("");
  const [creatingTeam, setCreatingTeam] = React.useState(false);
  const [editingTeam, setEditingTeam] = React.useState<{ id: string; name: string } | null>(null);
  const [query, setQuery] = React.useState("");
  const [show, setShow] = React.useState<"all" | "active" | "inactive">("all");
  const emptyForm = { firstName: "", lastName: "", email: "", password: "", roleId: defaultRoleId };
  const [form, setForm] = React.useState(emptyForm);
  const [saving, setSaving] = React.useState(false);
  const [inviteOpen, setInviteOpen] = React.useState(false);
  const [inviteEmail, setInviteEmail] = React.useState("");
  const [inviteRole, setInviteRole] = React.useState(defaultRoleId);
  const [inviting, setInviting] = React.useState(false);
  const [pending, setPending] = React.useState<Pending | null>(null);
  const [confirming, setConfirming] = React.useState(false);

  const roleName = (id: string | null) => roles.find((r) => r.id === id)?.name;
  const RoleOptions = () => <>{roles.map((r) => <SelectItem key={r.id} value={r.id} className="capitalize">{r.name}</SelectItem>)}</>;

  async function invite(email = inviteEmail.trim(), roleId = inviteRole, resend = false) {
    if (!email) return;
    setInviting(true);
    try {
      const res = await inviteUserAction({ email, roleId });
      if (!res.ok) {
        toast({ variant: "destructive", title: resend ? "Could not resend invite" : "Could not send invite", description: res.message });
        return;
      }
      const { invite: inv, emailed, link } = res.data as unknown as { invite: Invite; emailed: boolean; link: string };
      // Replace any earlier row for the same email; keep the join link when email didn't send.
      setInvites((prev) => [...prev.filter((i) => i.email !== inv.email), { ...inv, expiresAt: String(inv.expiresAt), link: emailed ? undefined : link }]);
      if (!resend) { setInviteEmail(""); setInviteRole(defaultRoleId); setInviteOpen(false); }
      if (emailed) {
        toast({ title: resend ? "Invitation resent" : "Invitation sent", description: "They'll get an email with a link to join." });
      } else {
        toast({ title: "Invite created — email not sent", description: "Use “Copy link” on the invite to share it yourself." });
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
      setTeams((prev) => [...prev, res.data as Team].sort((a, b) => a.name.localeCompare(b.name)));
      setTeamName("");
      toast({ title: "Team created" });
    } catch {
      toast({ variant: "destructive", title: "Could not create team", description: "We couldn't reach the server. Please try again." });
    } finally {
      setCreatingTeam(false);
    }
  }

  async function renameTeam() {
    if (!editingTeam || !editingTeam.name.trim()) return;
    try {
      const res = await renameTeamAction(editingTeam.id, { name: editingTeam.name.trim() });
      if (!res.ok) {
        toast({ variant: "destructive", title: "Could not rename team", description: res.message });
        return;
      }
      setTeams((prev) => prev.map((t) => (t.id === editingTeam.id ? (res.data as Team) : t)));
      setEditingTeam(null);
    } catch {
      toast({ variant: "destructive", title: "Could not rename team", description: "We couldn't reach the server. Please try again." });
    }
  }

  async function removeTeam(t: Team) {
    const n = users.filter((u) => u.teamId === t.id).length;
    if (!confirm(`Delete team "${t.name}"?${n ? ` Its ${n} member(s) stay, just without a team.` : ""}`)) return;
    try {
      const res = await deleteTeamAction(t.id);
      if (!res.ok) {
        toast({ variant: "destructive", title: "Could not delete team", description: res.message });
        return;
      }
      setTeams((prev) => prev.filter((x) => x.id !== t.id));
      setUsers((prev) => prev.map((u) => (u.teamId === t.id ? { ...u, teamId: null } : u)));
      toast({ title: "Team deleted" });
    } catch {
      toast({ variant: "destructive", title: "Could not delete team", description: "We couldn't reach the server. Please try again." });
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

  async function assignRole(u: User, roleId: string) {
    setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, roleId } : x)));
    try {
      const res = await setUserRoleAction(u.id, roleId);
      if (!res.ok) {
        setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, roleId: u.roleId } : x)));
        toast({ variant: "destructive", title: "Could not update role", description: res.message });
        return;
      }
      toast({ title: "Role updated", description: `${fullName(u) || u.email} is now ${roleName(roleId) ?? "updated"}.` });
    } catch {
      setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, roleId: u.roleId } : x)));
      toast({ variant: "destructive", title: "Could not update role", description: "We couldn't reach the server. Please try again." });
    }
  }

  // Case-insensitive, trimmed search over name + email, plus the active/deactivated filter.
  const filteredUsers = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return users.filter((u) =>
      (show === "all" || (show === "active") === u.isActive) &&
      (!q || [u.firstName, u.lastName, u.email].filter(Boolean).join(" ").toLowerCase().includes(q)),
    );
  }, [users, query, show]);

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
        roleId: form.roleId,
      });
      if (!res.ok) {
        toast({ variant: "destructive", title: "Could not add member", description: res.message });
        return;
      }
      const newUser = res.data as User;
      setUsers((prev) => [...prev.filter((u) => u.id !== newUser.id), newUser]);
      setForm(emptyForm);
      toast({ title: "Member added", description: "Share the password with them securely; they can change it after signing in." });
    } catch {
      toast({ variant: "destructive", title: "Could not add member", description: "We couldn't reach the server. Please try again." });
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

  async function activate(u: User) {
    setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, isActive: true } : x)));
    try {
      const res = await setUserActiveAction(u.id, true);
      if (!res.ok) {
        setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, isActive: false } : x)));
        toast({ variant: "destructive", title: "Could not activate", description: res.message });
      }
    } catch {
      setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, isActive: false } : x)));
      toast({ variant: "destructive", title: "Could not activate", description: "We couldn't reach the server. Please try again." });
    }
  }

  // Deactivate or delete, after the dialog: optionally hand their leads to someone else.
  async function confirmPending() {
    if (!pending) return;
    const { kind, user: u, reassign } = pending;
    const reassignTo = reassign === KEEP ? undefined : reassign === UNASSIGNED ? null : reassign;
    setConfirming(true);
    try {
      const res = kind === "delete" ? await deleteUserAction(u.id, reassignTo) : await setUserActiveAction(u.id, false, reassignTo);
      if (!res.ok) {
        toast({ variant: "destructive", title: kind === "delete" ? "Could not delete member" : "Could not deactivate", description: res.message });
        return;
      }
      const moved = (res.data as { leadsMoved?: number }).leadsMoved ?? 0;
      if (kind === "delete") setUsers((p) => p.filter((x) => x.id !== u.id));
      else setUsers((p) => p.map((x) => (x.id === u.id ? { ...x, isActive: false } : x)));
      if (moved) setCounts((c) => ({ ...c, [u.id]: 0, ...(reassignTo ? { [reassignTo]: (c[reassignTo] ?? 0) + moved } : {}) }));
      toast({
        title: kind === "delete" ? "Member deleted" : "Member deactivated",
        description: moved ? `${moved} lead(s) ${reassignTo ? `moved to ${fullName(users.find((x) => x.id === reassignTo)!) || "the new owner"}` : "are now unassigned"}.` : undefined,
      });
      setPending(null);
    } catch {
      toast({ variant: "destructive", title: "Something went wrong", description: "We couldn't reach the server. Please try again." });
    } finally {
      setConfirming(false);
    }
  }

  const activeOthers = pending ? users.filter((x) => x.isActive && x.id !== pending.user.id) : [];
  const pendingLeads = pending ? counts[pending.user.id] ?? 0 : 0;

  return (
    <div className="space-y-6">
      {/* Members — the main thing on this page */}
      <div className="border rounded-2xl bg-card">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 sm:p-6 border-b">
          <h3 className="font-semibold">Members <span className="text-muted-foreground font-normal">({users.length})</span></h3>
          <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
            <Input placeholder="Search by name or email" aria-label="Search members" value={query} onChange={(e) => setQuery(e.target.value)} className="sm:w-56" />
            <Select value={show} onValueChange={(v) => setShow(v as typeof show)}>
              <SelectTrigger className="sm:w-36" aria-label="Filter members"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Everyone</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Deactivated</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={() => setInviteOpen((o) => !o)} className="gap-2"><UserPlus className="h-4 w-4" /> Invite</Button>
          </div>
        </div>

        {inviteOpen && (
          <div className="p-4 sm:p-6 border-b bg-muted/30 space-y-3">
            <p className="text-sm text-muted-foreground">They&apos;ll get an email link and set their own password.</p>
            <div className="flex flex-col sm:flex-row gap-2">
              <Input type="email" placeholder="teammate@company.com" aria-label="Email to invite" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); invite(); } }} className="flex-1" autoFocus />
              <Select value={inviteRole} onValueChange={setInviteRole}>
                <SelectTrigger className="sm:w-40" aria-label="Role"><SelectValue placeholder="Role" /></SelectTrigger>
                <SelectContent><RoleOptions /></SelectContent>
              </Select>
              <Button onClick={() => invite()} disabled={inviting || !inviteEmail.trim() || !inviteRole} className="gap-2">
                <Mail className="h-4 w-4" />{inviting ? "Sending…" : "Send invite"}
              </Button>
            </div>
            <details className="text-sm">
              <summary className="cursor-pointer text-muted-foreground">No email? Add them directly with a password you choose</summary>
              <form onSubmit={(e) => { e.preventDefault(); create(); }} className="space-y-3 pt-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Input placeholder="First name" aria-label="First name" value={form.firstName} onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))} />
                  <Input placeholder="Last name" aria-label="Last name" value={form.lastName} onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))} />
                  <Input type="email" placeholder="Email (used to sign in)" aria-label="Email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
                  <div>
                    <PasswordInput placeholder="Initial password (min 6 characters)" aria-label="Initial password" value={form.password}
                      onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} />
                    {form.password && form.password.length < 6 && <p className="text-xs text-destructive mt-1">Must be at least 6 characters</p>}
                  </div>
                  <Select value={form.roleId} onValueChange={(v) => setForm((f) => ({ ...f, roleId: v }))}>
                    <SelectTrigger aria-label="Role"><SelectValue placeholder="Role" /></SelectTrigger>
                    <SelectContent><RoleOptions /></SelectContent>
                  </Select>
                </div>
                <div className="flex justify-end">
                  <Button type="submit" variant="outline" disabled={saving || !form.email.trim() || !form.roleId} className="gap-2">
                    <UserPlus className="h-4 w-4" />{saving ? "Adding…" : "Add member"}
                  </Button>
                </div>
              </form>
            </details>
          </div>
        )}

        <div className="divide-y">
          {filteredUsers.length === 0 && (
            <p className="p-4 text-sm text-muted-foreground">{query.trim() || show !== "all" ? "No members match." : "No members yet."}</p>
          )}
          {filteredUsers.map((u) => {
            const isSelf = u.id === currentUserId;
            return (
              <div key={u.id} className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium truncate">{fullName(u) || u.email}</span>
                    {isSelf && <Badge variant="outline">You</Badge>}
                    {!u.isActive && <Badge variant="secondary">Deactivated</Badge>}
                  </div>
                  {fullName(u) && <p className="text-sm text-muted-foreground truncate">{u.email}</p>}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Select value={u.roleId ?? ""} onValueChange={(v) => assignRole(u, v)} disabled={isSelf}>
                    <SelectTrigger className="w-36 h-9" aria-label="Role" title={isSelf ? "You can't change your own role" : undefined}><SelectValue placeholder="Member" /></SelectTrigger>
                    <SelectContent><RoleOptions /></SelectContent>
                  </Select>
                  <Select value={u.teamId ?? NO_TEAM} onValueChange={(v) => assignTeam(u, v)}>
                    <SelectTrigger className="w-40 h-9" aria-label="Team"><SelectValue placeholder="No team" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NO_TEAM}>No team</SelectItem>
                      {teams.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {!isSelf && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label={`More actions for ${fullName(u) || u.email}`}><MoreHorizontal className="h-4 w-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {u.isActive ? (
                          <DropdownMenuItem onSelect={() => setPending({ kind: "deactivate", user: u, reassign: KEEP })}>Deactivate</DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem onSelect={() => activate(u)}>Activate</DropdownMenuItem>
                        )}
                        <DropdownMenuItem className="text-destructive" onSelect={() => setPending({ kind: "delete", user: u, reassign: UNASSIGNED })}>Delete…</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {invites.length > 0 && (
        <div className="border rounded-2xl p-4 sm:p-6 bg-card space-y-3">
          <div className="flex items-center gap-2"><Mail className="h-4 w-4 text-muted-foreground" /><h3 className="font-semibold">Invitations</h3></div>
          <p className="text-sm text-muted-foreground">Invited but not joined yet. Each open invite holds a seat until it&apos;s accepted, revoked or expires.</p>
          <div className="divide-y">
            {invites.map((inv) => {
              const expired = new Date(inv.expiresAt).getTime() < Date.now();
              const rn = roleName(inv.roleId);
              return (
                <div key={inv.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 py-3">
                  <div className="flex flex-wrap items-center gap-2 min-w-0">
                    <span className="text-sm truncate">{inv.email}</span>
                    {rn && <Badge variant="outline" className="capitalize">{rn}</Badge>}
                    {expired ? <Badge variant="destructive">Expired</Badge> : <Badge variant="secondary">Pending</Badge>}
                  </div>
                  <div className="flex items-center gap-2">
                    {!expired && <span className="text-xs text-muted-foreground">Expires {new Date(inv.expiresAt).toLocaleDateString()}</span>}
                    {inv.link && !expired && (
                      <Button variant="outline" size="sm" title="Email delivery failed — copy the join link to share it yourself"
                        onClick={() => navigator.clipboard?.writeText(inv.link!).then(
                          () => toast({ title: "Join link copied" }),
                          () => toast({ variant: "destructive", title: "Couldn't copy", description: inv.link }),
                        )}>
                        Copy link
                      </Button>
                    )}
                    <Button variant="outline" size="sm" className="gap-1" disabled={inviting || !inv.roleId} onClick={() => invite(inv.email, inv.roleId!, true)}>
                      <RotateCw className="h-3.5 w-3.5" /> Resend
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => revokeInvite(inv.id)} aria-label={`Revoke invitation for ${inv.email}`} className="h-8 w-8 text-muted-foreground hover:text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="border rounded-2xl p-4 sm:p-6 bg-card space-y-3">
        <h3 className="font-semibold">Teams</h3>
        <p className="text-sm text-muted-foreground">Group people for reporting and for rotating new leads between them (set up on a lead source).</p>
        <div className="flex flex-wrap gap-2">
          {teams.length === 0 && <span className="text-xs text-muted-foreground">No teams yet</span>}
          {teams.map((t) =>
            editingTeam?.id === t.id ? (
              <span key={t.id} className="inline-flex items-center gap-1">
                <Input className="h-8 w-40" aria-label="Team name" value={editingTeam.name} autoFocus
                  onChange={(e) => setEditingTeam({ id: t.id, name: e.target.value })}
                  onKeyDown={(e) => { if (e.key === "Enter") renameTeam(); if (e.key === "Escape") setEditingTeam(null); }} />
                <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Save team name" onClick={renameTeam}><Check className="h-4 w-4" /></Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Cancel" onClick={() => setEditingTeam(null)}><X className="h-4 w-4" /></Button>
              </span>
            ) : (
              <span key={t.id} className="inline-flex items-center gap-1 rounded-full bg-secondary pl-3 pr-1 py-0.5 text-sm">
                {t.name}
                <span className="text-xs text-muted-foreground">({users.filter((u) => u.teamId === t.id).length})</span>
                <button type="button" className="p-1 text-muted-foreground hover:text-foreground" aria-label={`Rename ${t.name}`} onClick={() => setEditingTeam({ id: t.id, name: t.name })}><Pencil className="h-3 w-3" /></button>
                <button type="button" className="p-1 text-muted-foreground hover:text-destructive" aria-label={`Delete ${t.name}`} onClick={() => removeTeam(t)}><Trash2 className="h-3 w-3" /></button>
              </span>
            ),
          )}
        </div>
        <div className="flex gap-2 max-w-md">
          <Input placeholder="New team name" aria-label="New team name" value={teamName} onChange={(e) => setTeamName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); createTeam(); } }} className="flex-1" />
          <Button variant="outline" onClick={createTeam} disabled={creatingTeam || !teamName.trim()} className="gap-1">
            <Plus className="h-4 w-4" /> {creatingTeam ? "Adding…" : "Add team"}
          </Button>
        </div>
      </div>

      <Dialog open={!!pending} onOpenChange={(o) => !o && !confirming && setPending(null)}>
        <DialogContent>
          {pending && (
            <>
              <DialogHeader>
                <DialogTitle>{pending.kind === "delete" ? "Delete" : "Deactivate"} {fullName(pending.user) || pending.user.email}?</DialogTitle>
                <DialogDescription>
                  {pending.kind === "delete"
                    ? "They lose access right away and their seat is freed. Their past activity stays. Inviting the same email later restores the account."
                    : "They lose access right away but keep their seat — delete them to free it. You can activate them again any time."}
                </DialogDescription>
              </DialogHeader>
              {pendingLeads > 0 && (
                <div className="space-y-1.5">
                  <p className="text-sm font-medium">They own {pendingLeads} lead{pendingLeads === 1 ? "" : "s"}. Give them to:</p>
                  <Select value={pending.reassign} onValueChange={(v) => setPending({ ...pending, reassign: v })}>
                    <SelectTrigger aria-label="Reassign leads to"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {pending.kind === "deactivate" && <SelectItem value={KEEP}>Keep them with {fullName(pending.user) || "this person"}</SelectItem>}
                      <SelectItem value={UNASSIGNED}>No one (unassigned)</SelectItem>
                      {activeOthers.map((x) => <SelectItem key={x.id} value={x.id}>{fullName(x) || x.email}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <DialogFooter>
                <Button variant="outline" onClick={() => setPending(null)} disabled={confirming}>Cancel</Button>
                <Button variant={pending.kind === "delete" ? "destructive" : "default"} onClick={confirmPending} disabled={confirming}>
                  {confirming ? "Working…" : pending.kind === "delete" ? "Delete member" : "Deactivate"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
