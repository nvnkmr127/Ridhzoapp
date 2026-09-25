"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { searchLeadsAction } from "@/lib/actions/search";
import { createFollowUp } from "@/lib/actions/follow-ups";
import { FOLLOW_UP_TYPES } from "@/lib/followUps/types";

const tomorrow9 = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

// Create a follow-up from the Follow-ups page: find the lead, say what and when.
export function NewFollowUpButton() {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<{ id: string; name: string; phone: string | null }[]>([]);
  const [lead, setLead] = React.useState<{ id: string; name: string } | null>(null);
  const [title, setTitle] = React.useState("");
  const [type, setType] = React.useState("call");
  const [due, setDue] = React.useState(tomorrow9);
  const [saving, setSaving] = React.useState(false);

  // Debounced lead search (only leads you may work are returned).
  React.useEffect(() => {
    if (lead || query.trim().length < 2) { setResults([]); return; }
    const t = setTimeout(() => {
      searchLeadsAction(query).then(setResults).catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(t);
  }, [query, lead]);

  function reset() {
    setQuery(""); setResults([]); setLead(null); setTitle(""); setType("call"); setDue(tomorrow9());
  }

  async function save() {
    if (!lead || !title.trim()) return;
    setSaving(true);
    try {
      const res = await createFollowUp({ leadId: lead.id, title: title.trim(), type, dueAt: new Date(due) });
      if (!res.ok) { toast({ variant: "destructive", title: "Couldn't add the follow-up", description: res.message }); return; }
      toast({ title: "Follow-up added" });
      setOpen(false);
      reset();
      router.refresh();
    } catch {
      toast({ variant: "destructive", title: "Couldn't add the follow-up", description: "We couldn't reach the server. Please try again." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Button size="sm" className="gap-1.5" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> New follow-up</Button>
      <Dialog open={open} onOpenChange={(o) => { if (!saving) { setOpen(o); if (!o) reset(); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>New follow-up</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {lead ? (
              <div className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                <span className="font-medium">{lead.name}</span>
                <Button variant="ghost" size="sm" onClick={() => { setLead(null); setQuery(""); }}>Change</Button>
              </div>
            ) : (
              <div className="space-y-1">
                <Input autoFocus placeholder="Search a lead by name, phone or email" aria-label="Lead" value={query} onChange={(e) => setQuery(e.target.value)} />
                {results.length > 0 && (
                  <div className="max-h-48 overflow-y-auto rounded-md border divide-y">
                    {results.map((r) => (
                      <button key={r.id} type="button" className="w-full px-3 py-2 text-left text-sm hover:bg-muted"
                        onClick={() => setLead({ id: r.id, name: r.name })}>
                        {r.name} {r.phone && <span className="text-muted-foreground">· {r.phone}</span>}
                      </button>
                    ))}
                  </div>
                )}
                {query.trim().length >= 2 && results.length === 0 && <p className="text-xs text-muted-foreground">No matching leads.</p>}
              </div>
            )}
            <Input placeholder="What to do, e.g. Call about the quote" aria-label="Title" value={title} maxLength={255} onChange={(e) => setTitle(e.target.value)} />
            <div className="grid grid-cols-2 gap-2">
              <Select value={type} onValueChange={setType}>
                <SelectTrigger aria-label="Type"><SelectValue /></SelectTrigger>
                <SelectContent>{FOLLOW_UP_TYPES.map((t) => <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>)}</SelectContent>
              </Select>
              <Input type="datetime-local" aria-label="Due" value={due} onChange={(e) => setDue(e.target.value)} />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={save} disabled={saving || !lead || !title.trim() || !due}>{saving ? "Adding…" : "Add follow-up"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
