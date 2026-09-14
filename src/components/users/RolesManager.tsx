"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { PERMISSIONS } from "@/lib/permissions";
import { createRoleAction, updateRoleAction, deleteRoleAction } from "@/lib/actions/roles";
import { Shield, Plus, Trash2 } from "lucide-react";

type Role = { id: string; name: string; permissions: string[]; organizationId: string | null };

const PERM_ENTRIES = Object.entries(PERMISSIONS) as [keyof typeof PERMISSIONS, string][];

export function RolesManager({ initialRoles }: { initialRoles: Role[] }) {
  const { toast } = useToast();
  const [roles, setRoles] = React.useState<Role[]>(initialRoles);
  const [name, setName] = React.useState("");
  const [saving, setSaving] = React.useState(false);

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
      toast({ title: "Role created" });
    } catch {
      toast({ variant: "destructive", title: "Could not create role", description: "We couldn't reach the server. Please try again." });
    } finally {
      setSaving(false);
    }
  }

  async function togglePerm(role: Role, key: string) {
    const permissions = role.permissions.includes(key)
      ? role.permissions.filter((p) => p !== key)
      : [...role.permissions, key];
    setRoles((prev) => prev.map((r) => (r.id === role.id ? { ...r, permissions } : r)));
    try {
      const res = await updateRoleAction(role.id, { permissions });
      if (!res.ok) {
        setRoles((prev) => prev.map((r) => (r.id === role.id ? role : r)));
        toast({ variant: "destructive", title: "Could not update permissions", description: res.message });
      }
    } catch {
      setRoles((prev) => prev.map((r) => (r.id === role.id ? role : r)));
      toast({ variant: "destructive", title: "Could not update permissions", description: "We couldn't reach the server. Please try again." });
    }
  }

  async function remove(role: Role) {
    if (!confirm(`Delete role "${role.name}"? Users with it will lose the role.`)) return;
    const prev = roles;
    setRoles((p) => p.filter((r) => r.id !== role.id));
    try {
      const res = await deleteRoleAction(role.id);
      if (!res.ok) {
        setRoles(prev);
        toast({ variant: "destructive", title: "Could not delete role", description: res.message });
        return;
      }
      toast({ title: "Role deleted" });
    } catch {
      setRoles(prev);
      toast({ variant: "destructive", title: "Could not delete role", description: "We couldn't reach the server. Please try again." });
    }
  }

  return (
    <div className="border rounded-2xl p-6 bg-card space-y-4">
      <div className="flex items-center gap-2">
        <Shield className="h-5 w-5 text-muted-foreground" />
        <h3 className="font-semibold">Roles &amp; Permissions</h3>
      </div>
      <p className="text-sm text-muted-foreground">
        System roles (<span className="font-medium">admin</span>, <span className="font-medium">member</span>) can’t be edited.
        Create custom roles and choose exactly what they can do. Admin always has every permission.
      </p>

      <div className="flex gap-2 max-w-md">
        <Input placeholder="New role name (e.g. Sales Lead)" value={name} onChange={(e) => setName(e.target.value)}
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
          return (
            <div key={role.id} className="border rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-medium capitalize">{role.name}</span>
                  {isSystem && <Badge variant="secondary">System</Badge>}
                </div>
                {!isSystem && (
                  <Button variant="ghost" size="icon" onClick={() => remove(role)} title="Delete role">
                    <Trash2 className="h-4 w-4 text-white" />
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {PERM_ENTRIES.map(([key, label]) => {
                  const checked = isAdmin || role.permissions.includes(key);
                  return (
                    <label key={key} className="flex items-center gap-2 text-sm text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={isSystem}
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
