import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { listTemplates } from "@/lib/actions/messaging";
import { TemplatesManager } from "@/components/templates/TemplatesManager";

export default async function TemplatesPage() {
  const templates = await listTemplates();

  return (
    <div className="flex-1 space-y-6 p-4 pt-4 sm:p-8 sm:pt-6">
      <div className="flex items-center gap-3">
        <Link href="/settings">
          <Button variant="ghost" size="icon" aria-label="Go back"><ArrowLeft className="h-5 w-5" /></Button>
        </Link>
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Message Templates</h2>
          <p className="text-sm text-muted-foreground">Canned messages for one-tap sending and automations. Tokens are filled per lead.</p>
        </div>
      </div>
      <TemplatesManager initialTemplates={templates} />
    </div>
  );
}
