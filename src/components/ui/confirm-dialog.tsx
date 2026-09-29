"use client";

import * as React from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export interface ConfirmOptions {
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  destructive?: boolean;
  // Ask for a "why" (3–500 chars) that the caller forwards to the server for the audit log.
  reason?: boolean;
}

// In-app replacement for window.confirm(). `const [confirm, confirmDialog] = useConfirm()`, render
// {confirmDialog} once, then `const r = await confirm({...}); if (!r) return;` — r.reason when asked.
export function useConfirm(): [(opts: ConfirmOptions) => Promise<{ reason?: string } | null>, React.ReactNode] {
  const [opts, setOpts] = React.useState<ConfirmOptions | null>(null);
  const [reason, setReason] = React.useState("");
  const resolver = React.useRef<((v: { reason?: string } | null) => void) | null>(null);

  const confirm = React.useCallback((o: ConfirmOptions) => {
    resolver.current?.(null); // a second prompt cancels any one still open
    setReason("");
    setOpts(o);
    return new Promise<{ reason?: string } | null>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const close = (v: { reason?: string } | null) => {
    resolver.current?.(v);
    resolver.current = null;
    setOpts(null);
  };

  const trimmed = reason.trim();
  const reasonOk = !opts?.reason || (trimmed.length >= 3 && trimmed.length <= 500);

  const dialog = (
    <Dialog open={!!opts} onOpenChange={(open) => !open && close(null)}>
      <DialogContent className="sm:max-w-md">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (reasonOk) close(opts?.reason ? { reason: trimmed } : {});
          }}
          className="space-y-4"
        >
          <DialogHeader>
            <DialogTitle>{opts?.title}</DialogTitle>
            {opts?.description && <DialogDescription>{opts.description}</DialogDescription>}
          </DialogHeader>
          {opts?.reason && (
            <div className="space-y-1.5">
              <Label htmlFor="confirm-reason">Reason (saved to the audit log)</Label>
              <Textarea id="confirm-reason" autoFocus rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => close(null)}>
              Cancel
            </Button>
            <Button type="submit" variant={opts?.destructive ? "destructive" : "default"} disabled={!reasonOk} autoFocus={!opts?.reason}>
              {opts?.confirmLabel ?? "Confirm"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );

  return [confirm, dialog];
}
