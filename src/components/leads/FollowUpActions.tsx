"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { completeFollowUp, snoozeFollowUp, cancelFollowUp, rescheduleFollowUp, assignFollowUp } from "@/lib/actions/follow-ups";

const UNASSIGNED = "__none__";
const toLocalInput = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

// Actions for one pending follow-up: Done up front; snooze, pick a date, reassign and cancel in the menu.
export function FollowUpActions({
  id,
  title,
  dueAt,
  assigneeId,
  users = [],
}: {
  id: string;
  title: string;
  dueAt: Date | string;
  assigneeId: string | null;
  users?: { id: string; name: string }[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = React.useState(false);
  const [dialog, setDialog] = React.useState<null | "date" | "assign">(null);
  const [date, setDate] = React.useState("");
  const [assignee, setAssignee] = React.useState(assigneeId ?? UNASSIGNED);

  async function run(fn: () => Promise<{ ok: boolean; message?: string }>, msg: string) {
    setBusy(true);
    try {
      const result = await fn();
      if (!result.ok) {
        toast({ variant: "destructive", title: "Action failed", description: result.message });
        return false;
      }
      toast({ title: msg });
      router.refresh();
      return true;
    } catch {
      toast({ variant: "destructive", title: "Action failed", description: "We couldn't reach the server. Please try again." });
      return false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-1">
      <Button variant="outline" size="sm" disabled={busy} className="gap-1.5 text-emerald-600"
        onClick={() => run(() => completeFollowUp(id), "Follow-up done")}>
        <Check className="h-3.5 w-3.5" /> Done
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" disabled={busy} aria-label={`More actions for ${title}`}><MoreHorizontal className="h-4 w-4" /></Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => run(() => snoozeFollowUp(id, { days: 1 }), "Moved to tomorrow, 9 AM")}>Snooze to tomorrow</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => run(() => snoozeFollowUp(id, { days: 3 }), "Moved 3 days out, 9 AM")}>Snooze 3 days</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => { setDate(toLocalInput(new Date(dueAt))); setDialog("date"); }}>Pick a date…</DropdownMenuItem>
          {users.length > 0 && <DropdownMenuItem onSelect={() => { setAssignee(assigneeId ?? UNASSIGNED); setDialog("assign"); }}>Assign to…</DropdownMenuItem>}
          <DropdownMenuSeparator />
          <DropdownMenuItem className="text-destructive"
            onSelect={() => { if (confirm(`Cancel "${title}"? It won't remind anyone any more.`)) run(() => cancelFollowUp(id), "Follow-up cancelled"); }}>
            Cancel follow-up
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={dialog !== null} onOpenChange={(o) => !o && !busy && setDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{dialog === "date" ? "Move to…" : "Assign to…"}</DialogTitle></DialogHeader>
          {dialog === "date" ? (
            <Input type="datetime-local" aria-label="New due date and time" value={date} onChange={(e) => setDate(e.target.value)} />
          ) : (
            <Select value={assignee} onValueChange={setAssignee}>
              <SelectTrigger aria-label="Assignee"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={UNASSIGNED}>Nobody (lead owner is reminded)</SelectItem>
                {users.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDialog(null)} disabled={busy}>Cancel</Button>
            <Button disabled={busy || (dialog === "date" && !date)}
              onClick={async () => {
                const done = dialog === "date"
                  ? await run(() => rescheduleFollowUp(id, new Date(date)), "Follow-up moved")
                  : await run(() => assignFollowUp(id, assignee === UNASSIGNED ? null : assignee), "Follow-up reassigned");
                if (done) setDialog(null);
              }}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
