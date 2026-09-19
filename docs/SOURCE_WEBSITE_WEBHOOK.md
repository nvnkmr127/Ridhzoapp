# Lead Source Specification: Website Custom Webhook (`generic_webhook`)

The **Website Custom Webhook** integration provides a high-throughput, cryptographically signed REST API endpoint designed to connect external websites, landing page builders, mobile apps, and custom serverless backends directly to Ridhzo. It supports platforms such as WordPress (Elementor, Contact Form 7, Gravity Forms), Webflow, Framer, Shopify, and custom frontend applications.

---

## 1. Executive Summary & Business Functionality

- **Channel Focus**: External company websites, marketing landing pages, custom event registration portals, and third-party SaaS services.
- **Conversion Mechanism**: Standard HTTP POST request transmitting a JSON payload whenever an end-user submits an inquiry form.
- **Ridhzo Value**: Enterprise-grade security with HMAC SHA-256 signatures, sliding-window rate limiting (100 req/60s per IP), optional idempotency deduplication, and zero-breakdown asynchronous queueing via BullMQ.

---

## 2. Technical Architecture & Distributed Ingestion Flow

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

## 3. Webhook Generation & Configuration

### Generating a Webhook Endpoint
1. Navigate to `/settings/sources`.
2. Under **Available Integration Platforms**, find **Website Custom Webhook**.
3. Click **Generate Webhook Endpoint**.
4. Ridhzo generates a unique source record with:
   - **Webhook URL**: `https://<your-domain>/api/webhooks/generic_webhook?sourceId=<SOURCE_UUID>`
   - **HMAC Signing Secret**: A 64-character hexadecimal key (e.g., `e4b2d9a1f8c7...`).

---

## 4. Security Protocols & Cryptographic Signatures

The generic webhook endpoint is exposed to the public internet and implements four concentric defense layers:

### 1. Sliding Window Rate Limiting ([`RateLimiter.checkLimit`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/rate-limit.ts#L38))
- Tracks requests per IP address using a sliding window:
  ```typescript
  const ip = req.headers.get("x-forwarded-for") || "unknown";
  const rateLimitKey = `webhook:${provider}:${ip}`;
  const limitResult = await RateLimiter.checkLimit(rateLimitKey, 100, 60);
  ```
- Permits up to **100 requests per 60 seconds**.
- Requests exceeding the threshold are rejected with HTTP 429 Too Many Requests and include standard compliance headers (`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`).

### 2. HMAC SHA-256 Signature Verification
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

### 3. Idempotency Key Handling
- Callers can include an `x-idempotency-key` header (e.g., submission UUID or transaction ID).
- If Ridhzo has already processed an event with that idempotency key for the same provider, it skips duplicate processing and returns HTTP 200 `{ success: true, message: "Duplicate event skipped" }`.

---

## 5. Payload Format & Field Mapping

### Sample JSON Request Body
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

### Ingestion & Schema Extraction Logic
1. **Core Lead Columns**:
   - `name`: Populates `leads.name`.
   - `email`: Populates `leads.email` (validated via Zod email regex).
   - `phone`: Populates `leads.phone`.
   - `company`: Populates `leads.company`.
2. **Dynamic Custom Data**:
   - Any auxiliary keys (e.g., `budget`, `project_scope`, `source_channel`, `landing_page`) are retained without truncation and serialized into the JSONB column `leads.customData`.
   - These attributes appear in the lead profile's custom fields widget.

---

## 6. Integration Code Examples

### cURL / Bash Example
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

### Node.js (Express / Serverless) Example
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

## 7. Code & Symbol Reference

- [`/api/webhooks/[provider]/route.ts`](file:///Users/naveenadicharla/Documents/ridhzo/src/app/api/webhooks/%5Bprovider%5D/route.ts): Universal REST endpoint executing rate limiting, HMAC validation, and database staging.
- [`RateLimiter`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/rate-limit.ts#L27): Sliding-window memory rate limiter.
- [`webhookEvents`](file:///Users/naveenadicharla/Documents/ridhzo/src/db/schema/leads.ts): Database schema storing raw inbound payloads and audit logs.
- [`ingestionQueue`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/jobs/workers/ingestionWorker.ts): BullMQ distributed queue executing asynchronous lead normalization.
- [`LeadSourceService.createSource`](file:///Users/naveenadicharla/Documents/ridhzo/src/domains/leads/sourceService.ts#L41): Creates webhook sources with unique cryptographic secrets.
