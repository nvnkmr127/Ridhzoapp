"use client";

import * as React from "react";
import Link from "next/link";
import { LogIn, Building2, ShieldCheck, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { searchGlobalUsersAction, toggleUserActiveAction, toggleSuperAdminAction } from "@/lib/actions/platform";
import type { GlobalUserSummary } from "@/domains/platform/service";
import { useConfirm } from "@/components/ui/confirm-dialog";
import type { PlatformConsoleProps } from "./types";
import { useImpersonate } from "./useImpersonate";

export function UsersTab({ initialUsers = [] }: PlatformConsoleProps) {
  const [confirm, confirmDialog] = useConfirm();
  const { toast } = useToast();
  const [users, setUsers] = React.useState<GlobalUserSummary[]>(initialUsers ?? []);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [userSearch, setUserSearch] = React.useState("");
  const [searchingUsers, setSearchingUsers] = React.useState(false);

  // Broadcast state
  React.useEffect(() => {
    const timer = setTimeout(async () => {
      setSearchingUsers(true);
      try {
        const res = await searchGlobalUsersAction(userSearch);
        setUsers(res);
      } catch {
        // quiet error
      } finally {
        setSearchingUsers(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [userSearch]);

  const impersonate = useImpersonate(setBusy, confirm);

  async function handleToggleUserActive(user: GlobalUserSummary) {
    const next = !user.isActive;
    setBusy(user.id);
    const res = await toggleUserActiveAction(user.id, next);
    setBusy(null);
    if (!res.ok) {
      toast({ variant: "destructive", title: "Couldn't update user", description: res.message });
    } else {
      setUsers((s) => s.map((u) => (u.id === user.id ? { ...u, isActive: next } : u)));
      toast({ title: next ? "User activated" : "User deactivated" });
    }
  }

  async function handleToggleSuperAdmin(user: GlobalUserSummary) {
    const next = !user.isSuperAdmin;
    const ok = await confirm(
      next
        ? { title: `Make ${user.email} a super-admin?`, description: "They get access to every tenant and this console.", confirmLabel: "Grant super-admin", destructive: true }
        : { title: `Remove super-admin from ${user.email}?`, confirmLabel: "Revoke", destructive: true },
    );
    if (!ok) return;

    setBusy(user.id);
    const res = await toggleSuperAdminAction(user.id, next);
    setBusy(null);
    if (!res.ok) {
      toast({ variant: "destructive", title: "Action failed", description: res.message });
    } else {
      setUsers((s) => s.map((u) => (u.id === user.id ? { ...u, isSuperAdmin: next } : u)));
      toast({ title: next ? "SuperAdmin rights granted" : "SuperAdmin rights revoked" });
    }
  }

  return (
    <div className="space-y-4">
      {confirmDialog}
      <div className="flex items-center justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by email, name, or organization..."
            value={userSearch}
            onChange={(e) => setUserSearch(e.target.value)}
            className="pl-9 h-9 text-sm"
          />
        </div>
        {searchingUsers && <span className="text-xs text-muted-foreground">Searching...</span>}
      </div>

      <div className="rounded-2xl border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr className="text-left">
                <th className="px-4 py-3 font-medium">User</th>
                <th className="px-4 py-3 font-medium">Organization</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">SuperAdmin</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                    No users found across any organization.
                  </td>
                </tr>
              ) : (
                users.map((u) => {
                  const fullName = [u.firstName, u.lastName].filter(Boolean).join(" ") || "Unnamed";
                  return (
                    <tr key={u.id} className="border-t border-border hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-medium text-foreground">{fullName}</div>
                        <div className="text-xs text-muted-foreground font-mono">{u.email}</div>
                      </td>
                      <td className="px-4 py-3">
                        {u.organizationName && u.organizationId ? (
                          <Link
                            href={`/admin/tenant/${u.organizationId}`}
                            className="inline-flex items-center gap-1 group"
                            title="Open Tenant 360 view"
                          >
                            <Badge variant="outline" className="font-normal text-xs group-hover:bg-primary/10 group-hover:border-primary/30 transition-colors cursor-pointer">
                              {u.organizationName}
                            </Badge>
                          </Link>
                        ) : u.organizationName ? (
                          <Badge variant="outline" className="font-normal text-xs">
                            {u.organizationName}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">None (platform)</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs capitalize text-muted-foreground">
                        {u.roleName ?? "member"}
                      </td>
                      <td className="px-4 py-3">
                        {u.isActive ? (
                          <span className="rounded-full bg-emerald-500/10 text-emerald-600 px-2 py-0.5 text-xs font-medium">Active</span>
                        ) : (
                          <span className="rounded-full bg-destructive/10 text-destructive px-2 py-0.5 text-xs font-medium">Inactive</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {u.isSuperAdmin ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-2 py-0.5 text-xs font-medium">
                            <ShieldCheck className="h-3 w-3" /> SuperAdmin
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1.5">
                          {u.organizationId && (
                            <>
                              <Link href={`/admin/tenant/${u.organizationId}`}>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-8 text-xs gap-1"
                                  title="Open Tenant 360 view"
                                >
                                  <Building2 className="h-3 w-3" /> 360
                                </Button>
                              </Link>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8 text-xs gap-1"
                                disabled={busy === u.id}
                                onClick={() => impersonate(u.organizationId!, "/leads")}
                              >
                                <LogIn className="h-3 w-3" /> Org
                              </Button>
                            </>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 text-xs"
                            disabled={busy === u.id}
                            onClick={() => handleToggleUserActive(u)}
                          >
                            {u.isActive ? "Deactivate" : "Activate"}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className={`h-8 text-xs ${u.isSuperAdmin ? "text-destructive hover:text-destructive" : ""}`}
                            disabled={busy === u.id}
                            onClick={() => handleToggleSuperAdmin(u)}
                          >
                            {u.isSuperAdmin ? "Revoke Super" : "Make Super"}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
