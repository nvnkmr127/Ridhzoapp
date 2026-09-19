# Lead Source Specification: Facebook & Instagram Lead Ads (`facebook_lead_ads`)

The **Facebook & Instagram Lead Ads** integration connects Ridhzo directly to the Meta Graph API v20.0 and Meta Webhook delivery infrastructure. It automates real-time prospect ingestion from Instagram and Facebook Instant Forms, bypassing manual CSV exports or third-party middleware (Zapier/Make), and guarantees zero lead loss during network spikes or credential outages.

---

## 1. Executive Summary & Business Functionality

- **Channel Focus**: High-velocity B2C and B2B paid advertising across Facebook Feed, Instagram Stories, Reels, and Marketplace.
- **Conversion Mechanism**: Native mobile Instant Forms pre-filled with the user's Facebook profile data (name, email, phone number) submit in two taps.
- **Ridhzo Value**: Ingests leads in under 200ms, executes instant automated WhatsApp/Email sequence assignment, notifies sales reps via push/desktop notifications, and provides deep campaign attribution.

---

## 2. Technical Architecture & Component Flow

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

## 3. End-to-End Authentication & Page Onboarding

### A. Popup OAuth Handshake
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

### B. Page Selection Modal
- Discovered pages are rendered in an interactive modal.
- Admins check one or multiple pages and click **Connect Selected Pages**.
- Triggers [`connectFacebookPagesAction(pageIds)`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/sources.ts#L121).

### C. Webhook Subscription & Multi-Tenant Lock
- **Tenant Exclusivity**: Ridhzo verifies that no other organization has connected the same `pageId` ([`LeadSourceService.upsertFacebookPageSource`](file:///Users/naveenadicharla/Documents/ridhzo/src/domains/leads/sourceService.ts#L73)).
- **Subscribed Apps Edge**: Calls `POST /v20.0/{page_id}/subscribed_apps?subscribed_fields=leadgen` via [`MetaTokenRefreshService.subscribePageToLeadgen`](file:///Users/naveenadicharla/Documents/ridhzo/src/domains/leads/metaTokenRefreshService.ts#L149). This instructs Meta to deliver live leads to Ridhzo's webhook endpoint.

---

## 4. Webhook Handshake & Verification Specifications

### Webhook Verification (`GET /api/webhooks/facebook`)
Meta validates webhook endpoint ownership by sending:
- `hub.mode = "subscribe"`
- `hub.challenge = "<random_integer_string>"`
- `hub.verify_token = "<configured_secret>"`

Ridhzo verifies that `hub.verify_token` matches `process.env.FACEBOOK_VERIFY_TOKEN` (or fallback tokens) and returns the `hub.challenge` string with HTTP 200.

### Webhook Delivery & Signature Verification (`POST /api/webhooks/facebook`)
- Meta sends payload headers including `x-hub-signature-256 = "sha256=<hex_hash>"`.
- Ridhzo executes [`verifyMetaSignature`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/webhooks/signature.ts) using HMAC SHA-256 with `process.env.FACEBOOK_APP_SECRET`.
- In production, missing or invalid signatures immediately reject with 401 Unauthorized.
- The webhook responds 200 OK immediately after persisting the event to `webhook_events`, preventing Meta retry floods.

---

## 5. Form-Level Whitelisting & Lead Filtering

Ad accounts frequently run multi-purpose forms (e.g., job applications, supplier requests, or distinct marketing campaigns):
1. **Form Discovery**: Clicking **Select Forms** triggers [`listFacebookFormsAction`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/sources.ts#L227), querying `GET /v20.0/{page_id}/leadgen_forms`.
2. **Form Filter Selection**: The user selects which form IDs should feed the CRM.
3. **Storage**: Stored in `lead_sources.config.formFilter` (array of form IDs) and `formFilterNames` (ID-to-name mapping).
4. **Enforcement**: If a lead originates from a form not in the filter, it is discarded during worker ingestion without creating an un-targeted lead. If the filter is empty, all forms on the Page are captured.

---

## 6. Historical Lead Backfill Engine (`Sync Past Leads`)

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

## 7. Token Expiry & Automatic Outage Recovery

1. **Dead Token Detection**: If Meta revokes permissions or user credentials change, API calls throw an auth error.
2. **Flagging**: The source is flagged with `needsReconnect: true`. The UI displays a persistent red badge: *"Facebook access for this Page has expired or was revoked. Click Connect Facebook Lead Ads to restore."*
3. **Event Stashing During Downtime**: Inbound live webhook notifications continue to be received and saved to `webhook_events` with `status: "failed"` and `reason: "auth_error_needs_reconnect"`.
4. **Automated Replay**: When the admin re-authenticates the Page, [`requeueAuthFailedEvents`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/sources.ts#L15) queries all failed events for that `page_id`, resets their status to `pending`, and reenqueues them into BullMQ. **No leads are lost during credential downtime.**

---

## 8. Code & Symbol Reference

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
