"use client";

import * as React from "react";
import { canonicalPlan } from "@/domains/billing/planNames";
import { Power, Megaphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { toggleMaintenanceModeAction, setBroadcastAction } from "@/lib/actions/platform";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { PlatformConsoleProps } from "./types";

export function AnnouncementsTab({ initial = [], initialBroadcast, initialMaintenance = { enabled: false, message: "" } }: PlatformConsoleProps) {
  const { toast } = useToast();
  const orgs = initial;
  const [broadcastMessage, setBroadcastMessage] = React.useState(initialBroadcast?.message ?? "");
  const [broadcastActive, setBroadcastActive] = React.useState(initialBroadcast?.active ?? false);
  const [broadcastLevel, setBroadcastLevel] = React.useState<"info" | "warning" | "destructive">(
    initialBroadcast?.level ?? "info"
  );
  const [broadcastTargetPlan, setBroadcastTargetPlan] = React.useState<"all" | "free" | "starter" | "unlimited">(
    initialBroadcast?.targetPlan && initialBroadcast.targetPlan !== "all" ? canonicalPlan(initialBroadcast.targetPlan) : "all"
  );
  const [broadcastTargetOrgId, setBroadcastTargetOrgId] = React.useState<string>(
    initialBroadcast?.targetOrgId ?? "all"
  );
  const [savingBroadcast, setSavingBroadcast] = React.useState(false);

  async function handleSaveBroadcast() {
    setSavingBroadcast(true);
    const res = await setBroadcastAction({
      message: broadcastMessage,
      active: broadcastActive,
      level: broadcastLevel,
      targetPlan: broadcastTargetPlan === "all" ? null : broadcastTargetPlan,
      targetOrgId: broadcastTargetOrgId === "all" ? null : broadcastTargetOrgId,
    });
    setSavingBroadcast(false);
    if (!res.ok) {
      toast({ variant: "destructive", title: "Failed to update broadcast", description: res.message });
    } else {
      toast({ title: broadcastActive ? "Broadcast banner published" : "Broadcast banner deactivated" });
    }
  }

  const [maintenance, setMaintenance] = React.useState<{ enabled: boolean; message: string }>(
    initialMaintenance ?? { enabled: false, message: "" }
  );
  const [maintenanceSaving, setMaintenanceSaving] = React.useState(false);
  async function handleSaveMaintenance() {
    // Turning it on locks every tenant out of the app — make the operator type it.
    if (maintenance.enabled && window.prompt('This locks EVERY workspace out of Ridhzo (super-admins excepted). Type MAINTENANCE to confirm.')?.trim() !== "MAINTENANCE") return;
    setMaintenanceSaving(true);
    const res = await toggleMaintenanceModeAction(maintenance.enabled, maintenance.message);
    setMaintenanceSaving(false);
    if (!res.ok) {
      toast({ variant: "destructive", title: "Failed to update maintenance mode", description: res.message });
    } else {
      toast({
        title: maintenance.enabled ? "Maintenance Mode Activated" : "Maintenance Mode Deactivated",
        description: maintenance.enabled
          ? "Platform is in restricted maintenance state."
          : "Normal platform traffic restored.",
      });
    }
  }

  return (
    <div className="space-y-6">
      {/* Global Broadcast Announcement */}
      <div className="rounded-2xl border bg-card p-5 space-y-4">
        <div className="flex items-center gap-2 border-b pb-3">
          <Megaphone className="h-5 w-5 text-primary" />
          <div>
            <h3 className="text-sm font-semibold">Global Broadcast Announcement</h3>
            <p className="text-xs text-muted-foreground">
              Displays an alert banner across all tenant dashboards simultaneously.
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium">Announcement Message</label>
            <Input
              placeholder="e.g. Scheduled maintenance tonight at 2:00 AM UTC (15 mins)"
              value={broadcastMessage}
              onChange={(e) => setBroadcastMessage(e.target.value)}
              className="mt-1 text-sm"
            />
          </div>

          <div className="flex items-center gap-3">
            <div className="flex-1">
              <label className="text-xs font-medium">Banner Severity</label>
              <Select
                value={broadcastLevel}
                onValueChange={(v: any) => setBroadcastLevel(v)}
              >
                <SelectTrigger className="mt-1 h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="info">Info (Primary Theme)</SelectItem>
                  <SelectItem value="warning">Warning (Amber Attention)</SelectItem>
                  <SelectItem value="destructive">Alert (Red Critical)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col justify-end">
              <label className="text-xs font-medium mb-1">State</label>
              <Button
                type="button"
                variant={broadcastActive ? "default" : "outline"}
                size="sm"
                className="h-9 text-xs"
                onClick={() => setBroadcastActive(!broadcastActive)}
              >
                {broadcastActive ? "Active / Visible" : "Disabled / Hidden"}
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium">Target Plan Audience</label>
              <Select
                value={broadcastTargetPlan}
                onValueChange={(v: any) => setBroadcastTargetPlan(v)}
              >
                <SelectTrigger className="mt-1 h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Plans (Global)</SelectItem>
                  <SelectItem value="free">Free Plan Only</SelectItem>
                  <SelectItem value="starter">Starter Plan Only</SelectItem>
                  <SelectItem value="unlimited">Unlimited Plan Only</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-xs font-medium">Target Specific Tenant (Optional)</label>
              <Select
                value={broadcastTargetOrgId}
                onValueChange={(v: any) => setBroadcastTargetOrgId(v)}
              >
                <SelectTrigger className="mt-1 h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Tenants (No Restriction)</SelectItem>
                  {orgs.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.name} ({o.slug})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {(broadcastTargetPlan !== "all" || broadcastTargetOrgId !== "all") && (
            <div className="text-xs text-muted-foreground flex items-center gap-2 bg-muted/50 p-2.5 rounded-lg border border-border">
              <span className="font-semibold text-foreground">Target Audience:</span>
              {broadcastTargetPlan !== "all" && (
                <Badge variant="outline" className="text-[10px] capitalize bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20">
                  Plan: {broadcastTargetPlan}
                </Badge>
              )}
              {broadcastTargetOrgId !== "all" && (
                <Badge variant="outline" className="text-[10px] bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/20">
                  Tenant: {orgs.find((o) => o.id === broadcastTargetOrgId)?.name || broadcastTargetOrgId}
                </Badge>
              )}
            </div>
          )}

          <div className="pt-2">
            <Button
              size="sm"
              className="gap-1.5"
              disabled={savingBroadcast}
              onClick={handleSaveBroadcast}
            >
              Save Broadcast Banner
            </Button>
          </div>
        </div>
      </div>

      {/* Maintenance Mode & Emergency Lockdown Card */}
      <div className="rounded-2xl border border-destructive/30 bg-card p-5 space-y-4 shadow-sm">
        <div className="flex items-center justify-between border-b pb-3">
          <div className="flex items-center gap-2">
            <Power className="h-5 w-5 text-destructive" />
            <div>
              <h3 className="text-sm font-semibold">Global Maintenance Mode &amp; Killswitch</h3>
              <p className="text-xs text-muted-foreground">
                Puts the platform into scheduled maintenance state or displays broadcast lockdown banners.
              </p>
            </div>
          </div>
          <Badge
            variant={maintenance.enabled ? "destructive" : "outline"}
            className="text-xs"
          >
            {maintenance.enabled ? "MAINTENANCE ACTIVE" : "Normal Operations"}
          </Badge>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-foreground">Maintenance Notice to Users</label>
            <Input
              placeholder="System is undergoing scheduled maintenance. Please check back shortly."
              value={maintenance.message}
              onChange={(e) => setMaintenance((prev) => ({ ...prev, message: e.target.value }))}
              className="mt-1 h-9 text-xs"
            />
          </div>

          <div className="flex items-center justify-between pt-2">
            <div className="text-xs text-muted-foreground">
              Status:{" "}
              <span className="font-medium text-foreground">
                {maintenance.enabled ? "Users see maintenance banner" : "Platform fully accessible"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant={maintenance.enabled ? "outline" : "destructive"}
                size="sm"
                className="h-8 text-xs"
                onClick={() =>
                  setMaintenance((prev) => ({ ...prev, enabled: !prev.enabled }))
                }
              >
                {maintenance.enabled ? "Deactivate Mode" : "Activate Maintenance Mode"}
              </Button>
              <Button
                size="sm"
                className="h-8 text-xs"
                disabled={maintenanceSaving}
                onClick={handleSaveMaintenance}
              >
                {maintenanceSaving ? "Saving..." : "Save Status"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
