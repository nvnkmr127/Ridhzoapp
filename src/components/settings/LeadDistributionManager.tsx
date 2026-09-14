"use client";

import * as React from "react";
import { Trash2, Plus, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  createDistributionRecipientAction,
  deleteDistributionRecipientAction,
  toggleDistributionRecipientAction,
} from "@/lib/actions/leadDistribution";

type Recipient = {
  id: string;
  channel: string;
  destination: string;
  isActive: number;
};

export function LeadDistributionManager({ initial }: { initial: Recipient[] }) {
  const { toast } = useToast();
  const [recipients, setRecipients] = React.useState<Recipient[]>(initial);
  const [destination, setDestination] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  async function add() {
    if (!destination.trim()) return;
    setSaving(true);
    try {
      const res = await createDistributionRecipientAction({ channel: "email", destination: destination.trim() });
      if (!res.ok) {
        toast({ variant: "destructive", title: "Couldn't add recipient", description: res.message });
        return;
      }
      setRecipients((prev) => [...prev, res.data as Recipient]);
      setDestination("");
      toast({ title: "Recipient added", description: "New leads will be emailed here as they arrive." });
    } catch {
      toast({ variant: "destructive", title: "Couldn't add recipient", description: "We couldn't reach the server. Please try again." });
    } finally {
      setSaving(false);
    }
  }

  async function toggle(r: Recipient) {
    const next = r.isActive ? 0 : 1;
    setRecipients((prev) => prev.map((x) => (x.id === r.id ? { ...x, isActive: next } : x)));
    try {
      const res = await toggleDistributionRecipientAction(r.id, next === 1);
      if (!res.ok) {
        setRecipients((prev) => prev.map((x) => (x.id === r.id ? { ...x, isActive: r.isActive } : x)));
        toast({ variant: "destructive", title: "Couldn't update recipient", description: res.message });
      }
    } catch {
      setRecipients((prev) => prev.map((x) => (x.id === r.id ? { ...x, isActive: r.isActive } : x)));
      toast({ variant: "destructive", title: "Couldn't update recipient", description: "We couldn't reach the server." });
    }
  }

  async function remove(r: Recipient) {
    if (!confirm(`Stop forwarding new leads to ${r.destination}?`)) return;
    const prev = recipients;
    setRecipients((p) => p.filter((x) => x.id !== r.id));
    try {
      const res = await deleteDistributionRecipientAction(r.id);
      if (!res.ok) {
        setRecipients(prev);
        toast({ variant: "destructive", title: "Couldn't delete", description: res.message });
      }
    } catch {
      setRecipients(prev);
      toast({ variant: "destructive", title: "Couldn't delete", description: "We couldn't reach the server." });
    }
  }

  return (
    <div className="space-y-6">
      {/* Add form */}
      <div className="rounded-2xl border p-4 space-y-3">
        <p className="text-sm font-medium flex items-center gap-2"><Mail className="h-4 w-4" /> Forward new leads to an email</p>
        <div className="flex flex-col sm:flex-row gap-2">
          <Input
            type="email"
            placeholder="partner@example.com"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
          />
          <Button onClick={add} disabled={saving || !destination.trim()} className="gap-2 shrink-0">
            <Plus className="h-4 w-4" /> {saving ? "Adding…" : "Add recipient"}
          </Button>
        </div>
      </div>

      {/* List */}
      {recipients.length === 0 ? (
        <p className="text-sm text-muted-foreground">No recipients yet. Add one above to forward every new lead by email.</p>
      ) : (
        <div className="space-y-2">
          {recipients.map((r) => (
            <div key={r.id} className="rounded-xl border p-3 flex items-center justify-between gap-3">
              <div className="min-w-0 flex items-center gap-2">
                <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                <p className="truncate text-sm font-medium">{r.destination}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button variant="outline" size="sm" onClick={() => toggle(r)}>
                  {r.isActive ? "Active" : "Paused"}
                </Button>
                <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => remove(r)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Each recipient gets a copy of every new lead the moment it&apos;s created, with a link back to the lead.
      </p>
    </div>
  );
}
