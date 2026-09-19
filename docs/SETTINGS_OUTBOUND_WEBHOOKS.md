# Settings: Outbound Webhooks (`/settings/webhooks`)

## 1. Executive Summary & Purpose

The **Outbound Webhooks** engine allows developers and administrators to subscribe their own HTTP endpoints to core CRM lead events. When a lead is captured or undergoes a pipeline transition, Ridhzo dispatches an HTTP POST request carrying an HMAC-SHA256 signed JSON envelope.

The architecture is built for mission-critical reliability, SSRF security, and zero event loss:
- **Durable Delivery Tracking:** Every outbound delivery is recorded in PostgreSQL (`webhook_deliveries`) as `pending` before BullMQ queue ingestion. Redis or worker outages surface as observable failed jobs rather than silent drops.
- **Enterprise SSRF Protection:** Pre-flight DNS resolution and IP address filtering strictly block private subnets, cloud instance metadata services (e.g. AWS/DigitalOcean `169.254.169.254`), and loopback addresses.
- **Cryptographic Signing:** Every payload is signed with a unique 24-byte hex secret via HMAC-SHA256 in the `X-Ridhzo-Signature` header.
- **Dead Letter Queue (DLQ) & Self-Healing:** Transient failures retry up to 5 times with exponential backoff; permanent failures (3xx/4xx) bypass retries and land in a tenant-scoped DLQ with one-click re-enqueue and purge operations.

---

## 2. File & Architecture Map

