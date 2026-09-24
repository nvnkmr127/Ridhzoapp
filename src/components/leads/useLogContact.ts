"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { logLeadContactAction } from "@/lib/actions/messaging";
import { useToast } from "@/hooks/use-toast";

type LogInput = Omit<Parameters<typeof logLeadContactAction>[0], "leadId">;

// Records an outreach done outside Ridhzo (call / own WhatsApp / own mail app) on the lead, then
// refreshes the page so the timeline, WhatsApp thread and Next Best Action update. Failures are
// surfaced, never silent — an unlogged contact is exactly the bug this exists to fix.
export function useLogContact(leadId: string) {
  const router = useRouter();
  const { toast } = useToast();
  return useCallback(
    async (input: LogInput, successTitle?: string) => {
      try {
        const res = await logLeadContactAction({ leadId, ...input });
        if (!res.ok) {
          toast({ variant: "destructive", title: "Contact not logged", description: res.message });
          return false;
        }
        if (successTitle) toast({ title: successTitle });
        router.refresh();
        return true;
      } catch {
        toast({ variant: "destructive", title: "Contact not logged", description: "We couldn't reach the server. Please try again." });
        return false;
      }
    },
    [leadId, router, toast],
  );
}
