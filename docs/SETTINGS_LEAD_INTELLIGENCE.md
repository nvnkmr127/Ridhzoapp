# Settings: Lead Intelligence (`/settings/lead-intelligence`)

## 1. Executive Summary & Purpose

The **Lead Intelligence** hub configures three server-side automation engines that enrich inbound leads, sync customer email conversations to the CRM activity feed, and optimize digital ad spend:

1. **Lead Enrichment Engine:** Automatically calls an external data provider (Clearbit, Apollo, ZoomInfo, or a proprietary microservice) in the background when leads arrive, storing verified firmographic and demographic facts under an evidence model.
2. **Inbound Email $\rightarrow$ Timeline:** Generates a secure, tokenized webhook URL for email providers (Postmark, Mailgun, Resend, SendGrid) to parse incoming prospect replies, inject them into the lead's activity timeline, stop active automated drip sequences, and classify buyer intent using AI.
3. **Meta Conversions API (CAPI) & Conversion Leads:** Dispatches server-to-server conversion events directly to Meta Graph API v20.0 with SHA-256 hashed customer parameters, as well as CRM status postbacks keyed by Meta `lead_id` (Conversion Leads) to train Meta's ad delivery algorithms on lead quality and won deals.

---

## 2. File & Route Architecture

| Purpose | File Path |
| :--- | :--- |
| **Page Route** | [`src/app/(dashboard)/settings/lead-intelligence/page.tsx`](file:///Users/naveenadicharla/Documents/ridhzo/src/app/(dashboard)/settings/lead-intelligence/page.tsx) |
| **Interactive Manager UI** | [`src/components/settings/LeadIntelligenceManager.tsx`](file:///Users/naveenadicharla/Documents/ridhzo/src/components/settings/LeadIntelligenceManager.tsx) |
| **Server Actions** | [`src/lib/actions/tenantIntegrations.ts`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/tenantIntegrations.ts) |
| **Tenant Integrations Service** | [`src/domains/organizations/tenantIntegrationsService.ts`](file:///Users/naveenadicharla/Documents/ridhzo/src/domains/organizations/tenantIntegrationsService.ts) |
| **Database Schema** | [`src/db/schema/tenantIntegrations.ts`](file:///Users/naveenadicharla/Documents/ridhzo/src/db/schema/tenantIntegrations.ts) |
| **Lead Enrichment Service** | [`src/domains/leads/enrichmentService.ts`](file:///Users/naveenadicharla/Documents/ridhzo/src/domains/leads/enrichmentService.ts) |
| **Enrichment BullMQ Queue & Worker** | [`src/lib/jobs/workers/enrichmentWorker.ts`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/jobs/workers/enrichmentWorker.ts) |
| **Inbound Email Webhook Endpoint** | [`src/app/api/webhooks/email/route.ts`](file:///Users/naveenadicharla/Documents/ridhzo/src/app/api/webhooks/email/route.ts) |
| **Inbound Email Processing Service** | [`src/domains/leads/emailInboundService.ts`](file:///Users/naveenadicharla/Documents/ridhzo/src/domains/leads/emailInboundService.ts) |
| **AI Inbound Intent Classifier** | [`src/domains/leads/inboundIntentService.ts`](file:///Users/naveenadicharla/Documents/ridhzo/src/domains/leads/inboundIntentService.ts) |
| **Meta CAPI Domain Service** | [`src/domains/leads/metaCapiService.ts`](file:///Users/naveenadicharla/Documents/ridhzo/src/domains/leads/metaCapiService.ts) |
| **Meta Graph CAPI Client & Hasher** | [`src/lib/integrations/metaCapi.ts`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/integrations/metaCapi.ts) |
| **Event Bus Triggers** | [`src/lib/events/handlers.ts`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/events/handlers.ts) |

---

## 3. Database Schema (`tenant_integration_settings`)

All organization-specific settings are persisted in PostgreSQL via Drizzle ORM in [`src/db/schema/tenantIntegrations.ts`](file:///Users/naveenadicharla/Documents/ridhzo/src/db/schema/tenantIntegrations.ts):

```typescript
export const tenantIntegrationSettings = pgTable('tenant_integration_settings', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id')
    .references(() => organizations.id, { onDelete: 'cascade' })
    .notNull()
    .unique(),

  // Lead Enrichment
  enrichmentEnabled: integer('enrichment_enabled').default(0).notNull(),
  enrichmentApiUrl: varchar('enrichment_api_url', { length: 500 }),
  enrichmentAuthHeader: varchar('enrichment_auth_header', { length: 100 }), // e.g. "Authorization", "x-api-key"
  enrichmentAuthValueEnc: text('enrichment_auth_value_enc'), // AES-256-GCM encrypted
  enrichmentTimeoutMs: integer('enrichment_timeout_ms'), // 1,000–60,000 ms; default 10,000 ms

  // Inbound Email -> Timeline
  inboundEmailEnabled: integer('inbound_email_enabled').default(0).notNull(),
  inboundEmailToken: varchar('inbound_email_token', { length: 64 }).unique(),

  // Meta Conversions API
  capiEnabled: integer('capi_enabled').default(0).notNull(),
  capiPixelId: varchar('capi_pixel_id', { length: 64 }),
  capiAccessTokenEnc: text('capi_access_token_enc'), // AES-256-GCM encrypted system-user token
  capiTestEventCode: varchar('capi_test_event_code', { length: 64 }),
  capiLeadStageMap: jsonb('capi_lead_stage_map').$type<Record<string, string>>(),

  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
```

---

## 4. Pillar 1: Lead Enrichment Engine

### 4.1 Architecture & Workflow

1. **Trigger:** When a lead is captured, `eventBus.emit('lead.created', { leadId })` fires in [`src/lib/events/handlers.ts`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/events/handlers.ts).
2. **Deduplicated Queue Dispatch:** A job is enqueued to the BullMQ `lead-enrichment` queue:
   ```typescript
   await enrichmentQueue.add(
     `enrich-${p.leadId}`,
     { leadId: p.leadId },
     { jobId: `enrich-${p.leadId}` }
   );
   ```
3. **Asynchronous Background Processing:** In [`src/lib/jobs/workers/enrichmentWorker.ts`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/jobs/workers/enrichmentWorker.ts), the worker processes jobs at concurrency 5 with 3 retries and exponential backoff (5s base). External API delays or provider outages never block the lead ingestion pipeline.
4. **Provider Invocation:** [`EnrichmentService.enrichLead`](file:///Users/naveenadicharla/Documents/ridhzo/src/domains/leads/enrichmentService.ts) decrypts the stored auth credentials and issues a `POST` request with `{ email, company, name }`:
   ```typescript
   const res = await fetch(config.url, {
     method: "POST",
     headers: {
       "content-type": "application/json",
       [config.authHeader]: config.authValue,
     },
     body: JSON.stringify({ email: input.email, company: input.company, name: input.name }),
     signal: AbortSignal.timeout(config.timeoutMs),
   });
   ```

### 4.2 Evidence Discipline Model

Ridhzo treats third-party enrichment data as **observed evidence**, not unvetted truth:
- **Verbatim Evidence Storage:** The entire external response payload is stored in `leads.customData._enrichment`:
  ```json
  {
    "_enrichment": {
      "source": "api.clearbit.com",
      "fetchedAt": "2026-09-19T10:45:00.000Z",
      "attributes": {
        "company": "Acme Corp",
        "employees": 150,
        "linkedin": "https://linkedin.com/company/acme"
      }
    }
  }
  ```
- **Precedence Rule:** In `mergeEnrichment()`, an enriched guess **never overwrites** human-entered data. If `lead.company` is already populated, it is preserved; if `lead.company` was left blank, the enriched company name fills the primary column.
- **Activity Log Entry:** Automatically creates an activity record: `"Lead enriched from api.provider.com."`

---

## 5. Pillar 2: Inbound Email $\rightarrow$ Timeline & Automation Control

### 5.1 Webhook URL Generation & Security

* **URL Format:** `https://app.ridhzo.com/api/webhooks/email?token=<TOKEN>`
* **Token Creation:** Generated using cryptographically secure random bytes:
  ```typescript
  crypto.randomBytes(24).toString("base64url"); // 32 URL-safe characters
  ```
* **Instant Rotation:** Reps or admins can click **Rotate** at any time. [`rotateInboundTokenAction`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/tenantIntegrations.ts) generates a new token and immediately revokes the prior URL.
* **Tenant Isolation:** The webhook endpoint verifies the token against `tenant_integration_settings`. Inbound matching is strictly scoped to the authenticated tenant's `organizationId`.

### 5.2 Universal Provider Ingestion

The webhook endpoint [`src/app/api/webhooks/email/route.ts`](file:///Users/naveenadicharla/Documents/ridhzo/src/app/api/webhooks/email/route.ts) normalizes payload formats across major email service providers:
- **Sender Address (`from`):** Checks `from`, `sender`, `fromEmail`, `From`. Extracts bare email address via regex `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`.
- **Subject Line:** Checks `subject`, `Subject`.
- **Message Body:** Checks `text`, `body`, `plain`, `TextBody`, `stripped-text`.

### 5.3 Downstream Automation & AI Intelligence

When a matching lead is located by sender email:
1. **Activity Insertion:** Records an `email` activity formatted as:
   `[email ← lead] Re: Product Demo: Thanks for reaching out, let's chat tomorrow.` (capped at 2,000 characters).
2. **Automated Sequence Interruption:** Halts any active automated drip sequence to prevent sending robotic follow-ups after the lead has replied:
   ```typescript
   await SequenceService.stopForLead(lead.id, "lead replied by email");
   ```
3. **AI Reply Classification & Intent Tagging:** [`InboundIntentService.classifyAndTag`](file:///Users/naveenadicharla/Documents/ridhzo/src/domains/leads/inboundIntentService.ts) executes an LLM call grounded in the tenant's company context:
   - **System Prompt:** Evaluates intent (`interested`, `not_interested`, `question`, `scheduling`, `other`) and sentiment (`positive`, `neutral`, `negative`).
   - **Note Creation:** Adds a timeline note: `"AI read the reply — intent: interested, sentiment: positive."`
   - **Tag Application:** Attaches tag `intent:interested` or `intent:scheduling`, enabling immediate smart segmentation and rep alerts.

---

## 6. Pillar 3: Meta Conversions API (CAPI) & Conversion Leads

### 6.1 Server-Side Event Dispatching

In [`src/lib/integrations/metaCapi.ts`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/integrations/metaCapi.ts), Ridhzo posts server-to-server events to Meta Graph API v20.0 (`https://graph.facebook.com/v20.0/${pixelId}/events`).

#### Standard CAPI Events:
1. **`Lead` Event:** Triggered on `lead.created`. Normalizes and hashes customer PII using SHA-256 hex:
   - Email: `em` (lowercased and trimmed).
   - Phone: `ph` (digits only, country code retained).
   - First & Last Names: `fn` and `ln` (split and hashed).
   - Deduplication: `event_id: "${lead.id}:Lead"` allows Meta to deduplicate server events against client-side browser Pixel events.
2. **`Purchase` Event:** Triggered on `lead.status_changed` when `newStatus === 'won'`. Includes `custom_data.value` (deal amount) and `custom_data.currency`.

### 6.2 Meta Conversion Leads CRM Postback

For leads generated via **Meta Lead Ads** (`customData.facebook_lead_id` present), Ridhzo posts CRM milestone updates back to Meta under the **Conversion Leads** program:
- **Attribution Identifier:** Uses raw `user_data.lead_id` (the Meta leadgen ID) rather than hashed PII, tying progress directly back to the specific ad and campaign.
- **Source Label:** Identifies `lead_event_source: "Ridhzo"`.
- **Default Stage Mapping:**
  ```json
  {
    "contacted": "contacted",
    "qualified": "qualified",
    "won": "converted"
  }
  ```
- **Custom Mapping UI:** Administrators can define, rename, add, or delete status-to-event mappings in [`LeadIntelligenceManager.tsx`](file:///Users/naveenadicharla/Documents/ridhzo/src/components/settings/LeadIntelligenceManager.tsx) stored in `capi_lead_stage_map`.

### 6.3 Pre-Flight Verification ("Send Test Event")

Administrators can verify CAPI connectivity before activating ad traffic:
1. Enter an optional **Test event code** (from Meta Events Manager $\rightarrow$ Test Events).
2. Click **Send test event**.
3. [`sendTestCapiEventAction`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/tenantIntegrations.ts) triggers [`MetaCapiService.sendTest`](file:///Users/naveenadicharla/Documents/ridhzo/src/domains/leads/metaCapiService.ts), posting a sample `Lead` event (`id: test-<timestamp>`, `email: test@example.com`).
4. Meta's Test Events dashboard immediately displays the parsed event parameters and match quality diagnostic.

---

## 7. Security & Key Management

1. **AES-256-GCM Encryption:** Secret credentials (`enrichmentAuthValueEnc` and `capiAccessTokenEnc`) are encrypted at rest using the tenant master encryption key in [`src/lib/crypto/secret.ts`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/crypto/secret.ts).
2. **Zero Plaintext Leakage:** Masked view objects return boolean flags (`hasEnrichmentAuthValue`, `hasCapiAccessToken`). Input fields show placeholder `••••••••` to prevent client-side exposure.
3. **Leave-Blank-to-Keep Semantics:** Submitting an empty password input retains the existing encrypted secret in the database without requiring re-entry.
4. **Isolated Token Authentication:** The inbound email webhook endpoint rejects any request lacking a valid, active tenant token with HTTP 401.

---

## 8. Summary Checklist for Administrators

- [ ] **Enrichment:** Configure provider endpoint, select header (`Authorization` or `x-api-key`), supply token, and adjust timeout (default 10,000ms).
- [ ] **Inbound Email:** Toggle on, copy secret webhook URL, and configure inbound forwarding / parse webhooks in Postmark, Mailgun, SendGrid, or Resend.
- [ ] **Meta CAPI:** Input Meta Pixel / Dataset ID and System User Access Token.
- [ ] **Meta Conversion Leads:** Review the CRM status-to-event mapping table and confirm stages match Events Manager configuration.
- [ ] **Verify Setup:** Enter Meta Test Event Code and click **Send test event** to confirm 200 OK delivery in Meta Events Manager.
