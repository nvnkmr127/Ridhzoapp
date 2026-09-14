import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AutomationBuilder } from "@/components/automations/AutomationBuilder";

export default function CreateAutomationPage() {
  return (
    <div className="flex-1 space-y-4 p-4 pt-4 sm:p-8 sm:pt-6">
      <div className="flex items-center gap-3">
        <Link href="/automations"><Button variant="ghost" size="icon" aria-label="Go back"><ArrowLeft className="h-5 w-5" /></Button></Link>
        <h2 className="text-3xl font-bold tracking-tight">Create Automation</h2>
      </div>
      <AutomationBuilder />
    </div>
  );
}
