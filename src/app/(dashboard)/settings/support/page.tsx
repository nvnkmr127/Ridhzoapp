import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { listMySupportTicketsAction } from "@/lib/actions/support";
import { SupportTickets } from "@/components/settings/SupportTickets";

export default async function SupportPage() {
  const tickets = await listMySupportTicketsAction();
  return (
    <div className="flex-1 space-y-6 p-4 pt-4 sm:p-8 sm:pt-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <Link href="/settings"><Button variant="ghost" size="icon" aria-label="Go back"><ArrowLeft className="h-5 w-5" /></Button></Link>
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Help &amp; support</h2>
          <p className="text-sm text-muted-foreground">Ask the Ridhzo team for help. Replies appear here and in your notifications.</p>
        </div>
      </div>
      <SupportTickets initial={tickets} />
    </div>
  );
}
