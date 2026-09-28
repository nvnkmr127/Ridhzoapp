"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { mergeLeadsAction } from "@/lib/actions/dedup";
import { Merge } from "lucide-react";

type Lead = { id: string; name: string; email: string | null; phone: string | null; createdAt: string | Date };
type Group = { key: string; match?: "email" | "phone" | "name"; leads: Lead[] };

export function DuplicatesManager({ initial }: { initial: Group[] }) {
  const { toast } = useToast();
  const [groups, setGroups] = React.useState<Group[]>(initial);
  const [busy, setBusy] = React.useState<string | null>(null);

  async function merge(group: Group, primaryId: string, duplicateId: string) {
    setBusy(duplicateId);
    try {
      const res = await mergeLeadsAction({ primaryId, duplicateId });
      if (!res.ok) {
        toast({ variant: "destructive", title: "Merge failed", description: res.message });
        return;
      }
      // Drop the merged lead from the group; remove groups that fall below 2.
      setGroups((prev) =>
        prev
          .map((g) => (g.key === group.key ? { ...g, leads: g.leads.filter((l) => l.id !== duplicateId) } : g))
          .filter((g) => g.leads.length > 1),
      );
      toast({ title: "Leads merged" });
    } catch {
      toast({ variant: "destructive", title: "Merge failed", description: "We couldn't reach the server. Please try again." });
    } finally {
      setBusy(null);
    }
  }

  if (groups.length === 0) {
    return <div className="rounded-2xl border border-border bg-card p-8 text-center text-muted-foreground">No duplicate leads found.</div>;
  }

  return (
    <div className="space-y-4">
      {groups.map((group) => {
        const primary = group.leads[0];
        return (
          <div key={group.key} className="border rounded-2xl bg-card p-4 space-y-2">
            {group.match === "name" ? (
              <div className="text-xs text-amber-700 dark:text-amber-400">Same name, different contact details — check it&apos;s the same person before merging</div>
            ) : (
              <div className="text-xs text-muted-foreground">Same {group.match ?? (group.key.startsWith("e:") ? "email" : "phone")}</div>
            )}
            {group.leads.map((l, i) => (
              <div key={l.id} className="flex items-center justify-between py-1">
                <div className="flex items-center gap-3 text-sm">
                  <span className="font-medium">{l.name}</span>
                  <span className="text-muted-foreground">{[l.email, l.phone].filter(Boolean).join(" · ") || "No contact details"}</span>
                  {i === 0 && <span className="text-xs text-muted-foreground font-medium">keeps (oldest shown first)</span>}
                </div>
                {i !== 0 && (
                  <Button size="sm" variant="outline" className="gap-1" disabled={busy === l.id}
                    onClick={() => merge(group, primary.id, l.id)}>
                    <Merge className="h-3.5 w-3.5" /> Merge into first
                  </Button>
                )}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
