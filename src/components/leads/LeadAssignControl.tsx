"use client"
import * as React from "react"
import { useRouter } from "next/navigation"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import { listUsersAction } from "@/lib/actions/users"
import { assignLeadAction } from "@/lib/actions/leads"

type User = { id: string; name: string };

export function LeadAssignControl({ leadId, ownerId }: { leadId: string; ownerId: string | null }) {
  const router = useRouter();
  const { toast } = useToast();
  const [users, setUsers] = React.useState<User[]>([]);
  const [value, setValue] = React.useState(ownerId ?? "");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    listUsersAction().then(setUsers).catch(() => {});
  }, []);

  async function assign(next: string) {
    if (next === value) return;
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
      toast({ title: "Lead reassigned" });
      router.refresh();
    } catch {
      setValue(prev);
      toast({ variant: "destructive", title: "Could not reassign", description: "We couldn't reach the server. Please try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Select value={value} onValueChange={assign} disabled={busy}>
      <SelectTrigger className="w-full">
        <SelectValue placeholder="Unassigned" />
      </SelectTrigger>
      <SelectContent>
        {users.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}
