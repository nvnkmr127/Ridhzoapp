# Lead Source Specification: Google Lead Form Ads (`google_lead_ads`)

The **Google Lead Form Ads** integration connects Ridhzo directly to Google Ads Lead Form Assets. When prospects search on Google or view video campaigns on YouTube, they can submit their contact details directly within the search results or ad overlay. Ridhzo captures, authenticates, and ingests these leads synchronously in real time while preserving critical marketing attribution (including GCLID and Campaign ID).

---

## 1. Executive Summary & Business Functionality

- **Channel Focus**: High-intent Google Search, Performance Max, Display, and YouTube Video ad campaigns.
- **Conversion Mechanism**: Google's native Lead Form extension appears beneath the ad headline. Users submit without leaving the Google search results page or YouTube video player.
- **Ridhzo Value**: Ingests leads immediately, verifies Google's cryptographic payload key, maps Google's uppercase column keys into standard CRM fields, and stores GCLID (Google Click ID) for closed-loop ROAS analysis and offline conversion tracking.

---

## 2. Technical Architecture & Ingestion Pipeline

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
|  3. Google Key Echo Validation: Verifies body.google_key === source.webhookSecret                  |
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
|  - Deduplication: Matches against existing leads by Email, Phone, or Google lead_id                |
|  - Custom Data Payload: Stores full user_column_data, gclId, campaignId, and formId                |
|  - Assignment Engine: Triggers round-robin rep distribution and auto-response sequences           |
+----------------------------------------------------------------------------------------------------+
```

---

## 3. Step-by-Step Google Ads Setup & Webhook Delivery

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
   - Expand the **Export leads from Google Ads** section and select **Other data integration options (Webhook)**.
   - Paste the **Webhook URL** into the *Webhook URL* field.
   - Paste the Ridhzo **Signing Secret** into the *Key* field.
   - Click **Send test data**.
   - Google Ads displays an immediate green verification checkmark: *"Test data successfully sent"*.
   - Save the asset. All live submissions will now stream directly into Ridhzo.

---

## 4. Webhook Payload Specifications & Normalization

### Raw Google Payload Example
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

### Column Mapping Engine ([`mapColumns`](file:///Users/naveenadicharla/Documents/ridhzo/src/app/api/webhooks/google_lead_ads/route.ts#L13-L22))
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

### Lead Attribute Synthesis
- **Full Name**: Derived from `cols.FULL_NAME` or combined from `[cols.FIRST_NAME, cols.LAST_NAME]`. If neither exists, defaults to `"Google Lead"`.
- **Email**: Derived from `cols.EMAIL` or `cols.USER_EMAIL`.
- **Phone**: Derived from `cols.PHONE_NUMBER` or `cols.USER_PHONE`.
- **Company**: Derived from `cols.COMPANY_NAME`.
- **Validation Guard**: Requires at least one contact channel (`email` or `phone`). If both are missing, the endpoint rejects with HTTP 422 Unprocessable Entity.

---

## 5. Security, Test Pings & Attribution Preservation

### 1. Key Echo Authentication
Google does not use HMAC request signatures; instead, it echoes the configured secret inside the payload body as `google_key`. Ridhzo performs an exact equality check:
```typescript
if (source.webhookSecret && (body as any).google_key !== source.webhookSecret) {
  return NextResponse.json({ error: "Invalid key" }, { status: 401 });
}
```
Unauthorized requests from scrapers or bots are blocked with 401 Unauthorized before touching database tables.

### 2. Test Ping Handling
When saving a webhook in Google Ads, Google dispatches a mock payload with `"is_test": true`. Ridhzo detects this flag and returns HTTP 200 with `{ status: "test_ok" }`:
```typescript
if ((body as any).is_test) return NextResponse.json({ status: "test_ok" }, { status: 200 });
```
This enables successful verification in Google Ads while preventing test records from entering sales reps' queues.

### 3. Google Click ID (GCLID) Attribution
The `gcl_id` query parameter is Google's primary tracking token for ad interactions. Ridhzo permanently persists:
- `formId`: Google Lead Form ID
- `campaignId`: Google Ads Campaign ID
- `gclId`: Google Click ID
- `fields`: Raw column array

These values are saved to `leads.customData`, allowing sales teams to see which keyword or campaign generated the lead and enabling automated offline conversion uploads back to Google Ads once a deal closes.

---

## 6. Code & Symbol Reference

- [`/api/webhooks/google_lead_ads/route.ts`](file:///Users/naveenadicharla/Documents/ridhzo/src/app/api/webhooks/google_lead_ads/route.ts): Route handler executing key validation, test ping response, and column normalization.
- [`LeadSourceService.getSource`](file:///Users/naveenadicharla/Documents/ridhzo/src/domains/leads/sourceService.ts#L36): Validates tenant ownership and retrieves the source's `webhookSecret`.
- [`IngestionService.processLead`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/leads/ingestion.ts): Standardizes CRM fields, enforces tenant isolation, and deduplicates contacts.
- [`SourcesManager.tsx`](file:///Users/naveenadicharla/Documents/ridhzo/src/components/sources/SourcesManager.tsx): Renders the Google Lead Ads platform card, generates webhook endpoints, and displays lead telemetry.