| Purpose | File Path |
| :--- | :--- |
| **Page Route** | [`src/app/(dashboard)/settings/webhooks/page.tsx`](file:///Users/naveenadicharla/Documents/ridhzo/src/app/(dashboard)/settings/webhooks/page.tsx) |
| **Client UI Component** | [`src/components/settings/WebhooksManager.tsx`](file:///Users/naveenadicharla/Documents/ridhzo/src/components/settings/WebhooksManager.tsx) |
| **Server Actions** | [`src/lib/actions/webhooks.ts`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/webhooks.ts) |
| **Endpoint Service** | [`src/domains/integrations/webhookEndpointService.ts`](file:///Users/naveenadicharla/Documents/ridhzo/src/domains/integrations/webhookEndpointService.ts) |
| **Payload & Dispatch Service** | [`src/domains/leads/leadWebhookEventService.ts`](file:///Users/naveenadicharla/Documents/ridhzo/src/domains/leads/leadWebhookEventService.ts) |
| **Delivery Log & DLQ Service** | [`src/domains/leads/webhookDlqService.ts`](file:///Users/naveenadicharla/Documents/ridhzo/src/domains/leads/webhookDlqService.ts) |
| **SSRF Guard** | [`src/lib/webhooks/ssrf.ts`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/webhooks/ssrf.ts) |
| **BullMQ Worker Queue** | [`src/lib/jobs/workers/webhookRetryWorker.ts`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/jobs/workers/webhookRetryWorker.ts) |
| **Database Schema** | [`src/db/schema/integrations.ts`](file:///Users/naveenadicharla/Documents/ridhzo/src/db/schema/integrations.ts) |
| **Event Bus Triggers** | [`src/lib/events/handlers.ts`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/events/handlers.ts) |

---

## 3. Database Schema

Managed via Drizzle ORM in [`src/db/schema/integrations.ts`](file:///Users/naveenadicharla/Documents/ridhzo/src/db/schema/integrations.ts):

### 3.1 `webhook_endpoints`
Stores tenant-registered target endpoints:
```typescript
export const webhookEndpoints = pgTable('webhook_endpoints', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').references(() => organizations.id).notNull(),
  url: varchar('url', { length: 2048 }).notNull(),
  secret: varchar('secret', { length: 255 }).notNull(), // 48-char hex (24 random bytes)
  events: jsonb('events').$type<string[]>().default([]).notNull(),
  isActive: integer('is_active').default(1).notNull(), // 1 = active, 0 = paused
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => ({
  orgIdx: index('webhook_endpoints_org_idx').on(t.organizationId),
}));
```

### 3.2 `webhook_deliveries`
Durable delivery log and DLQ shared between the Vercel web tier and background worker:
```typescript
export const webhookDeliveries = pgTable('webhook_deliveries', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').references(() => organizations.id).notNull(),
  endpointId: uuid('endpoint_id'), // nullable: endpoints can be deleted while jobs are pending
  jobId: varchar('job_id', { length: 128 }), // BullMQ job identifier
  eventId: varchar('event_id', { length: 64 }).notNull(), // e.g. "evt_3f4a9b2c..."
  event: varchar('event', { length: 64 }).notNull(), // "lead.created" | "lead.status_changed"
  url: varchar('url', { length: 2048 }).notNull(),
  status: varchar('status', { length: 16 }).default('pending').notNull(), // pending | delivered | failed | skipped
  attempts: integer('attempts').default(0).notNull(),
  lastStatusCode: integer('last_status_code'),
  errorReason: text('error_reason'),
  payload: jsonb('payload').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => ({
  orgStatusIdx: index('webhook_deliveries_org_status_idx').on(t.organizationId, t.status, t.updatedAt),
}));
```

---

## 4. Supported Event Types & Payload Envelope

Subscribable event types are strictly limited to active event producers in [`WEBHOOK_EVENT_TYPES`](file:///Users/naveenadicharla/Documents/ridhzo/src/domains/integrations/webhookEndpointService.ts):

| Event Key | Label | Producer Location | Data Payload Keys |
| :--- | :--- | :--- | :--- |
| `lead.created` | **Lead created** | [`src/lib/events/handlers.ts:102`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/events/handlers.ts#L102) | `id`, `name`, `email`, `phone`, `company`, `status` |
| `lead.status_changed` | **Status changed** | [`src/lib/events/handlers.ts:160`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/events/handlers.ts#L160) | `id`, `name`, `email`, `phone`, `company`, `status`, `oldStatus`, `newStatus` |

### JSON Payload Envelope (`WebhookEventPayload`)
```json
{
  "version": "1",
  "eventId": "evt_7d8e2a1b9c4f4e1284a1d0f5e7c8b9a0",
  "event": "lead.created",
  "timestamp": "2026-09-19T11:02:15.123Z",
  "organizationId": "550e8400-e29b-41d4-a716-446655440000",
  "data": {
    "id": "c39a5f4e-28b1-4f11-9e2e-8d8a7c2e3f1a",
    "name": "Alex Mercer",
    "email": "alex.mercer@example.com",
    "phone": "+15550192834",
    "company": "Nexus Technologies",
    "status": "new"
  }
}
```

---

## 5. Security & SSRF Protection

### 5.1 Host & IP Pre-Flight Verification (`ssrf.ts`)
Outbound endpoints accept custom URLs. To protect cloud servers against Server-Side Request Forgery (SSRF), [`assertPublicHttpUrl()`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/webhooks/ssrf.ts) resolves DNS records and checks all addresses against [`isBlockedAddress()`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/webhooks/ssrf.ts#L8):
- **Private Subnets:** `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`.
- **Loopback & Zero:** `127.0.0.0/8`, `0.0.0.0/8`, `::1`.
- **Carrier-Grade NAT:** `100.64.0.0/10`.
- **Cloud Metadata Sink:** `169.254.169.254` (Link-local).
- **Multicast / Reserved:** `>= 224.0.0.0`.
- **IPv6:** `fe80::` (link-local), `fc00::/7` (unique-local), and IPv4-mapped IPv6 literals (`::ffff:a.b.c.d`).

### 5.2 Redirect Hardening
`fetch` requests are executed with `redirect: "manual"`. If a target endpoint attempts to issue an HTTP 301/302 redirecting the client to an internal IP or metadata endpoint, the request is halted immediately.

### 5.3 Cryptographic Signature Verification
Each request includes security headers computed over the raw JSON string body:
- `X-Ridhzo-Signature`: Hex-encoded HMAC-SHA256 hash using the endpoint's signing secret.
- `X-Ridhzo-Event`: The event identifier (e.g. `lead.created`).
- `X-Privyr-Signature` & `X-Privyr-Event`: Aliased headers maintained for legacy integration backwards compatibility.

#### Receiver Verification Example (Node.js):
```javascript
import crypto from "crypto";

function verifyWebhook(rawBody, signatureHeader, signingSecret) {
  const computed = crypto
    .createHmac("sha256", signingSecret)
    .update(rawBody)
    .digest("hex");
  return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(signatureHeader));
}
```

### 5.4 Secret Disclosure & Audit Logging
1. **Never Leaked in UI Props:** `WebhookEndpointService.list()` explicitly omits `secret` from queries.
2. **On-Demand Fetching:** Secrets are retrieved only when the user clicks the "Secret" button via [`revealWebhookSecretAction`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/webhooks.ts#L60).
3. **Audit Trail:** Every secret reveal logs a permanent record to [`AuditService`](file:///Users/naveenadicharla/Documents/ridhzo/src/domains/audit/service.ts) (`webhook.secret_reveal`) recording the requesting user ID and timestamp without logging the secret value.

---

## 6. End-to-End Delivery Lifecycle & DLQ

```
[Lead Event] (lead.created / lead.status_changed)
     │
     ▼
[fireLeadWebhook()]
     │
     ▼
[WebhookEndpointService.dispatch()]
     │
     ├─► 1. Writes "pending" row to Postgres (webhook_deliveries)
     │
     └─► 2. Enqueues job to BullMQ ("webhook-delivery")
               │
               ▼
   [createWebhookRetryWorker] (Concurrency: 5)
               │
               ├─► Check active status & secret in DB (Drop if paused/deleted)
               ├─► Pre-flight SSRF check (assertPublicHttpUrl)
               │
               ▼
   [LeadWebhookEventService.dispatchWebhook()] (10s Hard Timeout)
         │
         ├──► HTTP 2xx: Success
         │      └─► Update delivery row: status="delivered"
         │
         ├──► Permanent Failure: 3xx, 4xx (except 408/429), or Blocked IP
         │      ├─► Throws UnrecoverableError (bypasses BullMQ retries)
         │      └─► Worker marks delivery row: status="failed" (DLQ)
         │
         └──► Transient Failure: 408, 429, 5xx, or Network Timeout (statusCode 0)
                ├─► Throws standard Error
                ├─► BullMQ retries up to 5 attempts (Exponential backoff: 1s, 2s, 4s, 8s, 16s)
                └─► If attempts exhausted: Worker marks delivery row: status="failed" (DLQ)
```

---

## 7. Manager Interface Features (`WebhooksManager.tsx`)

1. **Delivery Statistics Bar:**
   Displays aggregate lifetime delivery metrics:
   - `{delivered} delivered`
   - `{pending} in flight`
   - `{failed} failed`
2. **Dead Letter Queue (DLQ) Alert:**
   Prominently displays an amber banner when failed deliveries accumulate:
   `"X deliveries failed permanently and moved to the dead-letter queue."`
3. **Add Endpoint Canvas:**
   Input URL and pill-toggle event selections (`Lead created`, `Status changed`). Pre-flight Zod validation ensures a valid HTTPS URL and at least one selected event.
4. **Live Endpoint Row Controls:**
   - **Send Test (`Send`):** Fires a synthetic `lead-test-<timestamp>` payload directly to the target URL. Rate-limited to **10 test dispatches per 60 seconds** per organization to mitigate outbound flood abuse.
   - **Copy Secret (`Copy`):** Retrieves the signing secret on-demand with automatic clipboard copy and audit logging.
   - **Pause / Activate Toggle:** Instantly halts outbound deliveries. Pending in-flight BullMQ jobs check database status before execution and cleanly mark skipped rows.
   - **Delete (`Trash2`):** Deletes endpoint registration and cascades removal.
5. **DLQ Administration:**
   Exposes server actions to inspect failed job payloads ([`listWebhookDlqAction`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/webhooks.ts#L89)), retry delivery with attempt reset ([`retryWebhookDlqAction`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/webhooks.ts#L94)), or permanently purge ([`purgeWebhookDlqAction`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/webhooks.ts#L105)).

---

## 8. Summary Checklist for Integration Engineers

- [ ] **Endpoint Setup:** Register HTTPS endpoint in `/settings/webhooks` selecting `Lead created` and/or `Status changed`.
- [ ] **Secret Storing:** Click **Secret**, copy the 48-character hex signing key, and store it securely in application environment variables.
- [ ] **Signature Verification:** Implement HMAC-SHA256 validation comparing `X-Ridhzo-Signature` against `crypto.createHmac("sha256", secret).update(rawBody).digest("hex")`.
- [ ] **Respond with 2xx:** Return HTTP 200/204 within 10 seconds. Unhandled exceptions or timeouts trigger BullMQ retries up to 5 attempts.
- [ ] **Test Delivery:** Click **Test** in the Ridhzo UI and verify that the test lead payload arrives at the receiving service.
