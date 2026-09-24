import { notFound } from "next/navigation";
import { LeadSourceService } from "@/domains/leads/sourceService";
import { PublicLeadForm } from "@/components/PublicLeadForm";
import { resolveFormFields } from "@/lib/leads/formFields";
import { PlanService, limitsFor } from "@/domains/billing/planService";

// Public hosted lead-capture form. `slug` is the lead source id. Embeddable via an <iframe>.
export default async function PublicFormPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const source = await LeadSourceService.getSource(slug);
  if (!source || !source.isActive || !source.organizationId) notFound();
  const { branding } = limitsFor(await PlanService.plan(source.organizationId));

  return (
    <div className="min-h-dvh flex items-center justify-center p-6 bg-muted">
      <div className="w-full max-w-md rounded-2xl border bg-card p-8 shadow-sm">
        <PublicLeadForm sourceId={slug} title={source.name || "Get in touch"} fields={resolveFormFields(source.config)} />
        {branding && (
          // Free-plan forms carry the badge; every visitor who fills one sees Ridhzo (signup is UTM-tagged).
          <a
            href="/signup?utm_source=ridhzo_form&utm_medium=powered_by&utm_campaign=free_form_badge"
            target="_blank"
            rel="noopener"
            className="mt-6 block text-center text-xs text-muted-foreground hover:text-foreground"
          >
            ⚡ Powered by <span className="font-semibold">Ridhzo</span> — free lead CRM for your business
          </a>
        )}
      </div>
    </div>
  );
}
