"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { PERMISSIONS, SYSTEM_ROLE_PERMISSIONS } from "@/lib/permissions";
import { createRoleAction, updateRoleAction, deleteRoleAction } from "@/lib/actions/roles";
import { Shield, Plus, Trash2, Pencil, Check, X } from "lucide-react";

type Role = { id: string; name: string; permissions: string[]; organizationId: string | null };

const PERM_ENTRIES = Object.entries(PERMISSIONS) as [keyof typeof PERMISSIONS, string][];

export function RolesManager({ initialRoles, memberCounts }: { initialRoles: Role[]; memberCounts: Record<string, number> }) {
  const { toast } = useToast();
  const [roles, setRoles] = React.useState<Role[]>(initialRoles);
  const [name, setName] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  // Roles with a permission save in flight: their checkboxes are locked so rapid clicks can't send
  // two full permission lists that land out of order.
  const [busy, setBusy] = React.useState<Set<string>>(new Set());
  const [renaming, setRenaming] = React.useState<{ id: string; name: string } | null>(null);

  const setBusyFor = (id: string, on: boolean) =>
    setBusy((prev) => { const next = new Set(prev); if (on) next.add(id); else next.delete(id); return next; });

  async function create() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const res = await createRoleAction({ name: name.trim(), permissions: [] });
      if (!res.ok) {
        toast({ variant: "destructive", title: "Could not create role", description: res.message });
        return;
      }
      setRoles((prev) => [...prev, res.data as Role]);
      setName("");
      toast({ title: "Role created", description: "Now tick what people with this role can do." });
    } catch {
      toast({ variant: "destructive", title: "Could not create role", description: "We couldn't reach the server. Please try again." });
    } finally {
      setSaving(false);
    }
  }

  async function rename() {
    if (!renaming || !renaming.name.trim()) return;
    try {
      const res = await updateRoleAction(renaming.id, { name: renaming.name.trim() });
      if (!res.ok) {
        toast({ variant: "destructive", title: "Could not rename role", description: res.message });
        return;
      }
      setRoles((prev) => prev.map((r) => (r.id === renaming.id ? { ...r, name: (res.data as Role).name } : r)));
      setRenaming(null);
    } catch {
      toast({ variant: "destructive", title: "Could not rename role", description: "We couldn't reach the server. Please try again." });
    }
  }

  async function togglePerm(role: Role, key: string) {
    if (busy.has(role.id)) return;
    const permissions = role.permissions.includes(key)
      ? role.permissions.filter((p) => p !== key)
      : [...role.permissions, key];
    setRoles((prev) => prev.map((r) => (r.id === role.id ? { ...r, permissions } : r)));
    setBusyFor(role.id, true);
    try {
      const res = await updateRoleAction(role.id, { permissions });
      if (!res.ok) {
        setRoles((prev) => prev.map((r) => (r.id === role.id ? role : r)));
        toast({ variant: "destructive", title: "Could not update permissions", description: res.message });
      }
    } catch {
      setRoles((prev) => prev.map((r) => (r.id === role.id ? role : r)));
      toast({ variant: "destructive", title: "Could not update permissions", description: "We couldn't reach the server. Please try again." });
    } finally {
      setBusyFor(role.id, false);
    }
  }

  async function remove(role: Role) {
    if (!confirm(`Delete role "${role.name}"?`)) return;
    try {
      const res = await deleteRoleAction(role.id);
      if (!res.ok) {
        toast({ variant: "destructive", title: "Could not delete role", description: res.message });
        return;
      }
      setRoles((p) => p.filter((r) => r.id !== role.id));
      toast({ title: "Role deleted" });
    } catch {
      toast({ variant: "destructive", title: "Could not delete role", description: "We couldn't reach the server. Please try again." });
    }
  }

  return (
    <div className="border rounded-2xl p-4 sm:p-6 bg-card space-y-4">
      <div className="flex items-center gap-2">
        <Shield className="h-5 w-5 text-muted-foreground" />
        <h3 className="font-semibold">Roles &amp; permissions</h3>
      </div>
      <p className="text-sm text-muted-foreground">
        <span className="font-medium">Admin</span> can do everything. <span className="font-medium">Member</span> can work leads
        (create, edit, assign, change status). Create a custom role to choose exactly what someone can do. Changes save as you tick
        and apply to people within a minute.
      </p>

      <div className="flex gap-2 max-w-md">
        <Input placeholder="New role name (e.g. Sales Lead)" aria-label="New role name" value={name} onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); create(); } }} />
        <Button variant="outline" onClick={create} disabled={saving || !name.trim()} className="gap-1">
          <Plus className="h-4 w-4" /> Add role
        </Button>
      </div>

      <div className="space-y-3">
        {roles.map((role) => {
          const isSystem = role.organizationId === null;
          // Only the shared SYSTEM admin implicitly holds every permission. A tenant role named
          // "admin" (legacy data) shows its real permissions, matching hasPermission.
          const isAdmin = isSystem && role.name === "admin";
          const members = memberCounts[role.id] ?? 0;
          return (
            <div key={role.id} className="border rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                {renaming?.id === role.id ? (
                  <div className="flex items-center gap-1">
                    <Input className="h-8 w-48" aria-label="Role name" value={renaming.name} autoFocus
                      onChange={(e) => setRenaming({ id: role.id, name: e.target.value })}
                      onKeyDown={(e) => { if (e.key === "Enter") rename(); if (e.key === "Escape") setRenaming(null); }} />
                    <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Save role name" onClick={rename}><Check className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Cancel" onClick={() => setRenaming(null)}><X className="h-4 w-4" /></Button>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium capitalize">{role.name}</span>
                    {isSystem && <Badge variant="secondary">Built-in</Badge>}
                    <span className="text-xs text-muted-foreground">{members} member{members === 1 ? "" : "s"}</span>
                  </div>
                )}
                {!isSystem && renaming?.id !== role.id && (
                  <div className="flex items-center">
                    <Button variant="ghost" size="icon" onClick={() => setRenaming({ id: role.id, name: role.name })} aria-label={`Rename ${role.name}`}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => remove(role)} aria-label={`Delete ${role.name}`}
                      disabled={members > 0} title={members > 0 ? "Give its members another role before deleting it" : undefined}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {PERM_ENTRIES.map(([key, label]) => {
                  // Built-in roles also get their code defaults (e.g. member → leads.edit), matching hasPermission.
                  const checked = isAdmin || role.permissions.includes(key) || (isSystem && !!SYSTEM_ROLE_PERMISSIONS[role.name.toLowerCase()]?.includes(key));
                  return (
                    <label key={key} className="flex items-center gap-2 text-sm text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={isSystem || busy.has(role.id)}
                        onChange={() => togglePerm(role, key)}
                        className="h-4 w-4 rounded border-border"
                      />
                      {label}
                    </label>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
