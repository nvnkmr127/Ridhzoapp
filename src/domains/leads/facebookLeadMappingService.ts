

export interface FacebookFormField {
  name: string;
  values: string[];
}

export interface FacebookLeadDetails {
  id: string;
  created_time: string;
  form_id: string;
  ad_id?: string;
  ad_name?: string;
  adset_id?: string;
  adset_name?: string;
  campaign_id?: string;
  campaign_name?: string;
  page_id?: string;
  field_data: FacebookFormField[];
}

export interface FacebookFieldMappingRule {
  facebookFieldKey: string;
  targetField: "name" | "email" | "phone" | "expectedValue" | "customData";
  customDataKey?: string;
}

export interface MappedLeadResult {
  name: string;
  email: string | null;
  phone: string | null;
  expectedValue: number | null;
  customData: Record<string, any>;
  source: string;
  facebookLeadgenId: string;
  facebookFormId: string;
}

export class FacebookLeadMappingService {
  /**
   * Default fallback mapping rules for Facebook Lead Ad forms.
   */
  static getDefaultMappingRules(): FacebookFieldMappingRule[] {
    return [
      { facebookFieldKey: "full_name", targetField: "name" },
      { facebookFieldKey: "name", targetField: "name" },
      { facebookFieldKey: "first_name", targetField: "name" },
      { facebookFieldKey: "email", targetField: "email" },
      { facebookFieldKey: "user_email", targetField: "email" },
      { facebookFieldKey: "phone_number", targetField: "phone" },
      { facebookFieldKey: "phone", targetField: "phone" },
      { facebookFieldKey: "budget", targetField: "expectedValue" },
      { facebookFieldKey: "project_budget", targetField: "expectedValue" },
    ];
  }

  /**
   * Maps raw Facebook Graph API `field_data` array to standard Privyr v2 lead structure.
   */
  static mapFacebookLeadToStandardLead(
    facebookLead: FacebookLeadDetails,
    customRules?: FacebookFieldMappingRule[]
  ): MappedLeadResult {
    const rules = customRules && customRules.length > 0 ? customRules : this.getDefaultMappingRules();

    let name = "Facebook Lead";
    let email: string | null = null;
    let phone: string | null = null;
    let expectedValue: number | null = null;
    const customData: Record<string, any> = {};

    // Graph can return a lead node without field_data (deleted lead, restricted fields); never crash.
    const fieldData = Array.isArray(facebookLead.field_data) ? facebookLead.field_data : [];
    const firstNameVal = fieldData.find((f) => f.name === "first_name")?.values[0];
    const lastNameVal = fieldData.find((f) => f.name === "last_name")?.values[0];

    if (firstNameVal || lastNameVal) {
      name = [firstNameVal, lastNameVal].filter(Boolean).join(" ").trim();
    }

    for (const field of fieldData) {
      const val = field.values && field.values.length > 0 ? field.values[0] : "";
      if (!val) continue;

      const matchedRule = rules.find((r) => r.facebookFieldKey.toLowerCase() === field.name.toLowerCase());

      if (matchedRule) {
        if (matchedRule.targetField === "name" && name === "Facebook Lead") {
          name = val;
        } else if (matchedRule.targetField === "email") {
          email = val;
        } else if (matchedRule.targetField === "phone") {
          phone = val;
        } else if (matchedRule.targetField === "expectedValue") {
          const num = Number(val.replace(/[^0-9.]/g, ""));
          if (!isNaN(num) && num > 0) expectedValue = num;
        } else if (matchedRule.targetField === "customData") {
          const key = matchedRule.customDataKey || field.name;
          customData[key] = val;
        }
      } else {
        // Fallback unmapped form questions into customData JSONB
        customData[field.name] = val;
      }
    }

    // Campaign & Meta Ad Attribution
    // The leadgen id is the key Meta's Conversion Leads (CRM postback) uses to attribute a CRM
    // stage change back to the originating ad — persist it so we can report progression later.
    customData["facebook_lead_id"] = facebookLead.id;
    customData["facebook_form_id"] = facebookLead.form_id;
    if (facebookLead.ad_id) customData["meta_ad_id"] = facebookLead.ad_id;
    if (facebookLead.ad_name) customData["meta_ad_name"] = facebookLead.ad_name;
    if (facebookLead.adset_id) customData["meta_adset_id"] = facebookLead.adset_id;
    if (facebookLead.adset_name) customData["meta_adset_name"] = facebookLead.adset_name;
    if (facebookLead.campaign_id) customData["meta_campaign_id"] = facebookLead.campaign_id;
    if (facebookLead.campaign_name) customData["meta_campaign_name"] = facebookLead.campaign_name;
    if (facebookLead.page_id) customData["facebook_page_id"] = facebookLead.page_id;

    return {
      name,
      email,
      phone,
      expectedValue,
      customData,
      source: facebookLead.campaign_name ? `Facebook Ads (${facebookLead.campaign_name})` : "Facebook Lead Ads",
      facebookLeadgenId: facebookLead.id,
      facebookFormId: facebookLead.form_id,
    };
  }

  /**
   * Verifies Facebook Webhook challenge query params (`hub.mode`, `hub.verify_token`, `hub.challenge`).
   */
  static verifyFacebookWebhook(
    hubMode: string | null,
    hubVerifyToken: string | null,
    hubChallenge: string | null,
    expectedVerifyToken: string
  ): { verified: boolean; challenge?: string } {
    if (hubMode === "subscribe" && hubVerifyToken === expectedVerifyToken && hubChallenge) {
      return { verified: true, challenge: hubChallenge };
    }
    return { verified: false };
  }
}
