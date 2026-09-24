import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { requireOrg, hasPermission } from "@/lib/rbac";
import { MeetingService } from "@/domains/meetings/service";
import { MeetingLocationsManager } from "@/components/settings/MeetingLocationsManager";
import { MeetingTemplatesForm } from "@/components/settings/MeetingTemplatesForm";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { eq } from "drizzle-orm";

export default async function MeetingSettingsPage() {
  if (!(await hasPermission("settings.manage"))) redirect("/meetings");
  const { organizationId } = await requireOrg();
  const [locations, [org]] = await Promise.all([
    MeetingService.listLocations(organizationId),
    db
      .select({
        whatsappMode: organizations.whatsappMode,
        confirmTemplate: organizations.meetingConfirmTemplate,
        reminderTemplate: organizations.meetingReminderTemplate,
        language: organizations.meetingTemplateLanguage,
      })
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1),
  ]);

  return (
    <div className="flex-1 space-y-6 p-4 pt-4 sm:p-8 sm:pt-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <Link href="/settings"><Button variant="ghost" size="icon" aria-label="Go back"><ArrowLeft className="h-5 w-5" /></Button></Link>
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Meetings</h2>
          <p className="text-sm text-muted-foreground">
            Your stores, offices and branches. Reps pick them in one tap when booking a store visit, and the lead gets the address and map link.
          </p>
        </div>
      </div>
      <h3 className="text-sm font-semibold">Locations</h3>
      <MeetingLocationsManager initial={locations} />
      <MeetingTemplatesForm
        initial={{ confirmTemplate: org?.confirmTemplate ?? null, reminderTemplate: org?.reminderTemplate ?? null, language: org?.language ?? "en_US" }}
        bspMode={org?.whatsappMode === "bsp"}
      />
      <p className="text-xs text-muted-foreground">
        Online meetings: connect Google Calendar in <Link href="/settings/integrations" className="underline">Integrations</Link> to create Meet links and put meetings on your calendar automatically.
      </p>
    </div>
  );
}
