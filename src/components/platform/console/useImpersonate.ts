"use client";

import { useRouter } from "next/navigation";
import { useToast } from "@/hooks/use-toast";
import { impersonateOrgAction } from "@/lib/actions/platform";
import type { ConfirmOptions } from "@/components/ui/confirm-dialog";

type Confirm = (opts: ConfirmOptions) => Promise<{ reason?: string } | null>;

// Open a tenant as a super-admin. Read-only goes straight in; write access asks why (audited) first.
export function useImpersonate(setBusy: (id: string | null) => void, confirm: Confirm) {
  const router = useRouter();
  const { toast } = useToast();

  return async function impersonate(orgId: string, redirectPath = "/leads", readOnly = false) {
    let reason: string | undefined;
    if (!readOnly) {
      const ok = await confirm({
        title: "Open this tenant with write access?",
        description: "Anything you change is saved to their workspace. Access ends after 1 hour.",
        confirmLabel: "Open tenant",
        reason: true,
      });
      if (!ok) return;
      reason = ok.reason;
    }
    setBusy(orgId);
    const res = await impersonateOrgAction(orgId, readOnly, reason);
    setBusy(null);
    if (!res.ok) {
      toast({ variant: "destructive", title: "Couldn't open tenant", description: res.message });
      return;
    }
    router.push(redirectPath);
  };
}
