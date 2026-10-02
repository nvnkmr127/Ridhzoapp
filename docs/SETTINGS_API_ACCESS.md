# Settings: API Access Hub (`/settings/api`)

The **API Access Hub** is Ridhzo's developer connectivity and integration gateway. Located at [`src/app/(dashboard)/settings/api/page.tsx`](file:///Users/naveenadicharla/Documents/ridhzo/src/app/(dashboard)/settings/api/page.tsx) and managed by [`ApiKeysManager.tsx`](file:///Users/naveenadicharla/Documents/ridhzo/src/components/settings/ApiKeysManager.tsx), this feature allows engineering teams to provision, scope, monitor, and revoke programmatic Bearer API keys for external integrations, custom backends, data pipelines, and third-party automation tools (Zapier, Make, n8n).

---

## 1. Executive Summary & Business Value

Modern revenue teams require flexible programmatic access to synchronize lead data across proprietary ERPs, data warehouses, and marketing stacks:

1. **Secure Programmatic Ingestion & Sync**: Ingest leads, query pipelines, and update custom attributes directly via standard REST HTTP endpoints (`/api/v1/leads`).
2. **One-Way Cryptographic Hashing**: Raw secret tokens are generated with high-entropy randomness, displayed **only once**, and stored exclusively as irreversible SHA-256 hashes.
3. **Least-Privilege Scoping (Read-Only vs. Full)**: Organizations can create read-only keys for reporting dashboards or external auditors, preventing external scripts from modifying or deleting leads.
4. **Enterprise Rate Limiting**: Enforces an in-memory and Redis sliding-window budget of **600 requests per 60 seconds per API key**, defending against runaway loops and distributed denial-of-service attempts.
5. **Lock-Free Usage Telemetry**: Tracks real-time `lastUsedAt` timestamps with fire-and-forget 60-second write throttling, eliminating database lock contention during high-volume API ingest.
6. **Granular Lifecycle Control**: Instant key revocation cuts off misbehaving integrations immediately while retaining audit trail history.

---

## 2. Technical Architecture & Authorization Flow

```
+----------------------------------------------------------------------------------------------------+
|                                    API ACCESS MANAGEMENT ROUTE                                     |
|                                                                                                    |
|  Server Route: src/app/(dashboard)/settings/api/page.tsx                                           |
|  Authorization Guard: if (!hasPermission("api.manage")) redirect("/leads")                        |
|  Data Pre-fetch: ApiKeyService.list(organizationId)                                                |
+----------------------------------------------------------------------------------------------------+
                                                |
                                                v
+----------------------------------------------------------------------------------------------------+
|                                     API KEYS MANAGER CANVAS                                        |
|                                                                                                    |
|  Component: src/components/settings/ApiKeysManager.tsx                                             |
|  - Key Provisioning: Name + Scope Selector (Full vs Read-only)                                      |
|  - One-Time Secret Dialog: Displays raw "pk_..." token with copy action                            |
|  - Key Roster: Prefix display ("pk_7a8b..."), scope badges, last used timestamp, revoke / delete    |
+----------------------------------------------------------------------------------------------------+
                                                |
                                                v  External Request: Authorization: Bearer pk_...
+----------------------------------------------------------------------------------------------------+
|                                      REST API V1 GATEKEEPER                                        |
|                                                                                                    |
|  Middleware: src/lib/apiAuth.ts (authorizeApiRequest)                                              |
|                                                                                                    |
|  1. Bearer Token Extraction: Verifies header starts with "Bearer pk_"                              |
|  2. Cryptographic Hash Resolution: Hashes raw key via SHA-256 and matches against api_keys.key_hash |
|  3. Revocation Check: Asserts revokedAt IS NULL                                                    |
|  4. Scope Enforcement: If scope === "read_only", rejects non-safe methods (POST, PUT, DELETE) 403   |
|  5. Sliding Window Rate Limiting: 600 req / 60s per key principal                                  |
|  6. Fire-and-Forget Telemetry: Updates lastUsedAt throttled to once every 60 seconds                |
+----------------------------------------------------------------------------------------------------+
                                                |
                                                v
+----------------------------------------------------------------------------------------------------+
|                                      V1 ENDPOINT CONTROLLERS                                       |
|                                                                                                    |
|  GET  /api/v1/leads: List active leads, filter by status, search by name/phone/company            |
|  POST /api/v1/leads: Ingest lead, validate custom fields, assert plan limits, create contact       |
+----------------------------------------------------------------------------------------------------+
```

