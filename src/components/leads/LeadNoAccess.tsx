import Link from "next/link";
import { Lock, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

// Shown when the lead exists in this workspace but isn't assigned to the viewer (and they aren't an
// admin, or working on it through a meeting or follow-up) — distinct from "not found", so a rep who
// followed a link to a reassigned lead knows why it won't open.
export function LeadNoAccess() {
  return (
    <div className="flex min-h-[60vh] flex-1 flex-col items-center justify-center p-8 text-center">
      <div className="mx-auto max-w-md space-y-4 rounded-2xl border border-border bg-card p-8 shadow-sm">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Lock className="h-6 w-6" />
        </div>
        <div className="space-y-1">
          <h2 className="text-xl font-semibold tracking-tight">You don&apos;t have access to this lead</h2>
          <p className="text-sm text-muted-foreground">
            It&apos;s assigned to someone else. Ask an admin to reassign it to you, or to add you to one of its meetings or
            follow-ups.
          </p>
        </div>
        <div className="pt-2">
          <Button asChild className="gap-2">
            <Link href="/leads">
              <ArrowLeft className="h-4 w-4" /> Back to Leads
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
