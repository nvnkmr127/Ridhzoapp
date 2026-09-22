import { EmptyState } from "@/components/ui/empty-state";
import { Zap, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { getAutomations } from "@/lib/actions/automations";
import { AutomationTemplates } from "@/components/automations/AutomationTemplates";
import { AutomationCard } from "@/components/automations/AutomationCard";

export default async function AutomationsPage() {
  const automations = await getAutomations();

  return (
    <div className="flex-1 space-y-4 p-4 pt-4 sm:p-8 sm:pt-6">
      <div className="flex items-start justify-between space-y-2">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Automations</h2>
          <p className="text-sm text-muted-foreground">
            Instant, one-off reactions to an event — e.g. when a lead comes in, assign it and send a welcome.
            For a multi-day drip of messages, use <Link href="/sequences" className="underline">Sequences</Link> instead.
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Link href="/automations/create">
            <Button>
              <Plus className="mr-2 h-4 w-4" /> Create Automation
            </Button>
          </Link>
        </div>
      </div>
      
      <AutomationTemplates />

      {automations.length === 0 ? (
        <EmptyState
          icon={<Zap className="h-10 w-10" />}
          title="No active automations"
          description="Create workflows to automatically assign leads, send follow-ups, and update statuses."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {automations.map((automation) => (
            <AutomationCard
              key={automation.id}
              id={automation.id}
              name={automation.name}
              isActive={automation.isActive}
            />
          ))}
        </div>
      )}
    </div>
  );
}
