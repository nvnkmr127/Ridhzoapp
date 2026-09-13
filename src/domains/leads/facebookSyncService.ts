import { LeadSourceService } from "@/domains/leads/sourceService";
import { MetaTokenRefreshService } from "@/domains/leads/metaTokenRefreshService";
import { FacebookLeadMappingService } from "@/domains/leads/facebookLeadMappingService";
import { IngestionService } from "@/lib/leads/ingestion";

export interface FacebookSyncResult {
  totalFetched: number;
  importedCount: number;
  deduplicatedCount: number;
  skippedNoContact: number;
  formsProcessed: number;
  message?: string;
}

// Core of the historical Facebook lead sync. Extracted from the server action so it can run either
// inline (dev / no Redis) or in the background worker (prod). Throws on Graph errors; the caller
// decides how to surface them (auth errors → mark the source needs-reconnect).
export class FacebookSyncService {
  static async run(sourceId: string, organizationId: string): Promise<FacebookSyncResult> {
    const source = await LeadSourceService.getSource(sourceId);
    if (!source || source.organizationId !== organizationId) {
      throw new Error("Source not found");
    }
    if (source.type !== "facebook_lead_ads") {
      throw new Error("Past lead sync is only supported for Facebook Lead Ads.");
    }

    const config = (source.config as Record<string, any>) ?? {};
    const pageId = config.pageId;
    const pageAccessToken = config.pageAccessToken;
    if (!pageId || !pageAccessToken) {
      throw new Error("Missing Facebook Page ID or Access Token in source configuration.");
    }

    const empty = (message: string): FacebookSyncResult => ({
      totalFetched: 0,
      importedCount: 0,
      deduplicatedCount: 0,
      skippedNoContact: 0,
      formsProcessed: 0,
      message,
    });

    const allForms = await MetaTokenRefreshService.listPageLeadForms(pageId, pageAccessToken);
    if (allForms.length === 0) return empty("No lead forms found on this Page.");

    // Restrict to the user-selected forms (empty selection = every form on the Page).
    const rawFilter = config.formFilter;
    const formFilter: string[] = Array.isArray(rawFilter) ? rawFilter.map((s) => String(s)) : [];
    const forms = formFilter.length > 0 ? allForms.filter((f) => formFilter.includes(f.id)) : allForms;
    if (forms.length === 0) return empty("None of the selected forms exist on this Page.");

    let totalFetched = 0;
    let importedCount = 0;
    let deduplicatedCount = 0;
    let skippedNoContact = 0;

    for (const form of forms) {
      const rawLeads = await MetaTokenRefreshService.fetchFormLeads(form.id, pageAccessToken, 100);
      totalFetched += rawLeads.length;

      for (const fbLead of rawLeads) {
        const mapped = FacebookLeadMappingService.mapFacebookLeadToStandardLead(fbLead);
        if (!mapped.email && !mapped.phone) {
          skippedNoContact++;
          continue;
        }

        const res = await IngestionService.processLead({
          name: mapped.name,
          email: mapped.email || undefined,
          phone: mapped.phone || undefined,
          sourceId: source.id,
          organizationId,
          externalId: mapped.facebookLeadgenId || fbLead.id,
          expectedValue: mapped.expectedValue,
          customData: { ...mapped.customData, leadSource: mapped.source, _syncedFromMetaGraph: true },
        });
        if (res.status === "success") importedCount++;
        else if (res.status === "deduplicated") deduplicatedCount++;
      }
    }

    return { totalFetched, importedCount, deduplicatedCount, skippedNoContact, formsProcessed: forms.length };
  }
}
