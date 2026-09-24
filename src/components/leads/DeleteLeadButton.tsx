"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { deleteLeadAction } from "@/lib/actions/leads";

// Sends a lead to the recycle bin (soft delete). Recoverable there for 30 days.
// Pass open/onOpenChange to drive it from elsewhere (e.g. a "More" menu) — the trigger button is then hidden.
export function DeleteLeadButton({
  leadId,
  leadName,
  open: controlledOpen,
  onOpenChange,
}: {
  leadId: string;
  leadName?: string | null;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false);
  const controlled = controlledOpen !== undefined;
  const open = controlled ? controlledOpen : uncontrolledOpen;
  const setOpen = (o: boolean) => (controlled ? onOpenChange?.(o) : setUncontrolledOpen(o));
  const [busy, setBusy] = React.useState(false);

  async function handleConfirmDelete() {
    setBusy(true);
    try {
      const res = await deleteLeadAction(leadId);
      if (!res.ok) {
        toast({
          variant: "destructive",
          title: "Unable to delete lead",
          description: res.code === "FORBIDDEN"
            ? "You don't have permission to delete leads. Contact an admin."
            : res.message,
        });
        setBusy(false);
        return;
      }
      toast({ title: "Moved to recycle bin", description: "This lead can be restored at any time within 30 days." });
      setOpen(false);
      router.push("/leads");
    } catch {
      toast({
        variant: "destructive",
        title: "Unable to delete lead",
        description: "We couldn't reach the server. Check your connection and try again.",
      });
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!controlled && (
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" className="h-9 gap-1.5 text-destructive hover:text-destructive" aria-label="Delete lead">
            <Trash2 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Delete</span>
          </Button>
        </DialogTrigger>
      )}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Move lead to recycle bin?</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete <span className="font-semibold text-foreground">{leadName || "this lead"}</span>? It will be moved to the recycle bin where it can be restored within 30 days.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:gap-0">
          <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleConfirmDelete} disabled={busy}>
            {busy ? "Deleting..." : "Move to Recycle Bin"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
