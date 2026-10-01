# Lead Sources & Capture

Facebook/Google Lead Ads, hosted web forms, website webhook, and source settings.

> Consolidated from 6 source file(s). Content is verbatim; headings are nested two levels deeper under each section. Edit the original files if they still exist, then regenerate.

## Contents

1. [Multi-Source Lead Integration Hub (`/settings/sources`)](#1-multi-source-lead-integration-hub-settingssources) — `docs/SETTINGS_SOURCES.md`
2. [Lead Source Specification: Facebook & Instagram Lead Ads (`facebook_lead_ads`)](#2-lead-source-specification-facebook--instagram-lead-ads-facebook_lead_ads) — `docs/SOURCE_FACEBOOK_LEAD_ADS.md`
3. [Lead Source Specification: Google Lead Form Ads (`google_lead_ads`)](#3-lead-source-specification-google-lead-form-ads-google_lead_ads) — `docs/SOURCE_GOOGLE_LEAD_ADS.md`
4. [Lead Source Specification: Hosted Web Forms & Embeds (`webform`)](#4-lead-source-specification-hosted-web-forms--embeds-webform) — `docs/SOURCE_HOSTED_WEB_FORMS.md`
5. [Lead Source Specification: Website Custom Webhook (`generic_webhook`)](#5-lead-source-specification-website-custom-webhook-generic_webhook) — `docs/SOURCE_WEBSITE_WEBHOOK.md`
6. [Lead Capture & Lead Sources](#6-lead-capture--lead-sources) — `docs/product-kb/04_LEAD_CAPTURE_SOURCES.md`

---

## 1. Multi-Source Lead Integration Hub (`/settings/sources`)

> Source: `docs/SETTINGS_SOURCES.md`

### Multi-Source Lead Integration Hub (`/settings/sources`)

The **Multi-Source Lead Integration Hub** is Ridhzo's centralized connectivity engine for ingesting, authenticating, validating, and normalizing inbound customer prospects across paid ad platforms, website forms, and third-party SaaS services. Operating upstream of the CRM pipeline, it bridges external marketing campaigns with internal sales workflows by converting heterogeneous webhook payloads and Graph API responses into unified, actionable CRM leads in under 200 milliseconds.

This document details the complete technical architecture, security protocols, user experience workflows, and platform-by-platform breakdowns of the sources hub, located at [`src/app/(dashboard)/settings/sources/page.tsx`](file:///Users/naveenadicharla/Documents/ridhzo/src/app/(dashboard)/settings/sources/page.tsx) and managed by [`SourcesManager.tsx`](file:///Users/naveenadicharla/Documents/ridhzo/src/components/sources/SourcesManager.tsx).

---

#### 1. Executive Summary & Business Value

##### The Speed-to-Lead Imperative
In modern digital sales, conversion rates decline by over 391% if a prospective buyer is contacted after 1 minute versus within 60 seconds. Traditional CRMs rely on brittle Zapier middleware, 15-minute polling intervals, or manual CSV exports from Facebook Ads Manager, creating severe data delays and high friction.

Ridhzo's Lead Sources Hub solves this by providing:
1. **Zero-Latency Ingestion**: Direct webhook and Graph API listeners stream ad responses immediately into memory.
2. **End-to-End Fault Tolerance**: Every raw payload is staged in persistent storage (`webhook_events`) before queuing into BullMQ, ensuring zero lead loss during network spikes or database migrations.
3. **Dead-Token Recovery**: Intelligent re-auth listeners automatically identify revoked ad tokens, queue undelivered events, and replay lost leads upon reconnection.
4. **Normalized Data Plane**: Regardless of whether a prospect originates from a multi-question Facebook Lead Form, a Google Search ad with GCLID attribution, an Elementor WordPress form, or a hosted multi-step questionnaire, the data is automatically sanitized, mapped, and piped into the unified lead schema.

---

#### 2. Platform Architecture & Data Flow

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

#### 3. UI Layout & Visual Hierarchy

The Sources Manager surface is designed with modern enterprise aesthetics, combining high-contrast indicators, interactive platform tiles, and inline form editors.

##### A. Surface Structure & Header
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

##### B. Hosted Web Form Banner
A dedicated, high-prominence container positioned directly above the platform grid:
- **Title**: `Hosted Web Form`
- **Description**: Explains how to create a ready-to-share landing page form that captures leads directly into the CRM pipeline without code.
- **Action**: `Create Web Form` button opening a prompt dialog to name the endpoint.

##### C. Available Integration Platforms Grid
A 3-column responsive grid (`grid-cols-1 md:grid-cols-2 lg:grid-cols-3`) displaying the 5 pre-configured integration channels with branded icons, badges, documentation links, and dynamic connection triggers.

##### D. Active Connected Endpoints List
A vertical stack of memoized source cards ([`SourceCard`](file:///Users/naveenadicharla/Documents/ridhzo/src/components/sources/SourcesManager.tsx#L174-L436)) displaying active endpoints with copyable webhook URLs, signing secrets, live sync controls, form filtering menus, and deletion/renaming options.

---

#### 4. Deep Dive: Lead Sources Explained Separately

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

##### Source 1: Facebook & Instagram Lead Ads (`facebook_lead_ads`)

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

###### 1. Business & Marketing Function
Facebook and Instagram Lead Ads are among the highest-volume acquisition channels for B2C, real estate, education, and professional services. Prospects tap an ad on Facebook or Instagram, and a native pre-filled form opens inside the mobile app. Ridhzo connects directly to Meta's developer infrastructure to pull these leads instantaneously without manual exports or third-party connectors.

###### 2. Authentication & Connection Flow
- **OAuth Popup Handshake**: When the user clicks `Connect Facebook Lead Ads`, Ridhzo opens a centered 600×720px popup window targeting `https://www.facebook.com/v20.0/dialog/oauth`.
- **CSRF Defense**: A cryptographic random nonce is generated and stored in a `fb_oauth_state` HTTP cookie while simultaneously passing `popup_<nonce>` in the OAuth `state` parameter.
- **Requested Scopes**:
  - `pages_show_list`: Discovers the user's business pages.
  - `leads_retrieval`: Grants permission to extract decrypted lead payloads.
  - `pages_manage_ads`: Inspects ad account campaigns and form associations.
  - `pages_manage_metadata`: Enables Ridhzo to subscribe the page to the app's webhook.
- **Client-Side Message Listener**: The popup authenticates, exchanges the short-lived token for long-lived Page Access Tokens server-side, stashes them in an encrypted session store ([`fbPendingStore.ts`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/leads/fbPendingStore.ts)), and dispatches a `postMessage` event (`type: "OAUTH_RESPONSE", status: "pages_ready"`) to the parent window. Tokens never touch client memory.

###### 3. Page Selection & Multi-Page Binding
The user is presented with the **Select Facebook Page Modal**:
- Displays all discovered Facebook Pages with Page Names and Facebook Page IDs.
- Managers can select one or multiple pages to connect simultaneously.
- Submitting triggers [`connectFacebookPagesAction(pageIds)`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/sources.ts#L121), which upserts the page into [`leadSources`](file:///Users/naveenadicharla/Documents/ridhzo/src/db/schema/leads.ts).
- Automatically invokes [`MetaTokenRefreshService.subscribePageToLeadgen`](file:///Users/naveenadicharla/Documents/ridhzo/src/domains/leads/metaTokenRefreshService.ts#L149) to register Meta's `subscribed_apps` edge.

###### 4. Real-Time Webhook Ingestion
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

###### 5. Form-Level Whitelisting (Filter Modal)
- Ad accounts often run multiple campaigns simultaneously (e.g., job hiring, vendor inquiries, sales leads).
- Clicking `Select Forms` triggers [`listFacebookFormsAction`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/sources.ts#L227), querying the Graph API to list all active lead forms for that Page.
- Users can check specific forms. When saved, unselected forms are discarded at ingestion, preventing unwanted leads from polluting the sales pipeline.

###### 6. Historical Lead Backfill Engine (`Sync Past Leads`)
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

###### 7. Token Expiry & Automatic Recovery
- Facebook access tokens can expire or be revoked when a user changes their Facebook password.
- When an API call fails with an auth error, Ridhzo automatically marks `needsReconnect: true` in the source config.
- The UI renders an urgent red alert badge: *"Facebook access for this Page has expired or was revoked. Click Connect Facebook Lead Ads to restore."*
- **Reconnection Replay**: When the admin reconnects the page, [`requeueAuthFailedEvents`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/sources.ts#L15) queries all `webhook_events` that failed during the outage with `reason: "auth_error_needs_reconnect"` and replays them into BullMQ. **Zero leads are lost during credential downtime.**

---

##### Source 2: Google Lead Form Ads (`google_lead_ads`)

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

###### 1. Business & Marketing Function
Google Ads allows advertisers to attach Lead Form Extensions to Search, YouTube, and Discovery campaigns. When high-intent users search for solutions (e.g., "enterprise CRM software" or "commercial real estate"), they can submit their contact details directly within Google search results.

###### 2. Configuration & Setup Architecture
In Google Ads Campaign Manager under **Assets → Lead Form → Delivery Options**:
1. **Webhook URL**: The manager copies the unique endpoint generated by Ridhzo:
   `https://<domain>/api/webhooks/google_lead_ads?sourceId=<source_uuid>`
2. **Key**: The manager copies the cryptographic signing secret (`webhookSecret`) generated upon source creation.

###### 3. Payload Normalization & Ingestion Flow
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

###### 4. Technical Guardrails & Processing Logic
- **Key Validation**: Ridhzo verifies that `body.google_key === source.webhookSecret`. If mismatched, requests return 401 Unauthorized.
- **Test Ping Handling**: When configuring Google Ads, Google sends a validation ping with `"is_test": true`. The endpoint immediately responds with `{ status: "test_ok" }` and HTTP 200 without inserting bogus records into the CRM.
- **Column Normalization Engine**: The helper function `mapColumns` parses Google's uppercase column keys into standard CRM attributes:
  - `FULL_NAME` or `FIRST_NAME` + `LAST_NAME` → `leads.name`
  - `EMAIL` or `USER_EMAIL` → `leads.email`
  - `PHONE_NUMBER` or `USER_PHONE` → `leads.phone`
  - `COMPANY_NAME` → `leads.company`
- **Ad Attribution Preservation**: `gcl_id` (Google Click ID), `campaign_id`, and `form_id` are permanently stored inside `leads.customData` (offline conversion upload to Google Ads is not built yet).
- **Synchronous Ingestion**: Google webhook processing executes inline with direct DB transactions, guaranteeing zero queue delays and immediate HTTP 200 acknowledgment back to Google's delivery servers.

---

##### Source 3: Universal Website Custom Webhook (`generic_webhook`)

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

###### 1. Business & Marketing Function
Virtually every business operates external websites powered by WordPress, Webflow, Shopify, Framer, Wix, or custom React/Next.js marketing sites. The Universal Webhook source allows any external form, landing page, or serverless script to stream leads directly into Ridhzo with enterprise-grade cryptographic security.

###### 2. Endpoint Architecture
Each created webhook source generates a distinct URL and secret:
- **URL**: `https://<domain>/api/webhooks/generic_webhook?sourceId=<source_uuid>`
- **Secret**: A 64-character hexadecimal HMAC key generated via `crypto.randomBytes(32).toString("hex")`.

###### 3. Security & Ingestion Safeguards
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

##### Source 4: Hosted Web Forms & Embeddable iFrames (`webform`)

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

###### 1. Business & Marketing Function
Many businesses do not have a dedicated engineering team to build webhook integrations. The Hosted Web Form feature allows non-technical managers to create, customize, and deploy fully responsive lead capture forms in under 60 seconds. Forms can be shared via direct public URL or embedded into any CMS using an `<iframe>`.

###### 2. Visual Field Editor ([`FormFieldsEditor.tsx`](file:///Users/naveenadicharla/Documents/ridhzo/src/components/sources/FormFieldsEditor.tsx))
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

###### 3. Multi-Step Pagination (`groupIntoSteps`)
- Complex forms (e.g., mortgages, agency onboarding, custom quotes) suffer high abandonment when presented as a single long page.
- Ridhzo includes native multi-step pagination. Each field can be assigned a `Step` number (from 1 up to 10).
- The public form component groups fields by step, rendering interactive progress indicators, step counters, and `Next` / `Back` buttons before final submission.

###### 4. Direct Hosted URL & Embed Code Generation
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

###### 5. Data Mapping Architecture
- Standard fields (`name`, `email`, `phone`, `company`, `message`) populate core columns in the `leads` table.
- All non-standard fields (e.g., `budget_size`, `preferred_contact_time`, `industry_sector`) are automatically compiled into a structured JSON object and saved to `leads.customData`.

---

##### Source 5: LinkedIn Lead Gen Forms (`linkedin_lead_gen` - Planned Roadmap)

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

##### Source 6: WhatsApp Direct Inbound (`whatsapp_inbound` - Planned Roadmap)

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

#### 5. Security, Secrets Management & Cryptographic Signatures

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

##### 1. Server-Side Token Quarantine
During Facebook OAuth authorization, Page Access Tokens are retrieved in the server-side callback ([`src/app/api/auth/facebook/callback/route.ts`](file:///Users/naveenadicharla/Documents/ridhzo/src/app/api/auth/facebook/callback/route.ts#L102)). Tokens are stored in a secure Redis/in-memory pending store indexed by `userId`. **Access tokens are never sent to the browser or rendered in client-side HTML.** The client only receives public metadata (`pageId` and `name`). When the user selects pages to connect, the server action reads the tokens back internally.

##### 2. Multi-Tenant Organization Isolation
A Facebook Page may be connected by more than one organization. [`FacebookIngestionService.processEvent`](file:///Users/naveenadicharla/Documents/ridhzo/src/domains/leads/facebookIngestionService.ts) picks one source per organization for the Page and ingests the lead separately into each, using that organization's own token, form filter and field mappings. Leads never cross organizations: each copy is written with that organization's `organizationId` and deduplicated only within it. If one organization's token is dead, the other organizations still receive the lead, and the event stays `failed` so it is replayed when the dead one reconnects (replays dedupe by contact). Deleting a source only unsubscribes the Page from Meta webhooks when no other source still uses it.

---

#### 6. Real-Time Pipeline Aggregations & Status Telemetry

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

##### Dynamic Badges on Source Cards
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

#### 7. Lifecycle Management & Safe Detachment

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

##### Non-Destructive Deletion Protocol
When an administrator deletes a lead source via [`deleteSourceAction`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/sources.ts#L104), Ridhzo prevents cascading lead loss:
1. **Unlinking Leads**: The foreign key reference is detached by executing `UPDATE leads SET source_id = NULL WHERE source_id = id`. **All historical leads, notes, conversations, and deals are preserved intact.**
2. **Purging Routing Rules**: Assignment rules linked to the source are removed (`DELETE FROM assignment_rules WHERE source_id = id`).
3. **Removing Endpoint**: The source record is deleted from `lead_sources`. Inbound requests to the old URL are rejected with 403 Forbidden.

---

#### 8. Complete Code & Symbol Reference

##### Frontend Components & Views
- [`LeadSourcesPage`](file:///Users/naveenadicharla/Documents/ridhzo/src/app/(dashboard)/settings/sources/page.tsx#L7-L25): Root Next.js server component pre-fetching tenant sources and lead counts.
- [`SourcesManager`](file:///Users/naveenadicharla/Documents/ridhzo/src/components/sources/SourcesManager.tsx#L438-L1323): Main interactive client surface orchestrating OAuth popups, platform tiles, modals, and source cards.
- [`SourceCard`](file:///Users/naveenadicharla/Documents/ridhzo/src/components/sources/SourcesManager.tsx#L174-L436): Memoized card rendering endpoint URLs, signing secrets, metrics badges, and action menus.
- [`FormFieldsEditor`](file:///Users/naveenadicharla/Documents/ridhzo/src/components/sources/FormFieldsEditor.tsx#L21-L117): Drag-and-drop schema builder for customizing hosted form fields and pagination steps.
- [`PublicLeadForm`](file:///Users/naveenadicharla/Documents/ridhzo/src/components/PublicLeadForm.tsx): Public-facing client form supporting multi-step transitions and validation.
- [`PublicFormPage`](file:///Users/naveenadicharla/Documents/ridhzo/src/app/f/[slug]/page.tsx#L7-L19): Server-side route handler rendering hosted forms for `/f/[slug]`.

##### Server Actions
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

##### Domain Services & API Routes
- [`LeadSourceService`](file:///Users/naveenadicharla/Documents/ridhzo/src/domains/leads/sourceService.ts#L6): Database abstraction for source CRUD, metrics calculation, and tenant isolation.
- [`MetaTokenRefreshService`](file:///Users/naveenadicharla/Documents/ridhzo/src/domains/leads/metaTokenRefreshService.ts#L20): Graph API client for token exchange, webhook subscriptions, and form listing.
- [`FacebookSyncService`](file:///Users/naveenadicharla/Documents/ridhzo/src/domains/leads/facebookSyncService.ts#L19): Historical lead crawler with rate-limit backoff and deduplication.
- [`FacebookLeadMappingService`](file:///Users/naveenadicharla/Documents/ridhzo/src/domains/leads/facebookLeadMappingService.ts): Normalizes Meta field objects into standard CRM fields.
- [`RateLimiter`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/rate-limit.ts#L27): Sliding-window rate limiter defending universal webhooks against abuse.
- [`FacebookWebhookRoute`](file:///Users/naveenadicharla/Documents/ridhzo/src/app/api/webhooks/facebook/route.ts#L23): Ingestion route for Meta webhooks.
- [`GoogleLeadAdsWebhookRoute`](file:///Users/naveenadicharla/Documents/ridhzo/src/app/api/webhooks/google_lead_ads/route.ts#L24): Ingestion route for Google Lead Ads.
- [`GenericWebhookRoute`](file:///Users/naveenadicharla/Documents/ridhzo/src/app/api/webhooks/[provider]/route.ts#L15): Universal HMAC-signed REST webhook endpoint.
- [`FacebookOAuthCallbackRoute`](file:///Users/naveenadicharla/Documents/ridhzo/src/app/api/auth/facebook/callback/route.ts#L22): Handles Meta OAuth code-token exchange.

---

## 2. Lead Source Specification: Facebook & Instagram Lead Ads (`facebook_lead_ads`)

> Source: `docs/SOURCE_FACEBOOK_LEAD_ADS.md`

### Lead Source Specification: Facebook & Instagram Lead Ads (`facebook_lead_ads`)

The **Facebook & Instagram Lead Ads** integration connects Ridhzo directly to the Meta Graph API v20.0 and Meta Webhook delivery infrastructure. It automates real-time prospect ingestion from Instagram and Facebook Instant Forms, bypassing manual CSV exports or third-party middleware (Zapier/Make), and guarantees zero lead loss during network spikes or credential outages.

---

#### 1. Executive Summary & Business Functionality

- **Channel Focus**: High-velocity B2C and B2B paid advertising across Facebook Feed, Instagram Stories, Reels, and Marketplace.
- **Conversion Mechanism**: Native mobile Instant Forms pre-filled with the user's Facebook profile data (name, email, phone number) submit in two taps.
- **Ridhzo Value**: Ingests leads in under 200ms, executes instant automated WhatsApp/Email sequence assignment, notifies sales reps via push/desktop notifications, and provides deep campaign attribution.

---

#### 2. Technical Architecture & Component Flow

```
+----------------------------------------------------------------------------------------------------+
|                                    META INFRASTRUCTURE                                            |
+----------------------------------------------------------------------------------------------------+
  [User Taps Ad] -> [Submits Meta Instant Form] -> [Meta Webhook Engine: leadgen event]
                                                                |
                                                                v
+----------------------------------------------------------------------------------------------------+
|                                   RIDHZO WEBHOOK RECEIVER                                          |
|                                                                                                    |
|  Endpoint: src/app/api/webhooks/facebook/route.ts                                                  |
|  1. App Secret Validation: verifyMetaSignature(rawText, x-hub-signature-256, appSecret)            |
|  2. Verification Challenge: GET handler responds to hub.challenge & hub.verify_token                |
|  3. Idempotency Check: Keys event as fb_{leadgen_id}                                               |
|  4. Page Ownership Check: hasSourceForPage(pageId)                                                 |
+----------------------------------------------------------------------------------------------------+
                                 |
                                 v
+----------------------------------------------------------------------------------------------------+
|                                      DISTRIBUTED BUFFERING                                         |
|                                                                                                    |
|  1. Raw event stored in postgres.webhook_events (status: "pending")                                |
|  2. Enqueued to BullMQ ingestionQueue ("ingest-lead-facebook")                                     |
+----------------------------------------------------------------------------------------------------+
                                 |
                                 v
+----------------------------------------------------------------------------------------------------+
|                                   DECRYPTION & NORMALIZATION                                       |
|                                                                                                    |
|  Service: src/domains/leads/facebookLeadMappingService.ts                                          |
|  1. Fetches decrypted lead field data via GET https://graph.facebook.com/v20.0/{leadgen_id}        |
|     using Page Access Token stored in source.config.pageAccessToken                                |
|  2. Whitelist Evaluation: Discards lead if source.config.formFilter excludes form_id               |
|  3. Field Normalization: Standardizes Name, Email, Phone (+E.164), and maps extra questions        |
|     into leads.customData                                                                          |
|  4. Ingestion Pipeline: IngestionService.processLead() dedupes and routes to rep                   |
+----------------------------------------------------------------------------------------------------+
```

---

#### 3. End-to-End Authentication & Page Onboarding

##### A. Popup OAuth Handshake
1. User clicks **Connect Facebook Lead Ads** on [`SourcesManager.tsx`](file:///Users/naveenadicharla/Documents/ridhzo/src/components/sources/SourcesManager.tsx#L815).
2. The browser launches a centered 600×720px popup window targeting:
   ```
   https://www.facebook.com/v20.0/dialog/oauth?client_id=<APP_ID>&redirect_uri=<ORIGIN>/api/auth/facebook/callback&scope=pages_show_list,leads_retrieval,pages_manage_ads,pages_manage_metadata&response_type=code&state=popup_<NONCE>
   ```
3. **Double-Submit CSRF Protection**: A random cryptographic nonce is stored in a first-party cookie (`fb_oauth_state`) and passed inside the `state` query param.
4. **Server-Side Token Exchange**:
   - The callback route ([`src/app/api/auth/facebook/callback/route.ts`](file:///Users/naveenadicharla/Documents/ridhzo/src/app/api/auth/facebook/callback/route.ts)) validates the CSRF nonce.
   - Exchanges the authorization code for a short-lived user token.
   - Exchanges the short-lived token for a long-lived user access token (60-day expiry).
   - Queries `GET /v20.0/me/accounts` to retrieve all managed Facebook Pages and their respective **Page Access Tokens**.
   - **Zero Client Exposure**: Tokens are quarantined server-side in [`fbPendingStore.ts`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/leads/fbPendingStore.ts). The client popup receives only the page IDs and names via `window.postMessage`.

##### B. Page Selection Modal
- Discovered pages are rendered in an interactive modal.
- Admins check one or multiple pages and click **Connect Selected Pages**.
- Triggers [`connectFacebookPagesAction(pageIds)`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/sources.ts#L121).

##### C. Webhook Subscription & Multi-Tenant Pages
- **Shared Pages**: several organizations may connect the same `pageId`. Each incoming lead is copied into every connected organization ([`FacebookIngestionService.processEvent`](file:///Users/naveenadicharla/Documents/ridhzo/src/domains/leads/facebookIngestionService.ts)), and the Page is only unsubscribed from `leadgen` when the last source using it is deleted.
- **Subscribed Apps Edge**: Calls `POST /v20.0/{page_id}/subscribed_apps?subscribed_fields=leadgen` via [`MetaTokenRefreshService.subscribePageToLeadgen`](file:///Users/naveenadicharla/Documents/ridhzo/src/domains/leads/metaTokenRefreshService.ts#L149). This instructs Meta to deliver live leads to Ridhzo's webhook endpoint.

---

#### 4. Webhook Handshake & Verification Specifications

##### Webhook Verification (`GET /api/webhooks/facebook`)
Meta validates webhook endpoint ownership by sending:
- `hub.mode = "subscribe"`
- `hub.challenge = "<random_integer_string>"`
- `hub.verify_token = "<configured_secret>"`

Ridhzo verifies that `hub.verify_token` matches `process.env.FACEBOOK_VERIFY_TOKEN` (or fallback tokens) and returns the `hub.challenge` string with HTTP 200.

##### Webhook Delivery & Signature Verification (`POST /api/webhooks/facebook`)
- Meta sends payload headers including `x-hub-signature-256 = "sha256=<hex_hash>"`.
- Ridhzo executes [`verifyMetaSignature`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/webhooks/signature.ts) using HMAC SHA-256 with `process.env.FACEBOOK_APP_SECRET`.
- In production, missing or invalid signatures immediately reject with 401 Unauthorized.
- The webhook responds 200 OK immediately after persisting the event to `webhook_events`, preventing Meta retry floods.

---

#### 5. Form-Level Whitelisting & Lead Filtering

Ad accounts frequently run multi-purpose forms (e.g., job applications, supplier requests, or distinct marketing campaigns):
1. **Form Discovery**: Clicking **Select Forms** triggers [`listFacebookFormsAction`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/sources.ts#L227), querying `GET /v20.0/{page_id}/leadgen_forms`.
2. **Form Filter Selection**: The user selects which form IDs should feed the CRM.
3. **Storage**: Stored in `lead_sources.config.formFilter` (array of form IDs) and `formFilterNames` (ID-to-name mapping).
4. **Enforcement**: If a lead originates from a form not in the filter, it is discarded during worker ingestion without creating an un-targeted lead. If the filter is empty, all forms on the Page are captured.

---

#### 6. Historical Lead Backfill Engine (`Sync Past Leads`)

For newly onboarded ad accounts or campaigns run before CRM integration:
1. **Sync Window Dialog**: Admins select **Last 7 days**, **Last 30 days**, **Last 90 days**, **All time**, or a **Custom Date Range**.
2. **Execution**: Handled by [`FacebookSyncService.run`](file:///Users/naveenadicharla/Documents/ridhzo/src/domains/leads/facebookSyncService.ts#L20).
3. **Cursor Pagination & Rate Limiting**:
   - Queries `GET /v20.0/{form_id}/leads?limit=100&filtering=[{field:'time_created',operator:'GREATER_THAN',value:<since>}]`.
   - Traverses cursor pages up to 1,000 leads per form.
   - Built-in exponential backoff (2s, 4s, 8s) on Meta rate limit codes `4`, `17`, `32`, and `613`.
4. **Deduplication**: Passes leads through [`IngestionService.processLead`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/leads/ingestion.ts), deduplicating on `email`, `phone`, or Meta `externalId` (`fb_<leadgen_id>`).
5. **Reporting**: Displays imported count, deduplicated count, skipped count (lacking contact info), and exact per-form stats.

---

#### 7. Token Expiry & Automatic Outage Recovery

1. **Dead Token Detection**: If Meta revokes permissions or user credentials change, API calls throw an auth error.
2. **Flagging**: The source is flagged with `needsReconnect: true`. The UI displays a persistent red badge: *"Facebook access for this Page has expired or was revoked. Click Connect Facebook Lead Ads to restore."*
3. **Event Stashing During Downtime**: Inbound live webhook notifications continue to be received and saved to `webhook_events` with `status: "failed"` and `reason: "auth_error_needs_reconnect"`.
4. **Automated Replay**: When the admin re-authenticates the Page, [`requeueAuthFailedEvents`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/sources.ts#L15) queries all failed events for that `page_id`, resets their status to `pending`, and reenqueues them into BullMQ. **No leads are lost during credential downtime.**

---

#### 8. Code & Symbol Reference

- [`SourcesManager.tsx`](file:///Users/naveenadicharla/Documents/ridhzo/src/components/sources/SourcesManager.tsx): Renders source card, OAuth popup listener, form selection modal, and past sync dialog.
- [`connectFacebookPagesAction`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/sources.ts#L121): Server action binding Facebook Pages to the organization.
- [`subscribeFacebookWebhooksAction`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/sources.ts#L203): Server action subscribing pages to live webhooks.
- [`listFacebookFormsAction`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/sources.ts#L227): Fetches active lead forms via Graph API.
- [`syncPastFacebookLeadsAction`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/sources.ts#L263): Backfills historical leads across time windows.
- [`MetaTokenRefreshService`](file:///Users/naveenadicharla/Documents/ridhzo/src/domains/leads/metaTokenRefreshService.ts): Low-level HTTP client for Graph API tokens, forms, and webhooks.
- [`FacebookSyncService`](file:///Users/naveenadicharla/Documents/ridhzo/src/domains/leads/facebookSyncService.ts): Historical crawl coordinator with rate-limit recovery.
- [`FacebookLeadMappingService`](file:///Users/naveenadicharla/Documents/ridhzo/src/domains/leads/facebookLeadMappingService.ts): Parses Meta question/answer field arrays into CRM columns.
- [`/api/webhooks/facebook/route.ts`](file:///Users/naveenadicharla/Documents/ridhzo/src/app/api/webhooks/facebook/route.ts): Public webhook listener validating signatures and staging events.
- [`/api/auth/facebook/callback/route.ts`](file:///Users/naveenadicharla/Documents/ridhzo/src/app/api/auth/facebook/callback/route.ts): OAuth redirect target executing token exchange.

---

## 3. Lead Source Specification: Google Lead Form Ads (`google_lead_ads`)

> Source: `docs/SOURCE_GOOGLE_LEAD_ADS.md`

### Lead Source Specification: Google Lead Form Ads (`google_lead_ads`)

The **Google Lead Form Ads** integration connects Ridhzo directly to Google Ads Lead Form Assets. When prospects search on Google or view video campaigns on YouTube, they can submit their contact details directly within the search results or ad overlay. Ridhzo captures, authenticates, and ingests these leads synchronously in real time while preserving critical marketing attribution (including GCLID and Campaign ID).

---

#### 1. Executive Summary & Business Functionality

- **Channel Focus**: High-intent Google Search, Performance Max, Display, and YouTube Video ad campaigns.
- **Conversion Mechanism**: Google's native Lead Form extension appears beneath the ad headline. Users submit without leaving the Google search results page or YouTube video player.
- **Ridhzo Value**: Ingests leads immediately, verifies the shared key Google echoes in each payload, maps Google's uppercase column keys into standard CRM fields, and stores GCLID (Google Click ID) and campaign/form IDs on the lead. (Uploading conversions back to Google Ads is **not** built yet.)

---

#### 2. Technical Architecture & Ingestion Pipeline

```
+----------------------------------------------------------------------------------------------------+
|                                    GOOGLE ADS INFRASTRUCTURE                                       |
+----------------------------------------------------------------------------------------------------+
  [User Submits Google Lead Form] -> [Google Lead Form Webhook Delivery Engine]
                                                |
                                                v  HTTP POST (JSON)
+----------------------------------------------------------------------------------------------------+
|                                   RIDHZO GOOGLE WEBHOOK RECEIVER                                   |
|                                                                                                    |
|  Endpoint: src/app/api/webhooks/google_lead_ads/route.ts                                           |
|                                                                                                    |
|  1. UUID Syntax Guard: Rejects non-UUID sourceId query params with 400 Bad Request                 |
|  2. Source Lookup: Validates active status and organizationId via LeadSourceService.getSource()    |
|  3. Google Key Echo Validation: body.google_key must equal the secret (no secret = rejected)      |
|  4. Test Ping Detection: If body.is_test === true, returns 200 { status: "test_ok" }               |
|  5. Column Normalization: Transforms user_column_data into standard CRM attributes                 |
|  6. Attribution Extraction: Captures gcl_id, campaign_id, and form_id                              |
+----------------------------------------------------------------------------------------------------+
                                                |
                                                v  Synchronous Execution
+----------------------------------------------------------------------------------------------------+
|                                   CRM INGESTION & PIPELINE ROUTING                                 |
|                                                                                                    |
|  Service: src/lib/leads/ingestion.ts (IngestionService.processLead)                                |
|  - Deduplication: Matches existing leads by Email or Phone. Retried deliveries are skipped by Google `lead_id` (recorded in `webhook_events`); a repeat submission from a known contact adds a note to the lead                |
|  - Custom Data Payload: Stores full user_column_data, gclId, campaignId, and formId                |
|  - Assignment Engine: Triggers round-robin rep distribution and auto-response sequences           |
+----------------------------------------------------------------------------------------------------+
```

---

#### 3. Step-by-Step Google Ads Setup & Webhook Delivery

To activate lead delivery from Google Ads into Ridhzo:

1. **Create the Source in Ridhzo**:
   - Navigate to `/settings/sources`.
   - Under **Available Integration Platforms**, click **Connect Google Lead Ads**.
   - Ridhzo creates an active source record and generates a 64-character signing secret.
2. **Copy Delivery Credentials**:
   - **Instant Webhook Endpoint URL**:
     `https://<your-domain>/api/webhooks/google_lead_ads?sourceId=<SOURCE_UUID>`
   - **Key / Secret**:
     `<webhookSecret>` (e.g., `4f9a8b1c2d3e...`)
3. **Configure Google Ads Campaign Manager**:
   - In your Google Ads dashboard, navigate to **Ads & assets → Assets → Lead form**.
   - Create or edit a lead form asset.
   - Open **Lead delivery** and choose **Webhook integration** (Google occasionally renames this option).
   - Paste the **Webhook URL** into the *Webhook URL* field.
   - Paste the Ridhzo **Signing Secret** into the *Key* field.
   - Click **Send test data**.
   - Google Ads displays an immediate green verification checkmark: *"Test data successfully sent"*.
   - Save the asset. All live submissions will now stream directly into Ridhzo.

---

#### 4. Webhook Payload Specifications & Normalization

##### Raw Google Payload Example
Google delivers lead data via HTTP POST with the following JSON structure:
```json
{
  "lead_id": "google_lead_8723910293",
  "user_column_data": [
    { "column_id": "FULL_NAME", "string_value": "Alex Johnson" },
    { "column_id": "EMAIL", "string_value": "alex.johnson@enterprise.com" },
    { "column_id": "PHONE_NUMBER", "string_value": "+14155550199" },
    { "column_id": "COMPANY_NAME", "string_value": "Nexus Global" },
    { "column_id": "POSTAL_CODE", "string_value": "94105" }
  ],
  "api_version": "1.0",
  "form_id": "492019283",
  "campaign_id": "192837465",
  "google_key": "4f9a8b1c2d3e...",
  "is_test": false,
  "gcl_id": "CjwKCAjw...EiwA_..."
}
```

##### Column Mapping Engine ([`mapColumns`](file:///Users/naveenadicharla/Documents/ridhzo/src/app/api/webhooks/google_lead_ads/route.ts#L13-L22))
Google formats user responses as an array of objects containing string column IDs. Ridhzo iterates through `user_column_data` and normalizes the fields:

```typescript
function mapColumns(userColumnData: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (Array.isArray(userColumnData)) {
    for (const c of userColumnData) {
      const id = (c as any)?.column_id;
      if (id) out[String(id).toUpperCase()] = String((c as any)?.string_value ?? "");
    }
  }
  return out;
}
```

##### Lead Attribute Synthesis
- **Full Name**: Derived from `cols.FULL_NAME` or combined from `[cols.FIRST_NAME, cols.LAST_NAME]`. If neither exists, defaults to `"Google Lead"`.
- **Email**: Derived from `cols.EMAIL` or `cols.USER_EMAIL`.
- **Phone**: Derived from `cols.PHONE_NUMBER` or `cols.USER_PHONE`.
- **Company**: Derived from `cols.COMPANY_NAME`.
- **Validation Guard**: Requires at least one contact channel (`email` or `phone`). If both are missing, the endpoint rejects with HTTP 422 Unprocessable Entity.

---

#### 5. Security, Test Pings & Attribution Preservation

##### 1. Key Echo Authentication
Google does not use HMAC request signatures; instead, it echoes the configured secret inside the payload body as `google_key`. Ridhzo performs an exact equality check:
```typescript
if (!secret || key !== secret /* constant-time */) {
  return NextResponse.json({ error: "Invalid key" }, { status: 401 });
}
```
A source with no secret rejects everything. Requests are also rate limited (100/min per source+IP) and capped at 256 KB. Wrong keys get 401 before any lead data is touched.

##### 2. Test Ping Handling
When saving a webhook in Google Ads, Google dispatches a mock payload with `"is_test": true`. Ridhzo detects this flag and returns HTTP 200 with `{ status: "test_ok" }`:
```typescript
if ((body as any).is_test) return NextResponse.json({ status: "test_ok" }, { status: 200 });
```
The time of the last test is saved so the source card can show "Test received". Test pings never enter reps' queues.

##### 3. Google Click ID (GCLID) Attribution
The `gcl_id` query parameter is Google's primary tracking token for ad interactions. Ridhzo permanently persists:
- `formId`: Google Lead Form ID
- `campaignId`: Google Ads Campaign ID
- `gclId`: Google Click ID
- `fields`: Raw column array

These values are saved to `leads.customData`, so sales can see which campaign and form produced a lead. The first submission's attribution is kept when the same contact submits again. Offline conversion upload to Google Ads is not implemented.

---

##### 4. Failures and retries
Every delivery is logged in `webhook_events` (ids only, no personal data). Failures (no email/phone, ingestion error) are counted in the "failed to import in the last 7 days" warning on the source card, and Google's retry of the same `lead_id` is re-processed until it succeeds. Missed leads from before setup must be exported from Google Ads as CSV and imported.

#### 6. Code & Symbol Reference

- [`/api/webhooks/google_lead_ads/route.ts`](file:///Users/naveenadicharla/Documents/ridhzo/src/app/api/webhooks/google_lead_ads/route.ts): Route handler executing key validation, test ping response, and column normalization.
- [`LeadSourceService.getSource`](file:///Users/naveenadicharla/Documents/ridhzo/src/domains/leads/sourceService.ts#L36): Validates tenant ownership and retrieves the source's `webhookSecret`.
- [`IngestionService.processLead`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/leads/ingestion.ts): Standardizes CRM fields, enforces tenant isolation, and deduplicates contacts.
- [`SourcesManager.tsx`](file:///Users/naveenadicharla/Documents/ridhzo/src/components/sources/SourcesManager.tsx): Renders the Google Lead Ads platform card, generates webhook endpoints, and displays lead telemetry.

---

## 4. Lead Source Specification: Hosted Web Forms & Embeds (`webform`)

> Source: `docs/SOURCE_HOSTED_WEB_FORMS.md`

### Lead Source Specification: Hosted Web Forms & Embeds (`webform`)

The **Hosted Web Forms & Embeddable iFrames** feature provides a complete no-code lead capture solution built directly into Ridhzo. It enables non-technical sales and marketing managers to design, customize, and publish multi-step lead capture forms in under a minute without writing code or provisioning hosting infrastructure.

---

#### 1. Executive Summary & Business Functionality

- **Channel Focus**: Inbound landing page traffic, direct social bio links, client intake forms, and embedded website contact widgets.
- **Delivery Mechanism**: Available as both a standalone public webpage (`https://<domain>/f/[slug]`) and a responsive `<iframe>` embed code.
- **Ridhzo Value**: Eliminates the need for expensive third-party form builders (Typeform, JotForm, Wufoo). Offers visual drag-and-drop field builders, multi-step pagination (up to 10 steps), automated CRM schema mapping, and zero-latency lead insertion.

---

#### 2. Technical Architecture & Component Flow

```
+----------------------------------------------------------------------------------------------------+
|                                      CRM ADMIN DASHBOARD                                           |
+----------------------------------------------------------------------------------------------------+
  Admin accesses: /settings/sources -> clicks "Create Web Form" or "Customize fields"
                                    |
                                    v
+----------------------------------------------------------------------------------------------------+
|                                    VISUAL FIELD BUILDER                                            |
|                                                                                                    |
|  Component: src/components/sources/FormFieldsEditor.tsx                                            |
|  Schema Engine: src/lib/leads/formFields.ts                                                        |
|                                                                                                    |
|  - Field Management: Add, delete, and reorder fields (move up/down)                                |
|  - Field Types: text, email, tel, number, textarea                                                 |
|  - Step Pagination: Group fields across 1 to 10 discrete steps                                     |
|  - Server Action: updateSourceFormAction(sourceId, fields) sanitizes and persists schema            |
|    into lead_sources.config.formFields                                                             |
+----------------------------------------------------------------------------------------------------+
                                    |
                                    v
+----------------------------------------------------------------------------------------------------+
|                                     PUBLIC DEPLOYMENT MODES                                        |
+-----------------------------------+----------------------------------------------------------------+
| Mode A: Hosted Landing Page       | Mode B: Embeddable iFrame                                      |
| URL: https://<domain>/f/<slug>    | Snippet: <iframe src="https://<domain>/f/<slug>" ...></iframe> |
| SSR Page: src/app/f/[slug]/page.ts| Embedded in WordPress, Webflow, Squarespace, or Shopify        |
+-----------------------------------+----------------------------------------------------------------+
                                    |
                                    v
+----------------------------------------------------------------------------------------------------+
|                                    SUBMISSION & DATA MAPPING                                       |
|                                                                                                    |
|  Component: src/components/PublicLeadForm.tsx                                                      |
|                                                                                                    |
|  1. Contact Validation: Requires at least an Email or Phone number to resolve deduplication         |
|  2. Core Lead Columns: Name, Email, Phone, Company, and Message map directly to `leads` table      |
|  3. Custom Field Preservation: Unmapped fields are compiled into JSON and saved to leads.customData|
|  4. Automation Trigger: Round-robin distribution and instant lead welcome sequences fired          |
+----------------------------------------------------------------------------------------------------+
```

---

#### 3. Visual Field Editor ([`FormFieldsEditor.tsx`](file:///Users/naveenadicharla/Documents/ridhzo/src/components/sources/FormFieldsEditor.tsx))

Clicking **Customize fields** on any webform source expands the inline visual schema builder:

```
+----------------------------------------------------------------------------------------------------+
|                                     INLINE SCHEMA EDITOR UI                                        |
+----------------------------------------------------------------------------------------------------+
|  [::]  [ Full Name        ]  [ Type: text     v ]  [x] Required  [ Step: 1 ]  [^]  [v]  [Trash]   |
|  [::]  [ Business Email   ]  [ Type: email    v ]  [x] Required  [ Step: 1 ]  [^]  [v]  [Trash]   |
|  [::]  [ Phone Number     ]  [ Type: tel      v ]  [ ] Required  [ Step: 1 ]  [^]  [v]  [Trash]   |
|  [::]  [ Company Size     ]  [ Type: number   v ]  [ ] Required  [ Step: 2 ]  [^]  [v]  [Trash]   |
|  [::]  [ Project Scope    ]  [ Type: textarea v ]  [ ] Required  [ Step: 2 ]  [^]  [v]  [Trash]   |
+----------------------------------------------------------------------------------------------------+
|  [ + Add field ]                                                       [ Save form fields ]        |
+----------------------------------------------------------------------------------------------------+
```

##### 1. Field Operations & Controls
- **Reordering**: Move fields up or down using the arrow buttons (`move(i, -1)` / `move(i, 1)`).
- **Label Editing**: Direct text input updates the question displayed to respondents.
- **Field Type Selection**:
  - `text`: Single-line text for names, job titles, or addresses.
  - `email`: Enforces standard email syntax validation.
  - `tel`: Formats and validates phone numbers.
  - `number`: Numeric constraints for team sizes, budgets, or quantities.
  - `textarea`: Multi-line expandable box for messages or project requirements.
- **Required Checkbox**: Toggles client-side and server-side mandatory validation.
- **Step Assignment**: Assigns the field to a specific pagination page (`1` to `MAX_STEPS = 10`).

##### 2. Schema Sanitization ([`sanitizeFields`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/leads/formFields.ts))
Before saving, Ridhzo cleans the schema:
- Removes dangerous characters and strips non-printable control codes.
- Generates snake_case machine keys for custom fields (e.g., `"Budget Estimate"` → `"budget_estimate"`).
- Locks standard keys (`name`, `email`, `phone`, `company`) so their core database bindings cannot be corrupted.

---

#### 4. Multi-Step Form Pagination (`groupIntoSteps`)

Long single-page forms suffer from high abandonment rates. Ridhzo provides native multi-step pagination:

1. **Automatic Grouping**: The helper function `groupIntoSteps(fields)` organizes fields into sequential step buckets based on their `step` integer.
2. **Interactive Stepper UI**:
   - The public form displays progress indicators: `Step 1 of 3: Contact Info`, `Step 2 of 3: Requirements`.
   - Respondents navigate forward with `Next` and backward with `Back`.
   - Form state is retained in client memory between steps.
3. **Step-Level Validation**: Users cannot advance to the next step until all required fields in the current step pass validation checks.

---

#### 5. Deployment Options: Hosted Link vs. iFrame Embed

##### Option A: Standalone Public Landing Page
- **URL Format**: `https://<your-domain>/f/<SOURCE_UUID>`
- **Server Component**: [`src/app/f/[slug]/page.tsx`](file:///Users/naveenadicharla/Documents/ridhzo/src/app/f/[slug]/page.tsx)
- **Features**:
  - Server-side renders the form card centered on a responsive background.
  - Displays the source's name as the page title (e.g., *"Schedule an Enterprise Demo"*).
  - Fast page loads with zero external analytics tracker bloat.
  - Perfect for sharing in email signatures, WhatsApp messages, LinkedIn bios, or QR codes.

##### Option B: Embeddable iFrame
- One-click copyable embed code:
  ```html
  <iframe 
    src="https://<your-domain>/f/<SOURCE_UUID>" 
    style="border:0;width:100%;max-width:480px;height:520px" 
    title="Lead form">
  </iframe>
  ```
- **Universal Compatibility**: Can be pasted into WordPress Gutenberg / Elementor HTML widgets, Webflow embed elements, Squarespace code blocks, Shopify page templates, or raw HTML files.
- Operates in a sandboxed iframe to prevent CSS collisions with host websites.

---

#### 6. Data Mapping & Deduplication Engine

When a user submits a hosted form:

1. **Contact Identification**: The form evaluates whether an `email` or `phone` is provided. If neither is filled, the form halts submission with: *"Please enter at least an email or a phone number."*
2. **Core Field Mapping**:
   - `name` → `leads.name`
   - `email` → `leads.email`
   - `phone` → `leads.phone`
   - `company` → `leads.company`
3. **Custom Data Aggregation**:
   All non-standard responses are bundled into a JSON object:
   ```json
   {
     "team_size": "25-50",
     "target_start_date": "2026-10-01",
     "current_solution": "Salesforce",
     "form_submission_timestamp": "2026-09-19T10:45:00Z"
   }
   ```
   Stored in `leads.customData` and rendered inside the **Lead Dossier** custom fields tab.
4. **Pipeline Routing**: Triggers organization-level assignment rules and enqueues automated drip sequences.

---

#### 7. Code & Symbol Reference

- [`FormFieldsEditor.tsx`](file:///Users/naveenadicharla/Documents/ridhzo/src/components/sources/FormFieldsEditor.tsx): Interactive client component for field reordering, type assignment, and step configuration.
- [`formFields.ts`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/leads/formFields.ts): Schema definitions (`FormField`, `FormFieldType`), default schemas, and `groupIntoSteps`.
- [`/app/f/[slug]/page.tsx`](file:///Users/naveenadicharla/Documents/ridhzo/src/app/f/%5Bslug%5D/page.tsx): SSR route serving public forms by source ID.
- [`PublicLeadForm.tsx`](file:///Users/naveenadicharla/Documents/ridhzo/src/components/PublicLeadForm.tsx): Client-side form engine handling multi-step navigation and validation.
- [`updateSourceFormAction`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/sources.ts#L65): Server action persisting sanitized field configurations.
- [`createSourceAction`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/sources.ts#L52): Generates new `webform` source records.

---

## 5. Lead Source Specification: Website Custom Webhook (`generic_webhook`)

> Source: `docs/SOURCE_WEBSITE_WEBHOOK.md`

### Lead Source Specification: Website Custom Webhook (`generic_webhook`)

The **Website Custom Webhook** integration provides a high-throughput, cryptographically signed REST API endpoint designed to connect external websites, landing page builders, mobile apps, and custom serverless backends directly to Ridhzo. It supports platforms such as WordPress (Elementor, Contact Form 7, Gravity Forms), Webflow, Framer, Shopify, and custom frontend applications.

---

#### 1. Executive Summary & Business Functionality

- **Channel Focus**: External company websites, marketing landing pages, custom event registration portals, and third-party SaaS services.
- **Conversion Mechanism**: Standard HTTP POST request transmitting a JSON payload whenever an end-user submits an inquiry form.
- **Ridhzo Value**: Enterprise-grade security with HMAC SHA-256 signatures, sliding-window rate limiting (100 req/60s per IP), optional idempotency deduplication, and zero-breakdown asynchronous queueing via BullMQ.

---

#### 2. Technical Architecture & Distributed Ingestion Flow

```
+----------------------------------------------------------------------------------------------------+
|                                    EXTERNAL WEBSITE OR SERVICE                                     |
+----------------------------------------------------------------------------------------------------+
  [User Submits Form on WP / Webflow] -> [External Backend / Script Signs Payload]
                                                        |
                                                        v  HTTP POST (JSON) + Headers
+----------------------------------------------------------------------------------------------------+
|                                   RIDHZO GENERIC WEBHOOK RECEIVER                                  |
|                                                                                                    |
|  Endpoint: src/app/api/webhooks/[provider]/route.ts                                                |
|                                                                                                    |
|  1. JSON Format Check: Validates valid JSON structure                                              |
|  2. Zod Payload Validation: Ensures valid shape (name, email, phone) with .passthrough()          |
|  3. Sliding-Window Rate Limiting: 100 requests per 60 seconds per client IP via RateLimiter         |
|  4. Source Validation: Confirms source exists, is active, and maps to an organization               |
|  5. HMAC SHA-256 Verification: Validates x-hub-signature-256 using crypto.timingSafeEqual          |
|  6. Idempotency Check: Inspects x-idempotency-key header against webhook_events                    |
+----------------------------------------------------------------------------------------------------+
                                                        |
                                                        v
+----------------------------------------------------------------------------------------------------+
|                                    STAGE & ASYNCHRONOUS BUFFERING                                  |
|                                                                                                    |
|  1. Persists raw body into postgres.webhook_events (status: "pending")                             |
|  2. Enqueues job to BullMQ ingestionQueue ("ingest-generic-webhook")                               |
|  3. Acknowledges HTTP 200 { success: true, eventId: "<id>" } to external caller in < 20ms          |
+----------------------------------------------------------------------------------------------------+
                                                        |
                                                        v
+----------------------------------------------------------------------------------------------------+
|                                      BACKGROUND WORKER PROCESS                                     |
|                                                                                                    |
|  Worker: src/lib/jobs/workers/ingestionWorker.ts                                                   |
|  - Normalizes core lead columns (name, email, phone, company)                                      |
|  - Extracts all unmapped JSON attributes into leads.customData                                      |
|  - Triggers lead assignment rules and workflow automations                                          |
+----------------------------------------------------------------------------------------------------+
```

---

#### 3. Webhook Generation & Configuration

##### Generating a Webhook Endpoint
1. Navigate to `/settings/sources`.
2. Under **Available Integration Platforms**, find **Website Custom Webhook**.
3. Click **Generate Webhook Endpoint**.
4. Ridhzo generates a unique source record with:
   - **Webhook URL**: `https://<your-domain>/api/webhooks/generic_webhook?sourceId=<SOURCE_UUID>`
   - **HMAC Signing Secret**: A 64-character hexadecimal key (e.g., `e4b2d9a1f8c7...`).

---

#### 4. Security Protocols & Cryptographic Signatures

The generic webhook endpoint is exposed to the public internet and implements four concentric defense layers:

##### 1. Sliding Window Rate Limiting ([`RateLimiter.checkLimit`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/rate-limit.ts#L38))
- Tracks requests per IP address using a sliding window:
  ```typescript
  const ip = req.headers.get("x-forwarded-for") || "unknown";
  const rateLimitKey = `webhook:${provider}:${ip}`;
  const limitResult = await RateLimiter.checkLimit(rateLimitKey, 100, 60);
  ```
- Permits up to **100 requests per 60 seconds**.
- Requests exceeding the threshold are rejected with HTTP 429 Too Many Requests and include standard compliance headers (`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`).

##### 2. HMAC SHA-256 Signature Verification
- In production, callers sign the raw request body with the source's `webhookSecret`.
- The signature is passed in the `x-hub-signature-256` HTTP header as `sha256=<hex_digest>` or raw `<hex_digest>`.
- Ridhzo recalculates the expected digest and validates using constant-time buffer comparison:
  ```typescript
  const crypto = await import("crypto");
  const expectedSignature = crypto
    .createHmac("sha256", source.webhookSecret)
    .update(rawText)
    .digest("hex");

  const cleanSig = signature.startsWith("sha256=") ? signature.slice(7) : signature;
  const a = Buffer.from(cleanSig, "utf8");
  const b = Buffer.from(expectedSignature, "utf8");

  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return NextResponse.json({ success: false, error: "Invalid signature" }, { status: 401 });
  }
  ```
- Prevents timing attacks and guarantees payload authenticity.

##### 3. Idempotency Key Handling
- Callers can include an `x-idempotency-key` header (e.g., submission UUID or transaction ID).
- If Ridhzo has already processed an event with that idempotency key for the same provider, it skips duplicate processing and returns HTTP 200 `{ success: true, message: "Duplicate event skipped" }`.

---

#### 5. Payload Format & Field Mapping

##### Sample JSON Request Body
```json
{
  "name": "Sarah Connor",
  "email": "sarah.connor@cyberdyne.com",
  "phone": "+13105550144",
  "company": "Cyberdyne Systems",
  "budget": "$50,000 - $100,000",
  "project_scope": "Full CRM migration",
  "source_channel": "Google Organic",
  "landing_page": "/pricing"
}
```

##### Ingestion & Schema Extraction Logic
1. **Core Lead Columns**:
   - `name`: Populates `leads.name`.
   - `email`: Populates `leads.email` (validated via Zod email regex).
   - `phone`: Populates `leads.phone`.
   - `company`: Populates `leads.company`.
2. **Dynamic Custom Data**:
   - Any auxiliary keys (e.g., `budget`, `project_scope`, `source_channel`, `landing_page`) are retained without truncation and serialized into the JSONB column `leads.customData`.
   - These attributes appear in the lead profile's custom fields widget.

---

#### 6. Integration Code Examples

##### cURL / Bash Example
```bash
BODY='{"name":"Sarah Connor","email":"sarah@example.com","phone":"+13105550144","budget":"$50k"}'
SECRET="<YOUR_WEBHOOK_SECRET>"
SIGNATURE=$(echo -n "$BODY" | openssl dgst -sha256 -hmac "$SECRET" | sed 's/^.* //')

curl -X POST "https://crm.yourdomain.com/api/webhooks/generic_webhook?sourceId=<SOURCE_ID>" \
  -H "Content-Type: application/json" \
  -H "x-hub-signature-256: sha256=$SIGNATURE" \
  -H "x-idempotency-key: $(uuidgen)" \
  -d "$BODY"
```

##### Node.js (Express / Serverless) Example
```javascript
import crypto from "crypto";

async function sendLeadToRidhzo(leadData) {
  const payload = JSON.stringify(leadData);
  const secret = process.env.RIDHZO_WEBHOOK_SECRET;
  const signature = crypto.createHmac("sha256", secret).update(payload).digest("hex");

  const response = await fetch("https://crm.yourdomain.com/api/webhooks/generic_webhook?sourceId=<SOURCE_ID>", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-hub-signature-256": `sha256=${signature}`,
      "x-idempotency-key": leadData.submissionId || crypto.randomUUID(),
    },
    body: payload,
  });

  return response.json();
}
```

---

#### 7. Code & Symbol Reference

- [`/api/webhooks/[provider]/route.ts`](file:///Users/naveenadicharla/Documents/ridhzo/src/app/api/webhooks/%5Bprovider%5D/route.ts): Universal REST endpoint executing rate limiting, HMAC validation, and database staging.
- [`RateLimiter`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/rate-limit.ts#L27): Sliding-window memory rate limiter.
- [`webhookEvents`](file:///Users/naveenadicharla/Documents/ridhzo/src/db/schema/leads.ts): Database schema storing raw inbound payloads and audit logs.
- [`ingestionQueue`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/jobs/workers/ingestionWorker.ts): BullMQ distributed queue executing asynchronous lead normalization.
- [`LeadSourceService.createSource`](file:///Users/naveenadicharla/Documents/ridhzo/src/domains/leads/sourceService.ts#L41): Creates webhook sources with unique cryptographic secrets.

---

## 6. Lead Capture & Lead Sources

> Source: `docs/product-kb/04_LEAD_CAPTURE_SOURCES.md`

### Lead Capture & Lead Sources

#### What it is
Ridhzo pulls leads from every channel into **one inbox**, automatically, in seconds. Every source runs through the same pipeline: **receive → clean & map fields → check duplicates → create lead → assign → alert → run automations.**

Managed at **Settings → Lead Sources**. Each source shows live stats (leads received, last lead time, status) and can be paused or removed safely.

#### Supported sources

##### 1. Facebook & Instagram Lead Ads
- **Connect in one click** with Facebook login; choose your Page(s).
- New leads arrive **within seconds** of form submission (real-time webhook).
- **Multi-Tenant Page Sharing:** A single Facebook Page can be connected across multiple shared organization accounts. Incoming leads are automatically copied and dispatched to all connected workspaces — ideal for marketing agencies managing franchise or regional dealer accounts.
- **Choose which forms** to import (form-level filter).
- **Sync Past Leads** — backfill leads you received before connecting.
- Automatic field mapping: name, email, phone, plus every custom form question saved on the lead ("What they told you in the form").
- **Proactive Token Expiry & Health Tracking:** Continuous monitoring of Facebook Page access tokens with clear in-app expiry warnings before integrations break, plus automatic outage recovery.
- **Meta Conversions API (CAPI) Delivery Status:** Track real-time delivery status (sent, pending, failed) and diagnostic errors directly within Settings → Lead Intelligence.
- Supports Meta data-deletion and deauthorization requirements.

**Use case:** An agency manages 4 franchise branches running ads on one central Facebook page. Leads automatically replicate to all branch workspaces with instant local rep alerts.

##### 2. Google Lead Form Ads
- Paste Ridhzo's webhook URL and key into your Google Ads lead form extension.
- Leads (including test pings) arrive instantly; campaign/ad-group attribution is preserved.

**Use case:** An education institute running Google Search ads for "MBA admission" captures every form lead directly into the counsellor pipeline.

##### 3. Hosted Web Forms (no website needed)
- Build a form with the **visual field editor** — any field, including custom fields.
- **Multi-step forms** (up to 10 steps) to reduce drop-off.
- Share as a **public link** (for Instagram bio, WhatsApp status, QR codes, flyers) or **embed** on any website (WordPress, Elementor, Webflow, Wix, Squarespace, Shopify, plain HTML) with one copy-paste iframe code.
- Spam-protected and rate-limited; UTM parameters are captured for attribution.
- "Powered by Ridhzo" badge on Free plan; removed on paid plans.

**Use case:** A gym puts a QR code at its front desk → "Free trial class" form → every walk-in enquiry becomes a lead with a follow-up.

##### 4. Website Webhook (custom forms & tools)
- A unique, signed webhook URL for your existing website forms or any tool (Zapier, Make, Pabbly, WordPress plugins, landing-page builders).
- Send JSON; Ridhzo maps name, email, phone, company and puts everything else into custom data.
- Optional HMAC signature verification for security.

**Use case:** A clinic's existing WordPress contact form posts to the Ridhzo webhook; appointment requests appear as leads instantly.

##### 5. REST API
- Create and read leads programmatically with an API key (`POST /api/v1/leads`). See [Integrations, API & Webhooks](18_INTEGRATIONS_API_WEBHOOKS.md).

##### 6. CSV / Excel Import
- Upload a CSV, **map columns** to Ridhzo fields (including custom fields), **preview/simulate** the import to see what will be created or skipped, then commit.
- Enhanced validation safeguards, automated budget extraction, and duplicate detection during import ensure bad records don't corrupt your database.

**Use case:** An insurance advisor moves 2,000 old contacts from Excel into Ridhzo in five minutes without corrupting existing records.

##### 7. Manual Entry & Quick Add
- Global **Quick Add** button from any screen: name, phone (with country code), email, optional company, owner, custom fields.
- **Works offline** — saved on the device with version claiming and synced automatically with conflict detection when internet returns.

**Use case:** An agent at a property expo adds 40 walk-in visitors on their phone with patchy network — none are lost or overwritten.

##### 8. Android Device Call Sync & Smart Missed-Calls
- **Automatic Android Call Logging:** Reps install the Ridhzo Android app; calls made, answered, or missed are synced automatically with timestamps and exact talk durations.
- **Caller ID Directory:** Ridhzo pre-downloads active lead phone keys to the rep's phone. When a lead calls, the rep sees the caller's lead name instantly before picking up.
- **Smart Missed-Call Alerts:** If a lead calls a rep and the rep misses it, the rep's phone already displayed the native missed-call alert. Ridhzo smartly suppresses redundant duplicate push alerts to that phone while logging the missed call on the timeline and triggering team automations.
- **Telephony Webhook Integration:** Connect virtual telephony numbers (Exotel, Knowlarity, Twilio, etc.) to Ridhzo's missed-call webhook. Missed calls automatically trigger instant WhatsApp replies so no inbound enquiry goes cold.

##### 9. Inbound Email → Lead Timeline
- Email replies from leads are logged automatically on their timeline and can trigger automations (configured in **Settings → Lead Intelligence**).
- **Auto-Reply & OOO Filtering:** Inbound webhook intelligently filters out auto-replies, out-of-office (OOO) messages, and bounce notifications.
- **Deduplication:** Prevents duplicate timeline activities if an inbound email is retried or delivered across multiple aliases.

##### Coming soon
- **LinkedIn Lead Gen Forms** (Coming soon)
- **WhatsApp inbound as a lead source** — new WhatsApp conversations creating leads automatically (Coming soon)

#### Smart processing on every lead
| Step | What happens |
|---|---|
| Field mapping | Standard + custom fields mapped automatically from every source |
| Phone normalisation | Fast trigram (`pg_trgm`) index matches numbers in any format (+91 98765 43210, 9876543210) instantly |
| Duplicate check | Same phone/email → flagged or auto-merged (optional auto-merge) |
| Call & Activity sync | Device calls, audio logs, and message history linked to matching lead record |
| Attribution | Source, form, campaign and UTM data saved |
| Enrichment (optional) | Fill missing details from your data provider |
| Assignment | Round-robin / capacity / rules / automation |
| Alerts | High-priority push channels, in-app with sound, email, WhatsApp |
| Automations | "Lead created" or "Call logged" workflows run instantly |

#### Why it matters
- **Speed:** leads are in your hand seconds after they submit — not the next morning from a spreadsheet.
- **Zero manual logging:** Android call sync automatically records talk time and calls without reps typing notes.
- **Nothing lost:** no copy-paste from Facebook Lead Center, no forgotten email enquiries, no missed calls ignored.
- **Clear ROI:** you know exactly which source and campaign produced each lead, each call, and each sale.

#### Plan limits
Free: 1 source · Starter: 5 sources · Unlimited: unlimited sources. (Device call sync is available on all plans).
