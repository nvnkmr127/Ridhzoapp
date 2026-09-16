"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LogIn, Ban, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  setOrgPlanAction,
  setOrgSuspendedAction,
  impersonateOrgAction,
} from "@/lib/actions/platform";

type Org = {
  id: string;
  name: string;
  slug: string;
  plan: string;
  planStatus: string;
  suspended: boolean;
  userCount: number;
  leadCount: number;
  createdAt: string | Date;
};

const PLANS = ["free", "pro", "business"];

export function PlatformConsole({ initial = [] }: { initial?: Org[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [orgs, setOrgs] = React.useState<Org[]>(initial ?? []);
  const [busy, setBusy] = React.useState<string | null>(null);

  async function changePlan(org: Org, plan: string) {
    setOrgs((s) => s.map((o) => (o.id === org.id ? { ...o, plan } : o)));
    const res = await setOrgPlanAction({ organizationId: org.id, plan: plan as any });
    if (!res.ok) {
      setOrgs((s) => s.map((o) => (o.id === org.id ? { ...o, plan: org.plan } : o)));
      toast({ variant: "destructive", title: "Couldn't change plan", description: res.message });
    } else {
      toast({ title: `Plan set to ${plan}` });
    }
  }

  async function toggleSuspend(org: Org) {
    const next = !org.suspended;
    if (next && !confirm(`Suspend ${org.name}? Its users won't be able to sign in.`)) return;
    setBusy(org.id);
    setOrgs((s) => s.map((o) => (o.id === org.id ? { ...o, suspended: next } : o)));
    const res = await setOrgSuspendedAction(org.id, next);
    if (!res.ok) {
      setOrgs((s) => s.map((o) => (o.id === org.id ? { ...o, suspended: org.suspended } : o)));
      toast({ variant: "destructive", title: "Couldn't update", description: res.message });
    } else {
      toast({ title: next ? "Organization suspended" : "Organization reactivated" });
    }
    setBusy(null);
  }

  async function impersonate(org: Org) {
    setBusy(org.id);
    const res = await impersonateOrgAction(org.id);
    setBusy(null);
    if (!res.ok) {
      toast({ variant: "destructive", title: "Couldn't open tenant", description: res.message });
      return;
    }
    router.push("/leads"); // now scoped to the impersonated org
  }

  return (
    <div className="rounded-2xl border overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-muted-foreground">
            <tr className="text-left">
              <th className="px-4 py-3 font-medium">Organization</th>
              <th className="px-4 py-3 font-medium text-right">Users</th>
              <th className="px-4 py-3 font-medium text-right">Leads</th>
              <th className="px-4 py-3 font-medium">Plan</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(orgs ?? []).map((o) => (
              <tr key={o.id} className="border-t border-border">
                <td className="px-4 py-3">
                  <div className="font-medium text-foreground">{o.name}</div>
                  <div className="text-xs text-muted-foreground">{o.slug}</div>
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{o.userCount}</td>
                <td className="px-4 py-3 text-right tabular-nums">{o.leadCount}</td>
                <td className="px-4 py-3">
                  <Select value={PLANS.includes(o.plan) ? o.plan : "free"} onValueChange={(v) => changePlan(o, v)}>
                    <SelectTrigger className="h-8 w-28"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PLANS.map((p) => <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </td>
                <td className="px-4 py-3">
                  {o.suspended
                    ? <span className="rounded-full bg-destructive/10 text-destructive px-2 py-0.5 text-xs font-medium">Suspended</span>
                    : <span className="rounded-full bg-emerald-500/10 text-emerald-600 px-2 py-0.5 text-xs font-medium">Active</span>}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-2">
                    <Button variant="outline" size="sm" className="gap-1.5" disabled={busy === o.id} onClick={() => impersonate(o)}>
                      <LogIn className="h-3.5 w-3.5" /> Open
                    </Button>
                    <Button
                      variant="ghost" size="sm"
                      className={`gap-1.5 ${o.suspended ? "" : "text-destructive hover:text-destructive"}`}
                      disabled={busy === o.id}
                      onClick={() => toggleSuspend(o)}
                    >
                      {o.suspended ? <><RotateCcw className="h-3.5 w-3.5" /> Reactivate</> : <><Ban className="h-3.5 w-3.5" /> Suspend</>}
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
