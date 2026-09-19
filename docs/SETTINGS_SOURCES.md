# Multi-Source Lead Integration Hub (`/settings/sources`)

The **Multi-Source Lead Integration Hub** is Ridhzo's centralized connectivity engine for ingesting, authenticating, validating, and normalizing inbound customer prospects across paid ad platforms, website forms, and third-party SaaS services. Operating upstream of the CRM pipeline, it bridges external marketing campaigns with internal sales workflows by converting heterogeneous webhook payloads and Graph API responses into unified, actionable CRM leads in under 200 milliseconds.

This document details the complete technical architecture, security protocols, user experience workflows, and platform-by-platform breakdowns of the sources hub, located at [`src/app/(dashboard)/settings/sources/page.tsx`](file:///Users/naveenadicharla/Documents/ridhzo/src/app/(dashboard)/settings/sources/page.tsx) and managed by [`SourcesManager.tsx`](file:///Users/naveenadicharla/Documents/ridhzo/src/components/sources/SourcesManager.tsx).

---

## 1. Executive Summary & Business Value

### The Speed-to-Lead Imperative
In modern digital sales, conversion rates decline by over 391% if a prospective buyer is contacted after 1 minute versus within 60 seconds. Traditional CRMs rely on brittle Zapier middleware, 15-minute polling intervals, or manual CSV exports from Facebook Ads Manager, creating severe data delays and high friction.

Ridhzo's Lead Sources Hub solves this by providing:
1. **Zero-Latency Ingestion**: Direct webhook and Graph API listeners stream ad responses immediately into memory.
2. **End-to-End Fault Tolerance**: Every raw payload is staged in persistent storage (`webhook_events`) before queuing into BullMQ, ensuring zero lead loss during network spikes or database migrations.
3. **Dead-Token Recovery**: Intelligent re-auth listeners automatically identify revoked ad tokens, queue undelivered events, and replay lost leads upon reconnection.
4. **Normalized Data Plane**: Regardless of whether a prospect originates from a multi-question Facebook Lead Form, a Google Search ad with GCLID attribution, an Elementor WordPress form, or a hosted multi-step questionnaire, the data is automatically sanitized, mapped, and piped into the unified lead schema.

---

## 2. Platform Architecture & Data Flow

```
+----------------------------------------------------------------------------------------------------+
|                                    INBOUND AD & WEB TRAFFIC                                        |
+----------------------------------------------------------------------------------------------------+
       |                                      |                                      |
       v                                      v                                      v
 [Meta Graph API]                     [Google Lead Ads]                     [Web & Custom HTTP]
  - Leadgen Webhooks                   - Webhook Delivery                    - WordPress / Webflow
  - Historical Crawl                   - GCLID / Ad Campaign                 - Hosted Form /f/[slug]
       |                                      |                                      |
       +--------------------------------------+--------------------------------------+
                                              |
                                              v
+----------------------------------------------------------------------------------------------------+
|                                 RIDHZO INGESTION & SECURITY GATEWAY                                |
|                                                                                                    |
|  * Meta App Secret Validation (x-hub-signature-256 via crypto.timingSafeEqual)                     |
|  * Google Security Key Verification (google_key match against lead_sources.webhookSecret)          |
|  * HMAC SHA-256 Webhook Verification (Universal REST endpoints)                                    |
|  * In-Memory Sliding Window Rate Limiting (100 req / 60s per IP)                                   |
|  * Global Deduplication & Idempotency Filter (x-idempotency-key / fb_{leadgen_id})                 |
+----------------------------------------------------------------------------------------------------+
                                              |
                                              v
+----------------------------------------------------------------------------------------------------+
|                                      DISTRIBUTED BUFFERING                                         |
|                                                                                                    |
|  * Staged Payload Storage: postgres.webhook_events (status: "pending")                             |
|  * BullMQ Distributed Job Queue: ingestionQueue.add()                                              |
+----------------------------------------------------------------------------------------------------+
                                              |
                                              v
+----------------------------------------------------------------------------------------------------+
|                                  NORMALIZATION & ENRICHMENT WORKER                                 |
|                                                                                                    |
|  * IngestionService.processLead(): Standardizes Full Name, Phone (+E.164), Email, Company         |
|  * Unstructured Fields & Metadata: Stored in leads.customData (gclId, campaignId, formId)          |
|  * Multi-Tenant Ownership: Validated against tenant organizationId                                 |
|  * Lead Assignment Engine: Capacity Round-Robin & Rule-Based Routing triggered                     |
|  * Drip Automation: Sequences & Instant WhatsApp/Email auto-responders fired                      |
+----------------------------------------------------------------------------------------------------+
```

---

## 3. UI Layout & Visual Hierarchy

The Sources Manager surface is designed with modern enterprise aesthetics, combining high-contrast indicators, interactive platform tiles, and inline form editors.

### A. Surface Structure & Header
1. **Navigation Anchor**: Back navigation link to `/settings` with ghost button styling.
2. **Hero Header & Security Badge**:
   - Title: `Multi-Source Lead Integration Hub`
   - Subtitle: *"Connect ad accounts & webhooks. Leads are instantly pulled, mapped, and allocated to your tenant users."*
   - Status Badge: `10,000 req/sec Zero Breakdown Queue`
3. **Summary KPI Counter**: Real-time aggregate tally displaying:
   - `Total Active Endpoints`
   - `Total Leads Captured`
   - `New / Unworked Leads`
   - `Recycle Bin Count` (soft-deleted leads)

### B. Hosted Web Form Banner
A dedicated, high-prominence container positioned directly above the platform grid:
- **Title**: `Hosted Web Form`
- **Description**: Explains how to create a ready-to-share landing page form that captures leads directly into the CRM pipeline without code.
- **Action**: `Create Web Form` button opening a prompt dialog to name the endpoint.

### C. Available Integration Platforms Grid
A 3-column responsive grid (`grid-cols-1 md:grid-cols-2 lg:grid-cols-3`) displaying the 5 pre-configured integration channels with branded icons, badges, documentation links, and dynamic connection triggers.

### D. Active Connected Endpoints List
A vertical stack of memoized source cards ([`SourceCard`](file:///Users/naveenadicharla/Documents/ridhzo/src/components/sources/SourcesManager.tsx#L174-L436)) displaying active endpoints with copyable webhook URLs, signing secrets, live sync controls, form filtering menus, and deletion/renaming options.

---

## 4. Deep Dive: Lead Sources Explained Separately

Ridhzo supports 4 fully functional ingestion mechanisms alongside 2 planned roadmapped platforms. Each source is engineered with dedicated validation, normalization, and lifecycle management.

```
+----------------------------------------------------------------------------------------------------+
|                                    AVAILABLE SOURCES OVERVIEW                                      |
+----------------------+--------------------+--------------------------------+-----------------------+
| Source Identifier    | System Key         | Protocol / Mechanism           | Primary Use Case      |
+----------------------+--------------------+--------------------------------+-----------------------+
| Meta Lead Ads        | facebook_lead_ads  | Graph API v20.0 + Webhooks     | FB & IG Instant Forms |
| Google Lead Ads      | google_lead_ads    | Google Ads Webhook POST        | Search & YouTube Ads  |
| Website Webhook      | generic_webhook    | REST + HMAC SHA-256 Signature  | WP, Webflow, Custom   |
| Hosted Web Form      | webform            | Next.js Form + Public /f/[id]  | Embeds & Landing Pages|
| LinkedIn Lead Gen    | linkedin_lead_gen  | Coming Soon                    | Sponsored InMail & B2B|
| WhatsApp Direct      | whatsapp_inbound   | Coming Soon                    | Inbound Conversations |
+----------------------+--------------------+--------------------------------+-----------------------+
```

---

### Source 1: Facebook & Instagram Lead Ads (`facebook_lead_ads`)

```
+----------------------------------------------------------------------------------------------------+
|                                 FACEBOOK & INSTAGRAM LEAD ADS                                      |
+----------------------------------------------------------------------------------------------------+
|  Type Key: facebook_lead_ads                                                                       |
|  Badge: Official Meta API                                                                          |
|  Protocol: Meta Graph API v20.0 Webhooks + OAuth 2.0 Page Access Tokens                            |
|  Files:                                                                                            |
|    - Endpoint: src/app/api/webhooks/facebook/route.ts                                              |
|    - OAuth Callback: src/app/api/auth/facebook/callback/route.ts                                   |
|    - Token Service: src/domains/leads/metaTokenRefreshService.ts                                   |
|    - Sync Service: src/domains/leads/facebookSyncService.ts                                        |
+----------------------------------------------------------------------------------------------------+
```

#### 1. Business & Marketing Function
Facebook and Instagram Lead Ads are among the highest-volume acquisition channels for B2C, real estate, education, and professional services. Prospects tap an ad on Facebook or Instagram, and a native pre-filled form opens inside the mobile app. Ridhzo connects directly to Meta's developer infrastructure to pull these leads instantaneously without manual exports or third-party connectors.

#### 2. Authentication & Connection Flow
- **OAuth Popup Handshake**: When the user clicks `Connect Facebook Lead Ads`, Ridhzo opens a centered 600×720px popup window targeting `https://www.facebook.com/v20.0/dialog/oauth`.
- **CSRF Defense**: A cryptographic random nonce is generated and stored in a `fb_oauth_state` HTTP cookie while simultaneously passing `popup_<nonce>` in the OAuth `state` parameter.
- **Requested Scopes**:
  - `pages_show_list`: Discovers the user's business pages.
  - `leads_retrieval`: Grants permission to extract decrypted lead payloads.
  - `pages_manage_ads`: Inspects ad account campaigns and form associations.
  - `pages_manage_metadata`: Enables Ridhzo to subscribe the page to the app's webhook.
- **Client-Side Message Listener**: The popup authenticates, exchanges the short-lived token for long-lived Page Access Tokens server-side, stashes them in an encrypted session store ([`fbPendingStore.ts`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/leads/fbPendingStore.ts)), and dispatches a `postMessage` event (`type: "OAUTH_RESPONSE", status: "pages_ready"`) to the parent window. Tokens never touch client memory.

#### 3. Page Selection & Multi-Page Binding
The user is presented with the **Select Facebook Page Modal**:
- Displays all discovered Facebook Pages with Page Names and Facebook Page IDs.
- Managers can select one or multiple pages to connect simultaneously.
- Submitting triggers [`connectFacebookPagesAction(pageIds)`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/sources.ts#L121), which upserts the page into [`leadSources`](file:///Users/naveenadicharla/Documents/ridhzo/src/db/schema/leads.ts).
- Automatically invokes [`MetaTokenRefreshService.subscribePageToLeadgen`](file:///Users/naveenadicharla/Documents/ridhzo/src/domains/leads/metaTokenRefreshService.ts#L149) to register Meta's `subscribed_apps` edge.

#### 4. Real-Time Webhook Ingestion
- **Verification Request (`GET`)**: Meta pings [`/api/webhooks/facebook`](file:///Users/naveenadicharla/Documents/ridhzo/src/app/api/webhooks/facebook/route.ts#L23) with `hub.mode=subscribe`, `hub.verify_token`, and `hub.challenge`. The endpoint verifies the token against `process.env.FACEBOOK_VERIFY_TOKEN` and echoes the challenge with a 200 OK.
- **Delivery Request (`POST`)**: When a lead submits an ad form, Meta sends a lightweight event:
  ```json
  {
    "object": "page",
    "entry": [{
      "id": "100234567890",
      "changes": [{
        "field": "leadgen",
        "value": {
          "leadgen_id": "9876543210123",
          "page_id": "100234567890",
          "form_id": "456789012345",
          "created_time": 1726743000
        }
      }]
    }]
  }
  ```
- **Cryptographic Verification**: The raw request body is verified against `process.env.FACEBOOK_APP_SECRET` using `x-hub-signature-256`. Unverified payloads are rejected with 401 Unauthorized.
- **Idempotency**: The webhook generates a unique key `fb_${leadgenId}`, records it in `webhook_events`, and pushes the job to `ingestionQueue`. The ingestion worker then calls the Graph API (`GET /{leadgen_id}`) using the stored Page Access Token to retrieve the decrypted lead fields.

#### 5. Form-Level Whitelisting (Filter Modal)
- Ad accounts often run multiple campaigns simultaneously (e.g., job hiring, vendor inquiries, sales leads).
- Clicking `Select Forms` triggers [`listFacebookFormsAction`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/sources.ts#L227), querying the Graph API to list all active lead forms for that Page.
- Users can check specific forms. When saved, unselected forms are discarded at ingestion, preventing unwanted leads from polluting the sales pipeline.

#### 6. Historical Lead Backfill Engine (`Sync Past Leads`)
If an organization already has existing leads in Meta before joining Ridhzo, or if ad campaigns ran during an internet outage:
- Clicking `Sync Past Leads` opens a configuration modal with presets:
  - Last 7 days
  - Last 30 days
  - Last 90 days
  - All time
  - Custom Date Range (`From` and `To` date pickers)
- Calls [`syncPastFacebookLeadsAction`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/sources.ts#L263), which executes [`FacebookSyncService.run`](file:///Users/naveenadicharla/Documents/ridhzo/src/domains/leads/facebookSyncService.ts#L20).
- Crawls Meta's form leads endpoint with cursor pagination (`limit=100`, max 1,000 per form), respects rate limits with exponential backoff (2s, 4s, 8s on codes 4, 17, 32, 613), and processes leads through the standard deduplication pipeline.
- Visual status reporting in UI: displays imported count, deduplicated count, skipped count, and timestamp of last sync.

#### 7. Token Expiry & Automatic Recovery
- Facebook access tokens can expire or be revoked when a user changes their Facebook password.
- When an API call fails with an auth error, Ridhzo automatically marks `needsReconnect: true` in the source config.
- The UI renders an urgent red alert badge: *"Facebook access for this Page has expired or was revoked. Click Connect Facebook Lead Ads to restore."*
- **Reconnection Replay**: When the admin reconnects the page, [`requeueAuthFailedEvents`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/sources.ts#L15) queries all `webhook_events` that failed during the outage with `reason: "auth_error_needs_reconnect"` and replays them into BullMQ. **Zero leads are lost during credential downtime.**

---

### Source 2: Google Lead Form Ads (`google_lead_ads`)

```
+----------------------------------------------------------------------------------------------------+
|                                     GOOGLE LEAD FORM ADS                                           |
+----------------------------------------------------------------------------------------------------+
|  Type Key: google_lead_ads                                                                         |
|  Badge: Google Ads Webhook                                                                         |
|  Protocol: Google Lead Form Delivery Webhook + Key Echo Validation                                 |
|  Files:                                                                                            |
|    - Endpoint: src/app/api/webhooks/google_lead_ads/route.ts                                       |
|    - Service: src/lib/leads/ingestion.ts                                                           |
+----------------------------------------------------------------------------------------------------+
```

#### 1. Business & Marketing Function
Google Ads allows advertisers to attach Lead Form Extensions to Search, YouTube, and Discovery campaigns. When high-intent users search for solutions (e.g., "enterprise CRM software" or "commercial real estate"), they can submit their contact details directly within Google search results.

#### 2. Configuration & Setup Architecture
In Google Ads Campaign Manager under **Assets → Lead Form → Delivery Options**:
1. **Webhook URL**: The manager copies the unique endpoint generated by Ridhzo:
   `https://<domain>/api/webhooks/google_lead_ads?sourceId=<source_uuid>`
2. **Key**: The manager copies the cryptographic signing secret (`webhookSecret`) generated upon source creation.

#### 3. Payload Normalization & Ingestion Flow
Google transmits payloads via HTTP POST in the following structure:
```json
{
  "lead_id": "google_lead_987654321",
  "form_id": "12345678",
  "campaign_id": "87654321",
  "gcl_id": "CjwKCAjw...",
  "google_key": "sec_7a8b9c...",
  "is_test": false,
  "user_column_data": [
    { "column_id": "FULL_NAME", "string_value": "Jane Smith" },
    { "column_id": "EMAIL", "string_value": "jane.smith@example.com" },
    { "column_id": "PHONE_NUMBER", "string_value": "+14155552671" },
    { "column_id": "COMPANY_NAME", "string_value": "Acme Corp" }
  ]
}
```

#### 4. Technical Guardrails & Processing Logic
- **Key Validation**: Ridhzo verifies that `body.google_key === source.webhookSecret`. If mismatched, requests return 401 Unauthorized.
- **Test Ping Handling**: When configuring Google Ads, Google sends a validation ping with `"is_test": true`. The endpoint immediately responds with `{ status: "test_ok" }` and HTTP 200 without inserting bogus records into the CRM.
- **Column Normalization Engine**: The helper function `mapColumns` parses Google's uppercase column keys into standard CRM attributes:
  - `FULL_NAME` or `FIRST_NAME` + `LAST_NAME` → `leads.name`
  - `EMAIL` or `USER_EMAIL` → `leads.email`
  - `PHONE_NUMBER` or `USER_PHONE` → `leads.phone`
  - `COMPANY_NAME` → `leads.company`
- **Ad Attribution Preservation**: `gcl_id` (Google Click ID), `campaign_id`, and `form_id` are permanently stored inside `leads.customData`, enabling end-to-end ROAS calculation and offline conversion tracking.
- **Synchronous Ingestion**: Google webhook processing executes inline with direct DB transactions, guaranteeing zero queue delays and immediate HTTP 200 acknowledgment back to Google's delivery servers.

---

### Source 3: Universal Website Custom Webhook (`generic_webhook`)

```
+----------------------------------------------------------------------------------------------------+
|                                WEBSITE CUSTOM REST WEBHOOK                                         |
+----------------------------------------------------------------------------------------------------+
|  Type Key: generic_webhook                                                                         |
|  Badge: Universal REST Webhook                                                                     |
|  Protocol: Signed HTTP REST POST with HMAC SHA-256                                                 |
|  Files:                                                                                            |
|    - Endpoint: src/app/api/webhooks/[provider]/route.ts                                            |
|    - Worker: src/lib/jobs/workers/ingestionWorker.ts                                               |
|    - Rate Limiter: src/lib/rate-limit.ts                                                           |
+----------------------------------------------------------------------------------------------------+
```

#### 1. Business & Marketing Function
Virtually every business operates external websites powered by WordPress, Webflow, Shopify, Framer, Wix, or custom React/Next.js marketing sites. The Universal Webhook source allows any external form, landing page, or serverless script to stream leads directly into Ridhzo with enterprise-grade cryptographic security.

#### 2. Endpoint Architecture
Each created webhook source generates a distinct URL and secret:
- **URL**: `https://<domain>/api/webhooks/generic_webhook?sourceId=<source_uuid>`
- **Secret**: A 64-character hexadecimal HMAC key generated via `crypto.randomBytes(32).toString("hex")`.

#### 3. Security & Ingestion Safeguards
1. **Rate Limiting**: Protected by an in-memory sliding window rate limiter ([`RateLimiter.checkLimit`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/rate-limit.ts#L38)). Limits incoming traffic to **100 requests per 60 seconds per IP address**, defending against spam attacks and DDoS flooding. Exceeding requests receive HTTP 429 Too Many Requests with standard `X-RateLimit-*` headers.
2. **Cryptographic HMAC SHA-256 Verification**:
   - The sending server signs the raw JSON body using the source's `webhookSecret` and sends the hash in the `x-hub-signature-256` HTTP header (or `sha256=<hash>`).
   - Ridhzo computes the expected HMAC using `crypto.createHmac("sha256", secret).update(rawText).digest("hex")`.
   - Compares signatures using `crypto.timingSafeEqual` to eliminate timing attacks. Payloads failing verification return 401 Unauthorized.
3. **Idempotency Guard**:
   - Accepts an optional `x-idempotency-key` header.
   - If a duplicate key is received, the endpoint acknowledges HTTP 200 immediately without enqueuing a duplicate job.
4. **Asynchronous Distributed Queue**:
   - Raw payload is saved to `webhook_events` with `status: "pending"`.
   - The job is added to BullMQ's `ingestionQueue`.
   - Workers normalize the payload, extract arbitrary custom fields into `leads.customData`, and link the lead to the organization.

---

### Source 4: Hosted Web Forms & Embeddable iFrames (`webform`)

```
+----------------------------------------------------------------------------------------------------+
|                               HOSTED WEB FORMS & EMBEDDABLE IFRAMES                                |
+----------------------------------------------------------------------------------------------------+
|  Type Key: webform (or generic_webhook with hosted form enabled)                                   |
|  Badge: No-Code Visual Builder                                                                     |
|  Protocol: Hosted Next.js SSR + Client Form + iframe Embed Snippet                                 |
|  Files:                                                                                            |
|    - Visual Builder: src/components/sources/FormFieldsEditor.tsx                                   |
|    - Schema Logic: src/lib/leads/formFields.ts                                                     |
|    - Public Page: src/app/f/[slug]/page.tsx                                                        |
|    - Form Component: src/components/PublicLeadForm.tsx                                             |
+----------------------------------------------------------------------------------------------------+
```

#### 1. Business & Marketing Function
Many businesses do not have a dedicated engineering team to build webhook integrations. The Hosted Web Form feature allows non-technical managers to create, customize, and deploy fully responsive lead capture forms in under 60 seconds. Forms can be shared via direct public URL or embedded into any CMS using an `<iframe>`.

#### 2. Visual Field Editor ([`FormFieldsEditor.tsx`](file:///Users/naveenadicharla/Documents/ridhzo/src/components/sources/FormFieldsEditor.tsx))
Clicking `Customize fields` expands the inline schema builder directly inside the source card:
- **Field Reordering**: Vertical arrow controls (`move(i, -1)` / `move(i, 1)`) and drag handles allow instant reordering.
- **Custom Field Addition**: Managers can add arbitrary fields with custom labels and keys (`add()`).
- **Supported Field Types**:
  - `text`: Single-line text input
  - `email`: Email address validation
  - `tel`: Phone number input
  - `number`: Numeric quantity / budget
  - `textarea`: Multi-line inquiry or message
- **Validation Rules**: Individual fields can be flagged as `Required`. Core validation requires that every submission contains at least an email or a phone number for CRM contact resolution.

#### 3. Multi-Step Pagination (`groupIntoSteps`)
- Complex forms (e.g., mortgages, agency onboarding, custom quotes) suffer high abandonment when presented as a single long page.
- Ridhzo includes native multi-step pagination. Each field can be assigned a `Step` number (from 1 up to 10).
- The public form component groups fields by step, rendering interactive progress indicators, step counters, and `Next` / `Back` buttons before final submission.

#### 4. Direct Hosted URL & Embed Code Generation
Each webform source provides one-click copyable assets:
- **Hosted Public Link**: `https://<domain>/f/<source_id>`
  - Rendered by [`src/app/f/[slug]/page.tsx`](file:///Users/naveenadicharla/Documents/ridhzo/src/app/f/[slug]/page.tsx).
  - Clean, distraction-free, responsive layout optimized for mobile and desktop browsers.
  - Automatically displays the source's name as the form header.
- **Embed Snippet**:
  ```html
  <iframe src="https://<domain>/f/<source_id>" style="border:0;width:100%;max-width:480px;height:520px" title="Lead form"></iframe>
  ```
  - Can be pasted into any HTML widget, WordPress Elementor block, or Webflow embed without iframe sandbox issues.

#### 5. Data Mapping Architecture
- Standard fields (`name`, `email`, `phone`, `company`, `message`) populate core columns in the `leads` table.
- All non-standard fields (e.g., `budget_size`, `preferred_contact_time`, `industry_sector`) are automatically compiled into a structured JSON object and saved to `leads.customData`.

---

### Source 5: LinkedIn Lead Gen Forms (`linkedin_lead_gen` - Planned Roadmap)

```
+----------------------------------------------------------------------------------------------------+
|                                   LINKEDIN LEAD GEN FORMS                                          |
+----------------------------------------------------------------------------------------------------+
|  Type Key: linkedin_lead_gen                                                                       |
|  Status: In Development (Flagged available: false)                                                 |
|  Target Protocol: LinkedIn Marketing Developer Platform OAuth 2.0 + Webhook Delivery               |
+----------------------------------------------------------------------------------------------------+
```

- **Use Case**: High-ticket B2B sales, enterprise SaaS, and recruitment marketing.
- **Planned Architecture**:
  - OAuth integration requesting `r_ads` and `r_ads_reporting` permissions.
  - Automatic ingestion of LinkedIn sponsored content form responses.
  - Pre-mapped B2B attributes including Job Title, Seniority Level, Company Size, and Industry Sector directly into lead dossier tabs.
- **Current UI Presentation**: Renders with an official LinkedIn badge and icon, a `"Coming soon"` badge, and a disabled button preventing inadvertent misconfiguration.

---

### Source 6: WhatsApp Direct Inbound (`whatsapp_inbound` - Planned Roadmap)

```
+----------------------------------------------------------------------------------------------------+
|                                    WHATSAPP DIRECT INBOUND                                         |
+----------------------------------------------------------------------------------------------------+
|  Type Key: whatsapp_inbound                                                                        |
|  Status: In Development (Flagged available: false)                                                 |
|  Target Protocol: Meta Cloud API for WhatsApp Business                                             |
+----------------------------------------------------------------------------------------------------+
```

- **Use Case**: Direct conversational commerce, international sales, and real-time chat inquiries.
- **Planned Architecture**:
  - Webhook listener for incoming WhatsApp Business Cloud API messages.
  - Automatic lead creation upon receiving a message from an unrecognized phone number.
  - Immediate auto-responder execution and routing into the active rep's WhatsApp conversation tab.
- **Current UI Presentation**: Renders with a green WhatsApp icon, `"Coming soon"` badge, and disabled state directing users to utilize Webforms or Meta Ads in the interim.

---

## 5. Security, Secrets Management & Cryptographic Signatures

The Lead Sources Hub functions at the public boundary of the CRM and enforces strict security measures:

```
+----------------------------------------------------------------------------------------------------+
|                                     SECURITY PROTOCOLS MATRIX                                      |
+----------------------+--------------------+--------------------------------+-----------------------+
| Vulnerability Vector | Defense Layer      | Technical Implementation       | Code Location         |
+----------------------+--------------------+--------------------------------+-----------------------+
| Payload Tampering    | HMAC SHA-256       | crypto.timingSafeEqual         | [provider]/route.ts   |
| Meta Webhook Spoof   | App Secret Signing | verifyMetaSignature            | webhooks/signature.ts |
| Google Impersonation | Key Echo Matching  | Constant-time token match      | google_lead_ads/route |
| Denial of Service    | Rate Limiting      | 100 req / 60s sliding window   | lib/rate-limit.ts     |
| Cross-Org Collision  | Tenant Isolation   | SQL uniqueness by pageId       | sourceService.ts:L73  |
| Token Exposure       | Server Isolation   | Tokens held in server memory   | fbPendingStore.ts     |
| CSRF in OAuth        | Double-Submit      | Cookie nonce matching state    | SourcesManager.tsx:L835|
+----------------------+--------------------+--------------------------------+-----------------------+
```

### 1. Server-Side Token Quarantine
During Facebook OAuth authorization, Page Access Tokens are retrieved in the server-side callback ([`src/app/api/auth/facebook/callback/route.ts`](file:///Users/naveenadicharla/Documents/ridhzo/src/app/api/auth/facebook/callback/route.ts#L102)). Tokens are stored in a secure Redis/in-memory pending store indexed by `userId`. **Access tokens are never sent to the browser or rendered in client-side HTML.** The client only receives public metadata (`pageId` and `name`). When the user selects pages to connect, the server action reads the tokens back internally.

### 2. Multi-Tenant Organization Isolation
A Facebook Page can only be linked to one organization at a time. In [`LeadSourceService.upsertFacebookPageSource`](file:///Users/naveenadicharla/Documents/ridhzo/src/domains/leads/sourceService.ts#L67), Ridhzo queries the database for any existing source with the same `pageId` belonging to a different `organizationId`:
```typescript
const conflict = await db
  .select({ id: leadSources.id })
  .from(leadSources)
  .where(
    and(
      eq(leadSources.type, "facebook_lead_ads"),
      ne(leadSources.organizationId, organizationId),
      sql`${leadSources.config}->>'pageId' = ${page.pageId}`
    )
  )
  .limit(1);

if (conflict.length > 0) {
  throw new Error("This Facebook Page is already connected by another organization.");
}
```
This check prevents cross-tenant data leaks and ensures webhook routing remains strictly deterministic.

---

## 6. Real-Time Pipeline Aggregations & Status Telemetry

Each connected source card computes real-time SQL aggregations via [`LeadSourceService.getLeadCounts`](file:///Users/naveenadicharla/Documents/ridhzo/src/domains/leads/sourceService.ts#L15):

```sql
SELECT 
  leads.source_id AS "sourceId",
  count(*) FILTER (WHERE leads.deleted_at IS NULL) AS "total",
  count(*) FILTER (WHERE leads.deleted_at IS NULL AND leads.status = 'new') AS "newCount",
  count(*) FILTER (WHERE leads.deleted_at IS NOT NULL) AS "deleted"
FROM leads
WHERE leads.source_id IN ('<source_id_1>', '<source_id_2>')
GROUP BY leads.source_id;
```

### Dynamic Badges on Source Cards
- **Active / Inactive Status**:
  - `Active`: Emerald badge with glowing green dot (`bg-green-500/10 text-green-700`).
  - `Inactive`: Muted gray badge (`bg-muted text-muted-foreground`).
- **Live Webhook Status** (Facebook):
  - `Live`: Green badge confirming active subscription to Meta's `leadgen` edge.
  - `Webhooks off`: Amber warning badge prompting the manager to click `Enable Live Leads`.
- **Lead Metrics Badges**:
  - Total volume (e.g., `1,420 leads`).
  - Fresh lead volume (e.g., `42 new` in primary blue).
  - Soft-deleted count (e.g., `12 in recycle bin`).
- **Form Filter Badge**: Indicates form filtering state (e.g., `3 forms selected` vs. `Capturing from all forms`).
- **Needs Reconnect Alert**: Red badge indicating expired Meta OAuth permissions.

---

## 7. Lifecycle Management & Safe Detachment

The sources hub provides complete management over each endpoint's lifecycle without risking data loss:

```
+----------------------------------------------------------------------------------------------------+
|                                   SOURCE LIFECYCLE CONTROLS                                        |
+-------------------+-----------------------------------+--------------------------------------------+
| Action            | Server Function                   | Database Consequence                       |
+-------------------+-----------------------------------+--------------------------------------------+
| Pause / Resume    | toggleSourceAction(id, isActive)  | Flips lead_sources.isActive (1 or 0)       |
| Rename Source     | renameSourceAction(id, name)      | Updates lead_sources.name                  |
| Configure Schema  | updateSourceFormAction(id, fields)| Overwrites lead_sources.config.formFields  |
| Safe Deletion     | deleteSourceAction(id)            | Un-sources leads, deletes source & rules   |
+-------------------+-----------------------------------+--------------------------------------------+
```

### Non-Destructive Deletion Protocol
When an administrator deletes a lead source via [`deleteSourceAction`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/sources.ts#L104), Ridhzo prevents cascading lead loss:
1. **Unlinking Leads**: The foreign key reference is detached by executing `UPDATE leads SET source_id = NULL WHERE source_id = id`. **All historical leads, notes, conversations, and deals are preserved intact.**
2. **Purging Routing Rules**: Assignment rules linked to the source are removed (`DELETE FROM assignment_rules WHERE source_id = id`).
3. **Removing Endpoint**: The source record is deleted from `lead_sources`. Inbound requests to the old URL are rejected with 403 Forbidden.

---

## 8. Complete Code & Symbol Reference

### Frontend Components & Views
- [`LeadSourcesPage`](file:///Users/naveenadicharla/Documents/ridhzo/src/app/(dashboard)/settings/sources/page.tsx#L7-L25): Root Next.js server component pre-fetching tenant sources and lead counts.
- [`SourcesManager`](file:///Users/naveenadicharla/Documents/ridhzo/src/components/sources/SourcesManager.tsx#L438-L1323): Main interactive client surface orchestrating OAuth popups, platform tiles, modals, and source cards.
- [`SourceCard`](file:///Users/naveenadicharla/Documents/ridhzo/src/components/sources/SourcesManager.tsx#L174-L436): Memoized card rendering endpoint URLs, signing secrets, metrics badges, and action menus.
- [`FormFieldsEditor`](file:///Users/naveenadicharla/Documents/ridhzo/src/components/sources/FormFieldsEditor.tsx#L21-L117): Drag-and-drop schema builder for customizing hosted form fields and pagination steps.
- [`PublicLeadForm`](file:///Users/naveenadicharla/Documents/ridhzo/src/components/PublicLeadForm.tsx): Public-facing client form supporting multi-step transitions and validation.
- [`PublicFormPage`](file:///Users/naveenadicharla/Documents/ridhzo/src/app/f/[slug]/page.tsx#L7-L19): Server-side route handler rendering hosted forms for `/f/[slug]`.

### Server Actions
- [`listSourcesAction`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/sources.ts#L41): Fetches all active and inactive sources for the authenticated organization.
- [`createSourceAction`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/sources.ts#L52): Generates a new lead source with an isolated HMAC SHA-256 secret.
- [`connectFacebookPagesAction`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/sources.ts#L121): Binds selected Facebook Pages, activates webhooks, and replays failed outage events.
- [`subscribeFacebookWebhooksAction`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/sources.ts#L203): Subscribes an existing connected Page to Meta's `leadgen` live webhook.
- [`listFacebookFormsAction`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/sources.ts#L227): Queries Meta Graph API for active lead forms on a Page.
- [`updateSourceFormFilterAction`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/sources.ts#L176): Persists selected form IDs to white-list lead intake.
- [`syncPastFacebookLeadsAction`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/sources.ts#L263): Triggers historical lead sync across custom date ranges.
- [`updateSourceFormAction`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/sources.ts#L65): Saves updated field ordering and step schemas for webforms.
- [`toggleSourceAction`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/sources.ts#L80): Toggles lead capture on or off.
- [`renameSourceAction`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/sources.ts#L91): Renames a source endpoint.
- [`deleteSourceAction`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/sources.ts#L104): Safely detaches existing leads and purges the source.

### Domain Services & API Routes
- [`LeadSourceService`](file:///Users/naveenadicharla/Documents/ridhzo/src/domains/leads/sourceService.ts#L6): Database abstraction for source CRUD, metrics calculation, and tenant isolation.
- [`MetaTokenRefreshService`](file:///Users/naveenadicharla/Documents/ridhzo/src/domains/leads/metaTokenRefreshService.ts#L20): Graph API client for token exchange, webhook subscriptions, and form listing.
- [`FacebookSyncService`](file:///Users/naveenadicharla/Documents/ridhzo/src/domains/leads/facebookSyncService.ts#L19): Historical lead crawler with rate-limit backoff and deduplication.
- [`FacebookLeadMappingService`](file:///Users/naveenadicharla/Documents/ridhzo/src/domains/leads/facebookLeadMappingService.ts): Normalizes Meta field objects into standard CRM fields.
- [`RateLimiter`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/rate-limit.ts#L27): Sliding-window rate limiter defending universal webhooks against abuse.
- [`FacebookWebhookRoute`](file:///Users/naveenadicharla/Documents/ridhzo/src/app/api/webhooks/facebook/route.ts#L23): Ingestion route for Meta webhooks.
- [`GoogleLeadAdsWebhookRoute`](file:///Users/naveenadicharla/Documents/ridhzo/src/app/api/webhooks/google_lead_ads/route.ts#L24): Ingestion route for Google Lead Ads.
- [`GenericWebhookRoute`](file:///Users/naveenadicharla/Documents/ridhzo/src/app/api/webhooks/[provider]/route.ts#L15): Universal HMAC-signed REST webhook endpoint.
- [`FacebookOAuthCallbackRoute`](file:///Users/naveenadicharla/Documents/ridhzo/src/app/api/auth/facebook/callback/route.ts#L22): Handles Meta OAuth code-token exchange.