---

## 3. UI Layout & Visual Hierarchy

The API Access Hub is designed for developer clarity, adhering to strict zero-knowledge credential reveal principles:

### A. Navigation & Header
- **Breadcrumb Link**: Ghost button linking back to `/settings`.
- **Title**: `API Access`
- **Subtitle**: *"Programmatic access to your leads via the REST API."*

### B. API Key Provisioning Card
Positioned at the top of the canvas, the authoring card enables key creation:

```
+----------------------------------------------------------------------------------------------------+
|                                             API KEYS                                               |
+----------------------------------------------------------------------------------------------------+
|  Authenticate with  Authorization: Bearer <key>  against  /api/v1/leads.                           |
|                                                                                                    |
|  [ Key name: Zapier Ingestion Pipeline ]  [ + Create Button ]                                      |
|                                                                                                    |
|  [x] Read-only (GET requests only — can’t create, edit, or delete)                                 |
|                                                                                                    |
|  +----------------------------------------------------------------------------------------------+  |
|  | Copy your key now — it won’t be shown again.                                                 |  |
|  | pk_4f9a8b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e                           [ Copy Button ] |  |
|  | Done                                                                                         |  |
|  +----------------------------------------------------------------------------------------------+  |
+----------------------------------------------------------------------------------------------------+
```

