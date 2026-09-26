"use client"
import * as React from "react"
import { useRouter } from "next/navigation"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"
import { listUsersAction } from "@/lib/actions/users"
import { assignLeadAction } from "@/lib/actions/leads"

type User = { id: string; name: string };

// Assignee picker. Reps only see leads assigned to them, so a rep handing their lead to someone else
// loses access — confirm first and take them back to their list (it used to toast "reassigned" and
// then refresh into a "not found" page).
export function LeadAssignControl({
  leadId,
  ownerId,
  initialUsers,
  currentUserId,
  canSeeAllLeads = true,
}: {
  leadId: string;
  ownerId: string | null;
  initialUsers?: User[];
  currentUserId?: string;
  canSeeAllLeads?: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [users, setUsers] = React.useState<User[]>(initialUsers ?? []);
  const [value, setValue] = React.useState(ownerId ?? "");
  const [busy, setBusy] = React.useState(false);
  const [confirmFor, setConfirmFor] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!initialUsers || initialUsers.length === 0) {
      listUsersAction().then(setUsers).catch(() => {});
    }
  }, [initialUsers]);

  React.useEffect(() => {
    setValue(ownerId ?? "");
  }, [ownerId]);

  const nameOf = (id: string) => users.find((u) => u.id === id)?.name ?? "this teammate";
  const losesAccess = (next: string) => !canSeeAllLeads && !!currentUserId && next !== currentUserId;

  function choose(next: string) {
    if (next === value) return;
    if (losesAccess(next)) setConfirmFor(next);
    else assign(next);
  }

  async function assign(next: string) {
    const prev = value;
    setValue(next);
    setBusy(true);
    try {
      // Owner-only change — omit teamId so the lead keeps its current team (passing null wiped it).
      const res = await assignLeadAction({ leadId, ownerId: next });
      if (!res.ok) {
        setValue(prev);
        toast({ variant: "destructive", title: "Could not reassign", description: res.message });
        return;
      }
      if (losesAccess(next)) {
        toast({ title: `Lead handed to ${nameOf(next)}`, description: "It's now in their list." });
        router.push("/leads");
        return;
      }
      toast({ title: `Assigned to ${nameOf(next)}` });
      router.refresh();
    } catch {
      setValue(prev);
      toast({ variant: "destructive", title: "Could not reassign", description: "We couldn't reach the server. Please try again." });
    } finally {
      setBusy(false);
      setConfirmFor(null);
    }
  }

  const hasMatchingUser = value && users.some((u) => u.id === value);

  return (
    <>
      <Select value={value} onValueChange={choose} disabled={busy}>
        <SelectTrigger className="h-9 w-full" aria-label="Assignee">
          <SelectValue placeholder="Unassigned" />
        </SelectTrigger>
        <SelectContent>
          {value && !hasMatchingUser && <SelectItem value={value}>Assigned team member</SelectItem>}
          {users.map((u) => (
            <SelectItem key={u.id} value={u.id}>
              {u.id === currentUserId ? `${u.name} (you)` : u.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Dialog open={!!confirmFor} onOpenChange={(o) => !o && !busy && setConfirmFor(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Hand this lead to {confirmFor ? nameOf(confirmFor) : "them"}?</DialogTitle>
            <DialogDescription>
              It will move to their lead list and you won&apos;t be able to open it any more. Only an admin can give it back.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setConfirmFor(null)} disabled={busy}>
              Keep it
            </Button>
            <Button onClick={() => confirmFor && assign(confirmFor)} disabled={busy}>
              {busy ? "Handing over…" : "Hand over"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
