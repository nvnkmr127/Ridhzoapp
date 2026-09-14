import { requireOrg } from "@/lib/rbac";
import { AiAssistant } from "@/components/assistant/AiAssistant";

export default async function AssistantPage() {
  await requireOrg(); // gate + tenant context; the agent action re-derives org server-side
  return (
    <div className="flex flex-col h-full p-4 pt-4 sm:p-8 sm:pt-6">
      <div className="mb-4">
        <h2 className="text-3xl font-bold tracking-tight">Assistant</h2>
        <p className="text-sm text-muted-foreground">
          Triage, tag, remind, and draft outreach across your leads. Outbound messages always wait for your approval.
        </p>
      </div>
      <div className="flex-1 min-h-0">
        <AiAssistant />
      </div>
    </div>
  );
}