#### One-Time Secret Reveal Dialogue
- When a key is created, Ridhzo receives the raw token once from [`createApiKeyAction`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/apiKeys.ts#L15).
- A highlighted box displays the full raw key with an instant copy button (`navigator.clipboard.writeText`).
- Once dismissed or upon page reload, **the raw key is permanently expunged from memory**. The server stores only the cryptographic hash.

### C. Active API Keys Table
Renders all created keys for the tenant organization:
- **Name & Truncated Prefix**: Displays the human label alongside the first 12 characters (`pk_4f9a8b1c...`).
- **Scope Badge**:
  - `Read-only`: Rendered as an outline badge for keys restricted to HTTP GET.
  - `Full`: Unbadged, full read/write permission.
- **Status Badges**:
  - `Active`: Dark emerald badge.
  - `Revoked`: Muted gray badge indicating the key has been disabled.
- **Telemetry**: Displays `last used <date>` tracking the most recent API call.
- **Actions**:
  - **Revoke Button**: Disables the key instantly (`revokedAt = now()`) while preserving audit history.
  - **Delete Button (Trash Icon)**: Prompts for confirmation and permanently removes the key record from the database.

---

## 4. Cryptographic Token Architecture

Ridhzo follows industry-standard API security patterns (modeled after Stripe and GitHub token standards):

```
+----------------------------------------------------------------------------------------------------+
|                                     TOKEN STRUCTURE & ENCODING                                     |
+---------------------+------------------------------------------------------------------------------+
| Attribute           | Technical Specification                                                      |
+---------------------+------------------------------------------------------------------------------+
| Token Format        | pk_<48 hexadecimal characters> (total length: 51 chars)                      |
| Entropy Generation  | crypto.randomBytes(24).toString("hex") (192 bits of cryptographic entropy)    |
| Prefix Storage      | raw.slice(0, 12) (e.g., "pk_7a8b9c0d1e")                                     |
| Database Storage    | SHA-256 hash (64 hex characters) stored in api_keys.key_hash                 |
| Verification Match  | crypto.createHash("sha256").update(raw).digest("hex") === api_keys.key_hash   |
+---------------------+------------------------------------------------------------------------------+
```

### Database Schema ([`apiKeys`](file:///Users/naveenadicharla/Documents/ridhzo/src/db/schema/system.ts))
```typescript
export const apiKeys = pgTable('api_keys', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').references(() => organizations.id, { onDelete: 'cascade' }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  keyHash: varchar('key_hash', { length: 64 }).notNull().unique(), // sha256 hex
  prefix: varchar('prefix', { length: 16 }).notNull(), // pk_xxxx for identification
  scope: varchar('scope', { length: 16 }).notNull().default('full'), // full, read_only
  scopes: jsonb('scopes').$type<string[]>(), // optional fine-grained area allow-list
  createdById: uuid('created_by_id').references(() => users.id, { onDelete: 'set null' }),
  lastUsedAt: timestamp('last_used_at'),
  revokedAt: timestamp('revoked_at'),
  expiresAt: timestamp('expires_at'), // null = never expires; or 30/90/365 days
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
```

Because only `keyHash` is persisted, a database compromise never exposes usable credentials.

---

## 5. Scope Enforcement, Key Lifecycles & Security Constraints

### Access Control & Scopes
1. **Creation Prerequisite (Verified Email):** Creating an API key requires a verified account email (`emailVerifiedAt`). Unverified accounts cannot provision API keys.
2. **Key Expiry:** Optional expiration lifespans (30, 90, 365 days, or never). Expired keys return HTTP 401.
3. **Read-Only vs. Full Access:**
   - `full`: Allows GET, POST, PATCH, DELETE operations.
   - `read_only`: Restricted to GET and HEAD requests only (mutations rejected with HTTP 403).
4. **Fine-Grained Area Scopes (`scopes`):**
   When created with a specific scope list, only explicitly allowed areas may be accessed:
   - `leads:read` / `leads:write`: Read or create/edit leads.
   - `meetings:read` / `meetings:write`: Read or schedule/edit meetings.
   - `followups:read` / `followups:write`: Read or create/edit follow-ups.
   - Areas outside these (such as `/me`, `/statuses`, `/templates`) are not scope-guarded. Missing required scope returns HTTP 403.

### Server-Side Method & Scope Guard ([`src/lib/apiAuth.ts`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/apiAuth.ts))
When an API request arrives, [`authorizeApiRequest`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/apiAuth.ts) checks:
```typescript
// Read-only key check
if (key.scope === "read_only" && !isSafeMethod(req.method)) {
  return { error: NextResponse.json({ error: "This API key is read-only." }, { status: 403 }) };
}
// Fine-grained area scope check
if (key.scopes) {
  const need = requiredScope(req.nextUrl?.pathname ?? "", req.method);
  if (need && !key.scopes.includes(need)) {
    return { error: NextResponse.json({ error: `This API key doesn't have the "${need}" scope.` }, { status: 403 }) };
  }
}
```

---

## 6. High-Throughput Rate Limiting & Monthly Quotas

### Sliding-Window Rate Limiting
- Budget: **600 requests per 60 seconds per API key**.
- Evaluated via [`RateLimiter.checkLimit(`apiv1:apikey:${key.id}`, 600, 60)`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/rate-limit.ts).
- If exhausted, returns HTTP 429 Too Many Requests with standard rate limit headers.

### Monthly Plan Quotas
In addition to the per-minute rate limit, API keys are metered against the workspace's monthly plan quota:
- **Free:** 10,000 requests/month
- **Starter:** 300,000 requests/month
- **Unlimited:** 3,000,000 requests/month
- First-party mobile app requests are exempt from monthly quota counting.
- Once exceeded, requests return HTTP 429 (`code: "api_quota_exceeded"`).

### Lock-Free Telemetry Throttling ([`ApiKeyService.touchLastUsed`](file:///Users/naveenadicharla/Documents/ridhzo/src/domains/apiKeys/service.ts#L74))
Writing `lastUsedAt = NOW()` to PostgreSQL on every single API request causes severe database row lock contention and write amplification under heavy throughput.

Ridhzo implements a fire-and-forget write-throttle:
```typescript
const USAGE_WRITE_THROTTLE_MS = 60_000; // 1 minute

