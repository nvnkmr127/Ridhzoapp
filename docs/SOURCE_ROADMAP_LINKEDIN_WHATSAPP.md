# Lead Sources Roadmap: LinkedIn Lead Gen & WhatsApp Inbound

This document specifies the planned technical architectures, user experience models, and integration roadmaps for the upcoming **LinkedIn Lead Gen Forms** and **WhatsApp Direct Inbound** lead sources in Ridhzo. Both platforms are currently surfaced on the Sources Hub with `"Coming soon"` badges to indicate roadmap alignment.

---

## 1. Platform Overview & Current UI Gating

In [`SourcesManager.tsx`](file:///Users/naveenadicharla/Documents/ridhzo/src/components/sources/SourcesManager.tsx#L114-L138), both platforms are configured with `available: false`:

```typescript
{
  id: "linkedin",
  name: "LinkedIn Lead Gen Forms",
  typeKey: "linkedin_lead_gen",
  available: false,
  description: "Inbound B2B lead sync for LinkedIn sponsored content & lead generation campaigns.",
  icon: LinkedInIcon,
  badge: "B2B Lead Sync",
  buttonText: "Connect LinkedIn Lead Gen",
  docsUrl: "https://www.linkedin.com/help/linkedin/answer/a420556",
},
{
  id: "whatsapp",
  name: "WhatsApp Direct Inbound",
  typeKey: "whatsapp_inbound",
  available: false,
  description: "Capture inbound messages as leads with automated instant reply & round-robin assignment.",
  icon: MessageSquare,
  badge: "WhatsApp Cloud API",
  buttonText: "Connect WhatsApp Business",
  docsUrl: "https://developers.facebook.com/docs/whatsapp/cloud-api",
}
```

### Safety Gate
When an admin clicks either platform button, [`handleConnectPlatform`](file:///Users/naveenadicharla/Documents/ridhzo/src/components/sources/SourcesManager.tsx#L806-L812) halts execution with an explanatory toast notification:
> *"This integration isn't available yet. Use Facebook Lead Ads or a Website Webhook to capture leads today."*

This prevents incomplete source records from entering the database while signaling product direction to prospective buyers.

---

## 2. Source A: LinkedIn Lead Gen Forms (`linkedin_lead_gen`)

```
+----------------------------------------------------------------------------------------------------+
|                                    LINKEDIN INTEGRATION SPEC                                       |
+----------------------------------------------------------------------------------------------------+
|  Type Key: linkedin_lead_gen                                                                       |
|  Badge: B2B Lead Sync                                                                              |
|  Protocol: LinkedIn Marketing Developer Platform OAuth 2.0 + Webhooks                              |
|  Target Documentation: https://www.linkedin.com/help/linkedin/answer/a420556                       |
+----------------------------------------------------------------------------------------------------+
```

### 1. Business & Marketing Function
LinkedIn Lead Gen Forms power enterprise B2B customer acquisition. Prospective decision-makers (VPs, Directors, C-Suite) tap Sponsored Content or InMail ads, and LinkedIn pre-populates their verified corporate identity (work email, job title, company name, industry, and seniority).

### 2. Architectural Blueprint
```
[LinkedIn Sponsored Content Ad] 
              |
              v
[LinkedIn Lead Sync Webhook / Polling Service]
              |
              v
[/api/webhooks/linkedin] (Validates HMAC-SHA256 signature)
              |
              v
[Staged in webhook_events] -> [BullMQ ingestionQueue]
              |
              v
[IngestionService.processLead] -> Standardizes B2B attributes into leads.customData
```

### 3. Required Scopes & Permissions
- `r_ads`: Read-level access to ad accounts and campaigns.
- `r_ads_reporting`: Retrieve campaign names and creative IDs for attribution.
- `rw_ads`: Subscribe to the lead notification webhook.

### 4. Schema Mapping Matrix
```
+--------------------------------+--------------------------------+--------------------------+
| LinkedIn Field ID              | Normalized CRM Column          | Target Location          |
+--------------------------------+--------------------------------+--------------------------+
| firstName + lastName           | leads.name                     | Primary Contact Dossier  |
| emailAddress                   | leads.email                    | Primary Contact Dossier  |
| phoneNumber                    | leads.phone                    | Primary Contact Dossier  |
| companyName                    | leads.company                  | Primary Contact Dossier  |
| jobTitle                       | leads.customData.job_title     | Lead Profile Overview    |
| companySize                    | leads.customData.company_size  | Lead Profile Overview    |
| industry                       | leads.customData.industry      | Lead Profile Overview    |
+--------------------------------+--------------------------------+--------------------------+
```

---

## 3. Source B: WhatsApp Direct Inbound (`whatsapp_inbound`)

```
+----------------------------------------------------------------------------------------------------+
|                                    WHATSAPP INTEGRATION SPEC                                       |
+----------------------------------------------------------------------------------------------------+
|  Type Key: whatsapp_inbound                                                                        |
|  Badge: WhatsApp Cloud API                                                                         |
|  Protocol: Meta Cloud API for WhatsApp Business                                                    |
|  Target Documentation: https://developers.facebook.com/docs/whatsapp/cloud-api                    |
+----------------------------------------------------------------------------------------------------+
```

### 1. Business & Marketing Function
In emerging markets (India, Southeast Asia, Latin America, Middle East) and high-touch consultative sales, WhatsApp is the primary communication channel. Prospects initiate conversations by clicking a "Chat on WhatsApp" button or scanning a QR code on packaging or billboards.

### 2. Architectural Blueprint
```
[Inbound WhatsApp Message from Customer] 
              |
              v
[Meta WhatsApp Cloud API Webhook Listener] 
              |
              v
[/api/webhooks/whatsapp] (GET challenge verification + POST signature validation)
              |
              v
[Contact Resolution Engine]
  - If phone exists: Attaches message to existing lead conversation timeline
  - If phone is new: Creates a new lead with status="new" and source="whatsapp_inbound"
              |
              v
[Instant Automation Execution]
  - Fires WhatsApp Cloud API auto-reply template ("Hi {{name}}, thanks for reaching out...")
  - Routes lead to active on-duty rep via round-robin capacity scheduler
```

### 3. Planned Features
1. **Zero-Click Ingestion**: Any unknown number that sends an inbound message automatically generates a CRM lead record without human intervention.
2. **Instant Auto-Responder**: Uses pre-approved Meta WhatsApp Message Templates to acknowledge the inquiry within 5 seconds.
3. **Seamless Conversation Tab Integration**: Transcripts automatically appear in the active lead's **WhatsApp Tab** inside [`LeadDetailTabs.tsx`](file:///Users/naveenadicharla/Documents/ridhzo/src/components/leads/LeadDetailTabs.tsx), allowing reps to reply directly from the CRM.

---

## 4. Migration & Release Checklist

When engineering begins implementation of either platform:

- [ ] **Database Migration**: Ensure `lead_sources.type` check constraint or enum supports `linkedin_lead_gen` and `whatsapp_inbound`.
- [ ] **Ingestion Workers**: Add normalization adapters in `src/domains/leads/` for LinkedIn and WhatsApp payload formats.
- [ ] **Security Endpoints**:
  - Implement `/api/webhooks/linkedin` with LinkedIn signature verification.
  - Implement `/api/webhooks/whatsapp` with Meta WhatsApp Cloud API verification challenge.
- [ ] **UI Activation**: In [`SourcesManager.tsx`](file:///Users/naveenadicharla/Documents/ridhzo/src/components/sources/SourcesManager.tsx), flip `available: true` on the respective platform card to expose the live connection workflow.
