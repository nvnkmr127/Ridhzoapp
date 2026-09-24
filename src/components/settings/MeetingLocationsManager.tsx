"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { deleteMeetingLocationAction, saveMeetingLocationAction } from "@/lib/actions/meetings";
import { useToast } from "@/hooks/use-toast";

type Loc = { id: string; name: string; address: string | null; mapUrl: string | null; phone: string | null };
const empty = { name: "", address: "", mapUrl: "", phone: "" };

// Stores / offices / branches a lead can be invited to. Picked in one tap when booking a store visit.
export function MeetingLocationsManager({ initial }: { initial: Loc[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [editingId, setEditingId] = React.useState<string | "new" | null>(initial.length === 0 ? "new" : null);
  const [f, setF] = React.useState(empty);
  const [busy, setBusy] = React.useState(false);

  const edit = (l: Loc | null) => {
    setEditingId(l ? l.id : "new");
    setF(l ? { name: l.name, address: l.address ?? "", mapUrl: l.mapUrl ?? "", phone: l.phone ?? "" } : empty);
  };

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await saveMeetingLocationAction({ ...(editingId && editingId !== "new" ? { id: editingId } : {}), ...f });
      if (!res.ok) {
        toast({ variant: "destructive", title: "Location not saved", description: res.message });
        return;
      }
      toast({ title: "Location saved" });
      setEditingId(null);
      router.refresh();
    } catch {
      toast({ variant: "destructive", title: "Location not saved", description: "We couldn't reach the server. Please try again." });
    } finally {
      setBusy(false);
    }
  }

  async function remove(l: Loc) {
    if (!window.confirm(`Remove "${l.name}"? Meetings already booked there keep their address.`)) return;
    setBusy(true);
    try {
      const res = await deleteMeetingLocationAction(l.id);
      if (!res.ok) {
        toast({ variant: "destructive", title: "Couldn't remove", description: res.message });
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {initial.map((l) =>
        editingId === l.id ? null : (
          <div key={l.id} className="flex items-start justify-between gap-3 rounded-2xl border bg-card p-4">
            <div className="flex min-w-0 gap-3">
              <Store className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 text-sm">
                <p className="font-medium">{l.name}</p>
                {l.address && <p className="whitespace-pre-wrap text-muted-foreground">{l.address}</p>}
                {l.phone && <p className="text-muted-foreground">{l.phone}</p>}
                {l.mapUrl && (
                  <a href={l.mapUrl} target="_blank" rel="noopener noreferrer" className="text-xs underline">Map link</a>
                )}
              </div>
            </div>
            <div className="flex shrink-0 gap-1">
              <Button variant="ghost" size="icon" aria-label={`Edit ${l.name}`} onClick={() => edit(l)} disabled={busy}><Pencil className="h-4 w-4" /></Button>
              <Button variant="ghost" size="icon" aria-label={`Remove ${l.name}`} onClick={() => remove(l)} disabled={busy}><Trash2 className="h-4 w-4" /></Button>
            </div>
          </div>
        ),
      )}

      {editingId ? (
        <form onSubmit={save} className="space-y-3 rounded-2xl border bg-muted/30 p-4">
          <Input placeholder="Name (e.g. Banjara Hills showroom) *" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required />
          <Textarea placeholder="Address" value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} className="min-h-[60px]" />
          <div className="grid gap-3 sm:grid-cols-2">
            <Input type="url" placeholder="Google Maps link" value={f.mapUrl} onChange={(e) => setF({ ...f, mapUrl: e.target.value })} />
            <Input placeholder="Phone (optional)" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
          </div>
          <div className="flex justify-end gap-2">
            {initial.length > 0 && <Button type="button" variant="outline" onClick={() => setEditingId(null)} disabled={busy}>Cancel</Button>}
            <Button type="submit" disabled={busy || !f.name.trim()}>{busy ? "Saving…" : "Save location"}</Button>
          </div>
        </form>
      ) : (
        <Button variant="outline" className="gap-1.5" onClick={() => edit(null)}>
          <Plus className="h-4 w-4" /> Add location
        </Button>
      )}
    </div>
  );
}