static touchLastUsed(id: string): void {
  const cutoff = new Date(Date.now() - USAGE_WRITE_THROTTLE_MS);
  void db
    .update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(and(
      eq(apiKeys.id, id),
      or(isNull(apiKeys.lastUsedAt), lt(apiKeys.lastUsedAt, cutoff))
    ))
    .catch(() => {});
}
```
- Only writes to the database if `lastUsedAt` is null or older than 60 seconds.
- Dispatched asynchronously without blocking the API request's critical response path.

---

## 7. REST API v1 Endpoints Catalog

All v1 endpoints authenticate via the `Authorization: Bearer <key>` header:

### 1. List Leads (`GET /api/v1/leads`)
Queries the organization's lead database with pagination and search:
```bash
curl -X GET "https://crm.yourdomain.com/api/v1/leads?limit=50&status=active&search=Johnson" \
  -H "Authorization: Bearer pk_4f9a8b1c2d3e..."
```

**Query Parameters**:
- `limit`: Number of records (1 to 200, default 50).
- `status`: Filter by status key (`new`, `active`, `won`, `lost`, or custom status).
- `search`: Case-insensitive search across name, email, company, or normalized phone digits.
- `deleted`: Pass `deleted=1` to query the soft-deleted recycle bin.

### 2. Ingest Lead (`POST /api/v1/leads`)
Creates a new lead record with automated custom field validation:
```bash
curl -X POST "https://crm.yourdomain.com/api/v1/leads" \
  -H "Authorization: Bearer pk_4f9a8b1c2d3e..." \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Sarah Connor",
    "email": "sarah@cyberdyne.com",
    "phone": "+13105550144",
    "company": "Cyberdyne Systems",
    "customData": {
      "budget": 75000,
      "project_scope": "Enterprise Migration"
    }
  }'
```

**Processing Steps**:
1. Asserts subscription lead capacity via [`PlanService.assertCanAddLead`](file:///Users/naveenadicharla/Documents/ridhzo/src/domains/billing/planService.ts).
2. Validates and coerces `customData` via [`CustomFieldService.validate`](file:///Users/naveenadicharla/Documents/ridhzo/src/domains/customFields/service.ts).
3. Inserts lead and executes organization assignment routing rules.
4. Returns HTTP 201 Created with the serialized lead object.

---

## 8. Complete Code & Symbol Reference

### Frontend Components & Views
- [`ApiKeysPage`](file:///Users/naveenadicharla/Documents/ridhzo/src/app/(dashboard)/settings/api/page.tsx): Route handler checking `api.manage` permissions and pre-fetching API keys.
- [`ApiKeysManager`](file:///Users/naveenadicharla/Documents/ridhzo/src/components/settings/ApiKeysManager.tsx): Client-side manager rendering provisioning form, one-time secret modal, and key cards.

### Server Actions
- [`listApiKeysAction`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/apiKeys.ts#L10): Fetches active and revoked keys for the authenticated organization.
- [`createApiKeyAction`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/apiKeys.ts#L15): Provisions a new API key and returns the raw secret once.
- [`revokeApiKeyAction`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/apiKeys.ts#L31): Sets `revokedAt = now()` to disable an API key.
- [`deleteApiKeyAction`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/apiKeys.ts#L44): Permanently deletes an API key record.

### Gateway & Domain Services
- [`authorizeApiRequest`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/apiAuth.ts#L20): Central authorization middleware verifying Bearer tokens, scopes, and rate limits.
- [`ApiKeyService`](file:///Users/naveenadicharla/Documents/ridhzo/src/domains/apiKeys/service.ts): Domain service managing token hashing, verification, and throttled telemetry updates.
- [`/api/v1/leads/route.ts`](file:///Users/naveenadicharla/Documents/ridhzo/src/app/api/v1/leads/route.ts): Public REST API endpoint for querying and creating leads.
- [`apiKeys`](file:///Users/naveenadicharla/Documents/ridhzo/src/db/schema/system.ts): Drizzle ORM table storing key hashes, prefixes, scopes, and usage timestamps.
