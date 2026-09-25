import { LeadSourceAdapter, NormalizedLeadPayload } from "../types";

export class GenericWebhookAdapter implements LeadSourceAdapter {
  providerName = "generic_webhook";

  async normalize(
    rawPayload: any, 
    sourceId: string, 
    teamId?: string, 
    ownerId?: string
  ): Promise<NormalizedLeadPayload> {
    
    // Guess the common fields. Form builders label them freely ("Email", "your-email", "Phone Number",
    // "Mobile"), so match keys case- and punctuation-insensitively against a few aliases.
    const norm = (k: string) => k.toLowerCase().replace(/[^a-z0-9]/g, "").replace(/^your/, "");
    const byKey = new Map<string, string>();
    for (const k of Object.keys(rawPayload ?? {})) if (!byKey.has(norm(k))) byKey.set(norm(k), k);
    const used = new Set<string>();
    const pick = (...aliases: string[]) => {
      for (const a of aliases) {
        const k = byKey.get(a);
        if (k !== undefined && rawPayload[k] != null && rawPayload[k] !== "") { used.add(k); return String(rawPayload[k]); }
      }
      return undefined;
    };
    const first = pick("firstname", "fname");
    const last = pick("lastname", "lname", "surname");
    const name = pick("name", "fullname") || [first, last].filter(Boolean).join(" ") || "Unknown Lead";
    const email = pick("email", "emailaddress", "mail");
    const phone = pick("phone", "phonenumber", "tel", "telephone", "mobile", "mobilenumber", "whatsapp", "contactnumber");
    const company = pick("company", "organization", "organisation", "companyname", "business", "businessname");
    const externalId = rawPayload.id || rawPayload.leadId || rawPayload.externalId;

    // Everything else gets stuffed into customData
    const customData = { ...rawPayload };
    for (const k of used) delete customData[k];
    delete customData.sourceId; // remove if it was passed in the body
    delete customData.organizationId;

    return {
      name,
      email,
      phone,
      company,
      externalId,
      sourceId,
      teamId,
      ownerId,
      customData,
    };
  }
}
