# Settings, Team & Integrations

Settings overview, statuses, users & roles, custom fields, lead intelligence, API access, outbound webhooks, profile.

> Consolidated from 12 source file(s). Content is verbatim; headings are nested two levels deeper under each section. Edit the original files if they still exist, then regenerate.

## Contents

1. [Settings Hub Overview (`/settings`)](#1-settings-hub-overview-settings) — `docs/SETTINGS_OVERVIEW.md`
2. [Settings: General & Statuses Hub (`/settings`)](#2-settings-general--statuses-hub-settings) — `docs/SETTINGS_GENERAL_AND_STATUSES.md`
3. [Settings: Users & Roles Hub (`/settings/users`)](#3-settings-users--roles-hub-settingsusers) — `docs/SETTINGS_USERS_AND_ROLES.md`
4. [Settings: Custom Fields Hub (`/settings/custom-fields`)](#4-settings-custom-fields-hub-settingscustom-fields) — `docs/SETTINGS_CUSTOM_FIELDS.md`
5. [Settings: Lead Intelligence (`/settings/lead-intelligence`)](#5-settings-lead-intelligence-settingslead-intelligence) — `docs/SETTINGS_LEAD_INTELLIGENCE.md`
6. [Settings: API Access Hub (`/settings/api`)](#6-settings-api-access-hub-settingsapi) — `docs/SETTINGS_API_ACCESS.md`
7. [Settings: Outbound Webhooks (`/settings/webhooks`)](#7-settings-outbound-webhooks-settingswebhooks) — `docs/SETTINGS_OUTBOUND_WEBHOOKS.md`
8. [User Profile & Account Preferences (`/profile`)](#8-user-profile--account-preferences-profile) — `docs/USER_PROFILE.md`
9. [Team Management, Roles & Security](#9-team-management-roles--security) — `docs/product-kb/17_TEAM_ROLES_SECURITY.md`
10. [Integrations, API & Webhooks](#10-integrations-api--webhooks) — `docs/product-kb/18_INTEGRATIONS_API_WEBHOOKS.md`
11. [Ridhzo REST API (`/api/v1`)](#11-ridhzo-rest-api-apiv1) — `docs/API_V1.md`
12. [Outbound webhooks — events & payloads](#12-outbound-webhooks--events--payloads) — `docs/OUTBOUND_WEBHOOK_EVENTS.md`

---

## 1. Settings Hub Overview (`/settings`)

> Source: `docs/SETTINGS_OVERVIEW.md`

### Settings Hub Overview (`/settings`)

#### 1. Executive Summary & Layout Structure

The **Settings Hub** (`/settings`) is the administrative control center of Ridhzo CRM. It coordinates all organization-wide configuration, data taxonomies, messaging templates, security controls, and third-party integrations.

The route is structured as a two-column responsive grid:
- **Left Column (Navigation Sidebar):** A persistent 13-item navigation list categorizing every configuration surface in the platform.
- **Right Column (Main Canvas):** Hosts the **General & Statuses** configuration interface by default, displaying company identity, business context preambles for AI features, timezone/currency localization, quiet hours, and pipeline stage taxonomies.

---

#### 2. File & Route Architecture

| Purpose | File Path |
| :--- | :--- |
| **Settings Directory Page** | [`src/app/(dashboard)/settings/page.tsx`](file:///Users/naveenadicharla/Documents/ridhzo/src/app/(dashboard)/settings/page.tsx) |
| **General Settings Form** | [`src/components/settings/GeneralSettingsForm.tsx`](file:///Users/naveenadicharla/Documents/ridhzo/src/components/settings/GeneralSettingsForm.tsx) |
| **Organization Server Action** | [`src/lib/actions/organizations.ts`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/organizations.ts) |
| **Role-Based Access Control** | [`src/lib/rbac.ts`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/rbac.ts) |

---

#### 3. Master Settings Navigation Map (13 Dedicated Surfaces)

The sidebar provides direct access to all 13 specialized administrative settings sections:

```
Settings Hub (/settings)
 ├── 1. General & Statuses (/settings) ─── Company profile, AI context, quiet hours, pipeline statuses
 ├── 2. Lead Sources (/settings/sources) ─── Meta Ads, Google Ads, Webhooks, Hosted Web Forms
 ├── 3. Message Templates (/settings/templates) ─── WhatsApp, Email, and SMS quick templates
 ├── 4. Users & Roles (/settings/users) ─── Team members, 13-permission RBAC roles, invites
 ├── 5. Custom Fields (/settings/custom-fields) ─── 10 field types, sections, privacy rules
 ├── 6. API Access (/settings/api) ─── Bearer API tokens (pk_), scopes, rate limits
 ├── 7. Email (SMTP) (/settings/email) ─── Custom SMTP host/port/creds with Resend fallback
 ├── 8. Lead Intelligence (/settings/lead-intelligence) ─── Data enrichment, inbound email, Meta CAPI
 ├── 9. Outbound Webhooks (/settings/webhooks) ─── Event subscriptions, HMAC-SHA256 signing, DLQ
 ├── 10. New-lead alerts (/settings/distribution) ─── Alert people (email / in-app / WhatsApp) about matching new leads
 ├── 11. Audit Log (/settings/audit) ─── Chronological compliance trail for security events
 ├── 12. Billing & Plan (/settings/billing) ─── Subscription tiers, seat count, invoices
 └── 13. Integrations (/settings/integrations) ─── Connected apps and ecosystem connectors
```

##### Detailed Section Directory:

| Section | Route | Primary Documentation | Key Features |
| :--- | :--- | :--- | :--- |
| **General & Statuses** | `/settings` | [`SETTINGS_GENERAL_AND_STATUSES.md`](file:///Users/naveenadicharla/Documents/ridhzo/docs/SETTINGS_GENERAL_AND_STATUSES.md) | Company name, AI business context, currency, timezone, quiet hours, status lifecycle taxonomy. |
| **Lead Sources** | `/settings/sources` | [`SETTINGS_SOURCES.md`](file:///Users/naveenadicharla/Documents/ridhzo/docs/SETTINGS_SOURCES.md) | Facebook Ads, Google Ads, Website Webhook, Hosted Web Forms, and roadmap channels. |
| **Message Templates** | `/settings/templates` | [`SETTINGS_MESSAGE_TEMPLATES.md`](file:///Users/naveenadicharla/Documents/ridhzo/docs/SETTINGS_MESSAGE_TEMPLATES.md) | Reusable WhatsApp/Email/SMS templates with variable interpolation (`{{first_name}}`, `{{company}}`). |
| **Users & Roles** | `/settings/users` | [`SETTINGS_USERS_AND_ROLES.md`](file:///Users/naveenadicharla/Documents/ridhzo/docs/SETTINGS_USERS_AND_ROLES.md) | 13-permission RBAC matrix, team grouping, tokenized email invites with copy fallback. |
| **Custom Fields** | `/settings/custom-fields` | [`SETTINGS_CUSTOM_FIELDS.md`](file:///Users/naveenadicharla/Documents/ridhzo/docs/SETTINGS_CUSTOM_FIELDS.md) | 10 data types, tab section/subsection nesting, table column visibility, admin-only privacy. |
| **API Access** | `/settings/api` | [`SETTINGS_API_ACCESS.md`](file:///Users/naveenadicharla/Documents/ridhzo/docs/SETTINGS_API_ACCESS.md) | Cryptographic Bearer keys (`pk_`), SHA-256 one-way hashing, read-only vs full scopes, 600 req/min limits. |
| **Email (SMTP)** | `/settings/email` | [`SETTINGS_EMAIL_SMTP.md`](file:///Users/naveenadicharla/Documents/ridhzo/docs/SETTINGS_EMAIL_SMTP.md) | Custom SMTP transport, AES-256-GCM encryption, dual-transport mailer with Resend fallback. |
| **Lead Intelligence** | `/settings/lead-intelligence` | [`SETTINGS_LEAD_INTELLIGENCE.md`](file:///Users/naveenadicharla/Documents/ridhzo/docs/SETTINGS_LEAD_INTELLIGENCE.md) | Third-party enrichment, inbound email webhook parse, Meta CAPI & Conversion Leads postbacks. |
| **Outbound Webhooks** | `/settings/webhooks` | [`SETTINGS_OUTBOUND_WEBHOOKS.md`](file:///Users/naveenadicharla/Documents/ridhzo/docs/SETTINGS_OUTBOUND_WEBHOOKS.md) | Outbound JSON webhook POSTs, SSRF protection, HMAC signing, BullMQ retries, DLQ management. |
| **New-lead alerts** | `/settings/distribution` | — | Rules (source + conditions) that alert recipients by email, in-app or WhatsApp when a matching lead arrives; "everyone" or taking turns. Alerts only — owner assignment lives on Sources. Requires `api.manage`. |
| **Audit Log** | `/settings/audit` | *(Planned)* | Immutable record of user actions, auth events, secret reveals, and configuration changes. |
| **Billing & Plan** | `/settings/billing` | *(Planned)* | Stripe billing portal, seat allocation, subscription tiers. |
| **Integrations** | `/settings/integrations` | *(Planned)* | Master dashboard for active third-party connections. |

---

#### 4. Role-Based Access Control (RBAC)

Access to the settings hub and its sub-pages is strictly enforced server-side:
- **`settings.manage`:** Required to view and modify General Settings, Lead Sources, Message Templates, Custom Fields, and Lead Intelligence.
- **`users.manage` / `users.view`:** Required to view or manage Users & Roles.
- **`api.manage`:** Required to generate or revoke API keys and manage Outbound Webhooks.
- **Unauthorized Handling:** Users lacking required permissions are automatically redirected to `/leads`.

---

## 2. Settings: General & Statuses Hub (`/settings`)

> Source: `docs/SETTINGS_GENERAL_AND_STATUSES.md`

### Settings: General & Statuses Hub (`/settings`)

The **General & Statuses** settings hub is Ridhzo's foundational administrative command center. Located at [`src/app/(dashboard)/settings/page.tsx`](file:///Users/naveenadicharla/Documents/ridhzo/src/app/(dashboard)/settings/page.tsx) and managed by [`GeneralSettingsForm.tsx`](file:///Users/naveenadicharla/Documents/ridhzo/src/components/settings/GeneralSettingsForm.tsx), this surface governs the workspace's core identity, localization, lead capture policies, quiet hours, WhatsApp dispatch engines, AI knowledge context, and custom pipeline status schemas.

---

#### 1. Executive Summary & Business Value

In a multi-tenant CRM, an organization's configuration directly impacts data consistency, pipeline velocity, and team compliance:

1. **Global Localization & Time Synchronization**: Accurately normalizes schedules, analytics, quiet hours, and currency across global sales teams and international leads.
2. **AI Business Context Ingestion**: Equips Ridhzo's AI assists with deep business domain awareness (offerings, target personas, communication guidelines) to generate hyper-personalized message drafts and summaries.
3. **Optimistic Concurrency & Audit Accountability**: Protects settings against concurrent overwrites by multiple administrators using timestamp versioning, while logging granular `{ old, new }` diffs to the immutable audit trail.
4. **Dynamic Pipeline Status Taxonomy**: Allows businesses to customize their sales stages (colors, labels, categories) while enforcing database-level integrity checks that prevent orphaned leads or broken automation triggers.
5. **Stage Duration Telemetry**: Built-in analytics measure average and median hours spent in each stage to pinpoint sales pipeline bottlenecks.

---

#### 2. Technical Architecture & Component Flow

```
+----------------------------------------------------------------------------------------------------+
|                                      SETTINGS HUB ROUTE & SHELL                                    |
|                                                                                                    |
|  Server Component: src/app/(dashboard)/settings/page.tsx                                           |
|  Auth & Permissions: requirePermission("settings.manage")                                          |
|  Data Pre-fetch: getOrganizationAction() -> OrgService.getOrganization(organizationId)             |
+----------------------------------------------------------------------------------------------------+
                                                |
                        +-----------------------+-----------------------+
                        |                                               |
                        v                                               v
+-----------------------------------------------+   +-----------------------------------------------+
|             GENERAL SETTINGS FORM             |   |            STATUS MANAGEMENT MODAL            |
|                                               |   |                                               |
|  Component: GeneralSettingsForm.tsx           |   |  Component: StatusManagementModal.tsx         |
|                                               |   |                                               |
|  * Company Identity & Office Address          |   |  * Tab 1: Custom Status Taxonomy Schema       |
|  * AI Business Context (AiContextDialog.tsx)  |   |    - Colors, Labels, System Keys, Categories  |
|  * Localisation (Timezone, Locale, Currency)  |   |    - Deletion Safety Guards (Leads & Actions) |
|  * SLA Escalation Hours & Quiet Hours Window  |   |  * Tab 2: Stage Duration Analytics            |
|  * WhatsApp Dispatch Mode (Personal vs. BSP)  |   |    - LeadStatusService.getDurationAnalytics() |
|  * Required Lead Ingestion Fields             |   |    - Average & Median Hours in Stage          |
+-----------------------------------------------+   +-----------------------------------------------+
                        |                                               |
                        v                                               v
+----------------------------------------------------------------------------------------------------+
|                                    BACKEND ACTIONS & SERVICES                                      |
|                                                                                                    |
|  * updateOrganizationAction(): Zod validation, optimistic concurrency check, audit logging          |
|  * addOrUpdateStatusAction(): CustomStatusSchemaService upsert with system default protection       |
|  * deleteCustomStatusAction(): Rejects if leads or automations reference the status key             |
|  * AuditService.log(): Records metadata.values { old, new } for low-cardinality operational fields  |
+----------------------------------------------------------------------------------------------------+
```

---

#### 3. UI Layout & Visual Hierarchy

The settings surface is split into a 4-column responsive layout (`grid grid-cols-1 lg:grid-cols-4 gap-8`):

##### A. Left Administrative Navigation Sidebar (`lg:col-span-1`)
Provides instant jumping across all 12 platform administrative surfaces:
1. **General & Statuses** (`/settings` - active highlight)
2. **Lead Sources** (`/settings/sources`)
3. **Message Templates** (`/settings/templates`)
4. **Users & Roles** (`/settings/users`)
5. **Custom Fields** (`/settings/custom-fields`)
6. **API Access** (`/settings/api`)
7. **Email (SMTP)** (`/settings/email`)
8. **Lead Intelligence** (`/settings/lead-intelligence`)
9. **Webhooks** (`/settings/webhooks`)
10. **New-lead alerts** (`/settings/distribution`)
11. **Audit Log** (`/settings/audit`)
12. **Billing & Plan** (`/settings/billing`)
13. **Integrations** (`/settings/integrations`)

##### B. Main Settings Canvas (`lg:col-span-3`)
Organized into discrete enterprise card sections with rounded 16px borders, dark-mode awareness, and subtle muted badges.

---

#### 4. Deep Dive: General Settings Form Sections

##### Section 1: Company Information & AI Business Knowledge
Captures high-level business profile data that powers client-facing communication and informs generative AI features.

```
+----------------------------------------------------------------------------------------------------+
|                                       COMPANY INFORMATION                                          |
+----------------------------------------------------------------------------------------------------+
|  Business Name *:  [ Acme Realty Global                               ]  [ Industry: Real Estate ] |
|  Phone:            [ +1 555 123 4567          ]  [ Website: https://acme.com                     ] |
|                                                                                                    |
|  What your business does (for AI):                                                                 |
|  +----------------------------------------------------------------------------------------------+  |
|  | We provide boutique residential real estate advisory in Austin, Texas. Specializing in       |  |
|  | luxury downtown condominiums and family estates in Westlake...                              |  |
|  +----------------------------------------------------------------------------------------------+  |
|  [ * Edit / improve (AiContextDialog) ]                                                            |
|                                                                                                    |
|  Street Address:   [ 100 Congress Ave, Suite 400                                                 ] |
|  City:             [ Austin                   ]  State / Province: [ TX                          ] |
|  Postal Code:      [ 78701                    ]  Country (2-letter): [ US                        ] |
|                                                                                                    |
|  Workspace Slug:   org-acme-realty               Subscription Plan: Enterprise Plan                |
+----------------------------------------------------------------------------------------------------+
```

###### AI Context Ingestion Engine ([`AiContextDialog.tsx`](file:///Users/naveenadicharla/Documents/ridhzo/src/components/settings/AiContextDialog.tsx))
- **Purpose**: Instead of generating generic sales replies, Ridhzo's AI message drafter, lead summarizer, and sequence generator refer to `organizations.aiContext` to understand the company's value proposition, tone, and offerings.
- **Document Text Extraction**: Admins can upload company pitch decks, brochures, or guidelines (PDF, DOCX, TXT up to 10MB). Handled via [`extractDocTextAction`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/aiContext.ts) using base64 encoding.
- **AI Improvement Assistant**: Clicking `Improve with AI` runs [`improveAiContextAction`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/aiContext.ts) to structure free-form text into concise instructions.
- **Sample Blueprint**: Offers a built-in baseline template outlining company overview, target audience, core offerings, differentiators, and tone constraints.

---

##### Section 2: Localization & Live Dynamic Preview
Ensures timestamps, currencies, and dates match the tenant's geographical location.

```
+----------------------------------------------------------------------------------------------------+
|                                           LOCALISATION                                             |
+----------------------------------------------------------------------------------------------------+
|  Timezone:      [ America/Chicago                     ] [ Locate Fixed (Auto-detect) ]             |
|  Language:      [ English (US) — en                   v ]                                          |
|  Currency:      [ USD — US Dollar ($)                 v ]                                          |
|  Date Format:   [ MM/DD/YYYY — 09/19/2026             v ]                                          |
|                                                                                                    |
|  Preview:       (Clock) 04:22 PM   (Calendar) 09/19/2026   (DollarSign) $1,234.50                  |
+----------------------------------------------------------------------------------------------------+
```

- **IANA Timezone Engine**: Populated via native browser `Intl.supportedValuesOf("timeZone")` with fallback to major international hubs. Includes an auto-detect button utilizing `Intl.DateTimeFormat().resolvedOptions().timeZone`.
- **Locale Selection**: Supports 9 primary enterprise locales (`en`, `en-GB`, `es`, `fr`, `de`, `pt`, `hi`, `ar`, `zh`).
- **Currency Normalization**: Configures default monetary symbols for deal pipelines and expected values (`USD`, `EUR`, `GBP`, `INR`, `AUD`, `CAD`, `SGD`, `AED`, `JPY`).
- **Date Formatting**: Allows selecting between `MM/DD/YYYY`, `DD/MM/YYYY`, `YYYY-MM-DD`, and `DD-MMM-YYYY`.
- **Live Formatter Preview**: Uses `Intl.DateTimeFormat` and `Intl.NumberFormat` with a 60-second ticker to render real-time previews of current time, date, and currency formatting.

---

##### Section 3: Lead Capture Policies & Workflow Rules
Configures system-wide operational parameters that govern lead ingestion, SLA alerting, quiet hours, and messaging gateways.

```
+----------------------------------------------------------------------------------------------------+
|                                     LEAD CAPTURE & WORKFLOW                                        |
+----------------------------------------------------------------------------------------------------+
|  SLA Escalation (hours):             [ 24                ]  (Alerts owner if unactioned)           |
|  Sequence Send Window (quiet hours): [ 09:00 ] to [ 18:00 ] (Defers outbound steps outside window) |
|  WhatsApp Sending:                   [ Personal number (one-tap, opens WhatsApp)                 v ]|
|                                                                                                    |
|  Required fields on new leads:                                                                     |
|  [ Lock Name (Required) ]  [ Check Email (Required) ]  [ Phone (Optional) ]  [ Company (Optional) ]|
+----------------------------------------------------------------------------------------------------+
```

###### 1. SLA Escalation Window (`slaHours`)
- Sets the maximum permissible window (in hours) a new inbound lead can remain without sales rep outreach.
- When elapsed, Ridhzo triggers automatic manager escalations and highlights the lead as overdue on executive dashboards. Blank disables SLA tracking.

###### 2. Sequence Quiet Hours (`sequenceWindowStart` & `sequenceWindowEnd`)
- Bounded between 0–23 and 1–24 in the organization's local timezone.
- Prevents automated drip steps from firing late at night or early in the morning.
- Steps scheduled outside the window are deferred by `resolveNextSendableAt()` to the start of the next compliant window.

###### 3. WhatsApp Dispatch Mode (`whatsappMode`)
- **Personal (`personal`)**: One-tap deep link (`https://wa.me/{phone}?text={encoded_message}`). Reps click to open WhatsApp on desktop or mobile and send from their personal/work phone.
- **Business API (`bsp`)**: In-app direct sending via Meta Cloud API or Business Solution Provider (BSP) for centralized multi-agent teams.

###### 4. Mandatory Field Enforcement (`requiredLeadFields`)
- `name` is hard-locked as required across all tenant accounts.
- `email`, `phone`, and `company` can be toggled on or off as required fields for lead creation across web forms, manual triage, and imports.

---

#### 5. Optimistic Concurrency & Audit Accountability

##### Optimistic Concurrency Control
In team environments, multiple administrators may open settings concurrently. To prevent accidental overwrite collisions:
1. When the form loads, it captures `organization.updatedAt` as `expectedUpdatedAt`.
2. When saving, `updateOrganizationAction` compares `expectedUpdatedAt` with the live database record:
   ```typescript
   if (expected && current.updatedAt.getTime() !== expected.getTime()) {
     return fail("CONFLICT", "Settings were modified by another user. Please refresh and try again.");
   }
   ```
3. If another admin updated settings in the interim, the save is rejected with a descriptive conflict notification, protecting configuration integrity.

##### Granular Audit Trail Logging
When changes are successfully persisted, Ridhzo calculates a shallow diff between previous and new states:
- Operational fields (`timezone`, `locale`, `currency`, `dateFormat`, `slaHours`, `whatsappMode`, `sequenceWindowStart`, `sequenceWindowEnd`, `requiredLeadFields`) are logged with exact `{ old, new }` values into `audit_logs`.
- Sensitive or high-cardinality fields (`aiContext`, phone, address) are noted in `changedFields` without persisting raw text, preserving privacy and keeping the audit log performant.

---

#### 6. Custom Lead Status Taxonomy & Analytics ([`StatusManagementModal.tsx`](file:///Users/naveenadicharla/Documents/ridhzo/src/components/leads/StatusManagementModal.tsx))

Clicking **Lead Status Schema & Analytics** opens a modal containing status taxonomy tools and residence duration metrics.

```
+----------------------------------------------------------------------------------------------------+
|                                LEAD STATUS SCHEMA & ANALYTICS                                      |
+----------------------------------------------------------------------------------------------------+
|  [ Custom Status Schema (Active Tab) ]         [ Stage Duration Analytics Tab ]                    |
|                                                                                                    |
|  Active Statuses:                                                                                  |
|  (o) New           (new)          Category: Open              [ Edit ]  [ System ]                 |
|  (o) Active        (active)       Category: In Progress       [ Edit ]  [ System ]                 |
|  (o) Proposal Sent (proposal)     Category: In Progress       [ Edit ]  [ Delete ]                 |
|  (o) Won           (won)          Category: Closed Won        [ Edit ]  [ System ]                 |
|  (o) Lost          (lost)         Category: Closed Lost       [ Edit ]  [ System ]                 |
|  (o) Unqualified   (unqualified)  Category: Unqualified       [ Edit ]  [ System ]                 |
+----------------------------------------------------------------------------------------------------+
|  Add / Update Status Form:                                                                         |
|  Display Label:  [ Proposal Sent           ]  System Key:   [ proposal_sent       ]                |
|  Category:       [ In Progress           v ]  Badge Color:  [ #8B5CF6 ] [ Hex Code ]               |
|                                                                                                    |
|  [ Save Status Configuration ]                                                                     |
+----------------------------------------------------------------------------------------------------+
```

##### A. Status Categories & System Default Protection
Every status is grouped into one of five functional categories:
1. `open`: Fresh inquiries awaiting first contact.
2. `in_progress`: Actively worked leads (demos, proposals, discussions).
3. `won`: Successfully converted deals (triggers revenue accounting and wins).
4. `lost`: Lost prospects (prompts for loss reason analysis).
5. `unqualified`: Spam, out-of-region, or non-viable inquiries.

###### System Default Immunity
- Default statuses (`new`, `active`, `won`, `lost`, `unqualified`) are seeded on workspace creation.
- System defaults **cannot be deleted**, ensuring core CRM logic, Kanban boards, and funnel analytics always have baseline anchors.
- Display labels and badge colors of system defaults can be customized freely, but their underlying category remains locked to safeguard conversion calculations.

##### B. Deletion Integrity & Orphan Prevention Guards
Before deleting a custom status via [`deleteCustomStatusAction`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/customStatuses.ts#L48), [`CustomStatusSchemaService.deleteCustomStatus`](file:///Users/naveenadicharla/Documents/ridhzo/src/domains/leads/customStatusSchemaService.ts#L202) enforces two safety checks:

```typescript
// Guard 1: Prevent stranding active leads
const [{ inUse }] = await db
  .select({ inUse: count() })
  .from(leads)
  .where(and(eq(leads.organizationId, organizationId), eq(leads.status, statusKey), isNull(leads.deletedAt)));

if (Number(inUse) > 0) {
  throw new Error(`${inUse} lead(s) still use this status. Move them to another status before deleting it.`);
}

// Guard 2: Prevent breaking automated workflow actions
const [{ refs }] = await db
  .select({ refs: count() })
  .from(automationActions)
  .innerJoin(automations, eq(automationActions.automationId, automations.id))
  .where(and(
    eq(automations.organizationId, organizationId),
    eq(automationActions.type, "change_status"),
    sql`${automationActions.config}->>'status' = ${statusKey}`
  ));

if (Number(refs) > 0) {
  throw new Error(`${refs} automation(s) set leads to this status. Update those automations before deleting it.`);
}
```

Active leads must be migrated and automations updated before a status can be removed, preventing orphaned data or silent automation failures.

---

##### C. Stage Duration Analytics
The **Stage Duration Analytics** tab measures pipeline velocity by analyzing historical transitions from `lead_status_history`:

```
+----------------------------------------------------------------------------------------------------+
|                                AVERAGE STAGE RESIDENCE DURATION                                    |
+----------------------------------------------------------------------------------------------------+
|  New             482 lead transitions evaluated           1.4 hrs avg          0.8 hrs median      |
|  Active          310 lead transitions evaluated          26.5 hrs avg         18.2 hrs median      |
|  Proposal Sent   145 lead transitions evaluated          72.1 hrs avg         48.0 hrs median      |
|  Negotiation      88 lead transitions evaluated          96.4 hrs avg         64.5 hrs median      |
+----------------------------------------------------------------------------------------------------+
```

- Calculates **average** and **median** residence duration in hours for every custom and system status.
- Highlights bottlenecks where prospects linger without progressing.
- Uses median metrics alongside averages to prevent skew from outlier stale leads.

---

#### 7. Complete Code & Symbol Reference

##### Frontend Components & Views
- [`SettingsPage`](file:///Users/naveenadicharla/Documents/ridhzo/src/app/(dashboard)/settings/page.tsx): Main server layout rendering navigation sidebar and settings form.
- [`GeneralSettingsForm`](file:///Users/naveenadicharla/Documents/ridhzo/src/components/settings/GeneralSettingsForm.tsx): Client-side form handling company info, localization previews, quiet hours, and unsaved changes warnings.
- [`StatusManagementModal`](file:///Users/naveenadicharla/Documents/ridhzo/src/components/leads/StatusManagementModal.tsx): Tabbed modal for custom status taxonomy management and stage residence analytics.
- [`AiContextDialog`](file:///Users/naveenadicharla/Documents/ridhzo/src/components/settings/AiContextDialog.tsx): Dialog for editing AI business context, document text extraction, and AI rewrites.

##### Server Actions
- [`getOrganizationAction`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/organizations.ts#L78): Retrieves organization settings for the authenticated tenant.
- [`updateOrganizationAction`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/organizations.ts#L91): Validates and updates organization profile with optimistic concurrency and audit logging.
- [`getTenantStatusSchemaAction`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/customStatuses.ts#L19): Fetches or seeds the tenant's custom status taxonomy.
- [`addOrUpdateStatusAction`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/customStatuses.ts#L24): Creates or updates custom pipeline statuses.
- [`deleteCustomStatusAction`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/customStatuses.ts#L48): Deletes custom statuses with lead count and automation reference guards.
- [`getStatusDurationAnalyticsAction`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/customStatuses.ts#L87): Computes average and median hours spent per stage.
- [`extractDocTextAction`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/aiContext.ts): Extracts text content from uploaded business documents.
- [`improveAiContextAction`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/aiContext.ts): Uses LLM to refine and structure company context for CRM AI features.

##### Domain Services & Database Tables
- [`OrgService`](file:///Users/naveenadicharla/Documents/ridhzo/src/domains/organizations/service.ts): Data layer for tenant organization configuration and concurrency checks.
- [`CustomStatusSchemaService`](file:///Users/naveenadicharla/Documents/ridhzo/src/domains/leads/customStatusSchemaService.ts): Manages status configurations, base category mappings, and deletion validation.
- [`LeadStatusService`](file:///Users/naveenadicharla/Documents/ridhzo/src/domains/leads/leadStatusService.ts): Aggregates stage duration analytics from lead status history logs.
- [`AuditService`](file:///Users/naveenadicharla/Documents/ridhzo/src/domains/audit/service.ts): Writes immutable audit entries with operational field diffs.
- [`customStatusConfigs`](file:///Users/naveenadicharla/Documents/ridhzo/src/db/schema/leads.ts): Database schema storing status keys, labels, colors, categories, and order indexes.
- [`organizations`](file:///Users/naveenadicharla/Documents/ridhzo/src/db/schema/organizations.ts): Database schema storing company details, localization, quiet hours, and AI context.

---

## 3. Settings: Users & Roles Hub (`/settings/users`)

> Source: `docs/SETTINGS_USERS_AND_ROLES.md`

### Settings: Users & Roles Hub (`/settings/users`)

The **Users & Roles Hub** is Ridhzo's identity and access management command center. Located at [`src/app/(dashboard)/settings/users/page.tsx`](file:///Users/naveenadicharla/Documents/ridhzo/src/app/(dashboard)/settings/users/page.tsx) and orchestrated by [`UsersManager.tsx`](file:///Users/naveenadicharla/Documents/ridhzo/src/components/users/UsersManager.tsx) and [`RolesManager.tsx`](file:///Users/naveenadicharla/Documents/ridhzo/src/components/users/RolesManager.tsx), this surface governs sales team onboarding, team segmentation, custom role-based access control (RBAC), and user lifecycle states.

---

#### 1. Executive Summary & Business Value

In high-velocity multi-rep sales environments, granular permission controls protect pipeline data while streamlining collaboration:

1. **Granular RBAC Security**: Replaces crude "all-or-nothing" access with a 13-permission capability matrix. Sales managers can restrict lead deletion, purge rights, API key access, or audit visibility to specific roles.
2. **Zero-Trust Self-Protection**: Admins cannot accidentally lock themselves out—system-level protections block self-deactivation, self-deletion, and self-role demotion.
3. **Frictionless Onboarding (Email, WhatsApp & Direct Links)**: Supports tokenized email invitations, direct WhatsApp invitation sharing, manual copyable invite links, and direct administrator provisioning for immediate call center onboarding.
4. **Guided Profile Completion (`ProfileGapsBanner`)**: A persistent contextual banner alerts team members when essential contact data (phone number, WhatsApp contact, operational timezone) is missing, ensuring automated call logs and outbound WhatsApp templates work seamlessly.
5. **Phone Number Sign-In & Management**: Users can log in using their mobile phone number (with international country code picker) and password or OTP, alongside email and Google sign-in.
6. **Resilient Invitation Fallback**: If corporate SMTP delivery is unconfigured or blocked by email filters, Ridhzo generates a secure one-click join link for administrators to share manually via Slack or WhatsApp.
7. **Team-Based Sales Segmentation**: Groups sales reps into functional squads (e.g., *Inbound SDRs*, *Enterprise AEs*, *Commercial Team*) to feed automated round-robin distribution rules.
8. **Soft-Delete Orphan Prevention**: Departing employees are soft-deleted (`deleted_at`), preserving all historical customer notes, activity logs, closed deals, and audit trails.

---

#### 2. Technical Architecture & Access Control Flow

```
+----------------------------------------------------------------------------------------------------+
|                                     USERS & ROLES ROUTE GUARD                                      |
|                                                                                                    |
|  Server Route: src/app/(dashboard)/settings/users/page.tsx                                         |
|  Authorization Guard: if (!hasPermission("users.manage")) redirect("/leads")                      |
|  Role Management Gate: canManageRoles = hasPermission("roles.manage")                              |
+----------------------------------------------------------------------------------------------------+
                                                |
                        +-----------------------+-----------------------+
                        |                                               |
                        v                                               v
+-----------------------------------------------+   +-----------------------------------------------+
|             USERS & TEAMS MANAGER             |   |             ROLES & RBAC MANAGER              |
|                                               |   |                                               |
|  Component: UsersManager.tsx                  |   |  Component: RolesManager.tsx                  |
|                                               |   |                                               |
|  * Team Creation & Badges (createTeamAction)  |   |  * Custom Role Creation (createRoleAction)    |
|  * Email Inviter (inviteUserAction + SHA-256) |   |  * 13-Permission Checkbox Grid (PERMISSIONS)  |
|  * Direct Member Provisioning (createUser)    |   |  * Dynamic Permission Updates (updateRole)    |
|  * Pending Invites (with Copy Link fallback)  |   |  * System Role Lock (admin & member immune)   |
|  * Searchable Members List & Inline Assigners |   |  * Audit Log Recording (added / removed diffs)|
+-----------------------------------------------+   +-----------------------------------------------+
                        |                                               |
                        v                                               v
+----------------------------------------------------------------------------------------------------+
|                                      BACKEND ACTIONS & SERVICES                                    |
|                                                                                                    |
|  * PlanService.assertCanAddSeat(): Enforces subscription seat tier limits before inviting/creating |
|  * InvitationService.create(): Generates crypto token, stores SHA-256 tokenHash, sends email       |
|  * UserService.remove(): Sets deletedAt = now() (soft-delete preserves lead FK integrity)          |
|  * getActiveUsersCached: 60s unstable_cache invalidated by revalidateTag("active-users")           |
|  * AuditService.log(): Records user.create, user.invite, user.role_change, role.update             |
+----------------------------------------------------------------------------------------------------+
```

---

#### 3. UI Layout & Visual Hierarchy

The Users & Roles interface is structured into cohesive cards with high visual clarity:

##### A. Navigation & Header
- **Breadcrumb Link**: Ghost button linking back to `/settings`.
- **Title**: `Users & Roles`
- **Subtitle**: *"Invite teammates, assign roles, and manage access."*

##### B. Teams Management Card
- Displays active team badges (e.g., `Enterprise`, `Outbound`, `Real Estate Advisors`).
- Inline input with Enter-key submission and double-click prevention (`creatingTeam` guard).
- Calls [`createTeamAction`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/teams.ts).

##### C. Email Invitation Card
- Form fields: Recipient Email input + Role selector dropdown.
- **Join Link Copy Fallback**: If outbound SMTP is unconfigured or fails, the row remains in the pending list with an emerald **Copy link** button (`navigator.clipboard.writeText`), allowing manual distribution without blocking onboarding.

##### D. Direct Provisioning Card
- Collapsible form for immediate provisioning: First Name, Last Name, Email, Initial Password (validated $\ge$ 6 characters), and initial Role.
- Enforces subscription seat limits before creating the account.

##### E. Pending Invitations Table
- Renders pending invitations that have not yet been accepted (`accepted_at IS NULL`).
- Displays email, role badge, "Pending" status, expiration date (7 days from creation), and a revoke button (`revokeInvitationAction`).

##### F. Searchable Members Roster
- **Search Bar**: Real-time client-side filter querying first name, last name, and email.
- **Roster Rows**:
  - Full Name & Email.
  - Current User Indicator (`You` badge).
  - Status Badge (`Active` in green vs `Inactive` in muted gray).
  - **Inline Role Selector**: Dropdown to change roles on the fly (disabled for own account).
  - **Inline Team Selector**: Dropdown to reassign squads.
  - **Activation Toggle**: `Activate` / `Deactivate` button (disabled for self).
  - **Delete Action**: Trash button triggering soft deletion (disabled for self).

##### G. Custom Roles & Permissions Grid (`RolesManager.tsx`)
- Appears if the administrator has `roles.manage` permissions.
- Allows creating custom roles (e.g., *Sales Lead*, *Junior SDR*, *External Auditor*).
- Displays a 2-column checkbox grid of all 13 system permissions.

---

#### 4. Granular RBAC Permissions Catalog

Ridhzo's security architecture defines 13 granular permission keys in [`src/lib/permissions.ts`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/permissions.ts#L3):

```
+---------------------+-------------------------------------------------------+----------------------+
| Permission Key      | Functional Capability                                 | Default Assignments  |
+---------------------+-------------------------------------------------------+----------------------+
| users.manage        | Invite teammates, provision users, reassign teams/roles| Admin only           |
| roles.manage        | Create custom roles, toggle permissions, delete roles | Admin only           |
| settings.manage     | Update company profile, localization, quiet hours, SLA| Admin only           |
| sources.manage      | Connect Meta Lead Ads, Google Ads, generate webhooks  | Admin only           |
| templates.manage    | Author, edit, and delete canned message templates     | Admin only           |
| automations.manage  | Create, activate, and delete automated drip workflows  | Admin only           |
| leads.edit          | Create, edit, assign, and advance lead pipeline stages| Admin, Member        |
| leads.delete        | Soft-delete leads to the tenant recycle bin           | Admin only           |
| leads.purge         | Permanently purge leads / empty the recycle bin       | Admin only           |
| leads.merge         | Merge duplicate leads into a single master contact    | Admin only           |
| audit.view          | Inspect system audit logs, user actions, and diffs    | Admin only           |
| api.manage          | Generate and revoke programmatic REST API keys        | Admin only           |
| billing.manage      | Manage Stripe subscriptions, invoices, and seat tiers | Admin only           |
+---------------------+-------------------------------------------------------+----------------------+
```

##### System Roles vs. Custom Roles
1. **System Admin (`admin`)**:
   - Built-in shared system role (`organization_id = NULL`).
   - Implicitly possesses all 13 permissions. Cannot be edited or deleted.
2. **System Member (`member`)**:
   - Baseline working sales rep role.
   - Pre-configured with `leads.edit` only. Members can triage, contact, and move leads through the pipeline, but cannot delete records, view audit trails, or alter company settings.
3. **Custom Tenant Roles**:
   - Created with `organization_id = :orgId`.
   - Administrators toggle any combination of the 13 checkboxes.
   - *Example: A "View-Only Auditor" role is created by granting `audit.view` while leaving `leads.edit` unchecked.*

---

#### 5. User Lifecycle & Onboarding Workflows

```
                                  [Admin Initiates Onboarding]
                                               |
                     +-------------------------+-------------------------+
                     |                                                   |
                     v                                                   v
         [Method 1: Email Invite]                            [Method 2: Direct Creation]
                     |                                                   |
         - Asserts seat capacity                             - Asserts seat capacity
         - Generates random token                            - Validates email + password (>= 6 chars)
         - Hashes token via SHA-256                          - Hashes password via bcrypt
         - Inserts row into invitations                      - Inserts row into users (isActive: true)
         - Dispatches invite email                           - Emits audit log: user.create
                     |                                                   |
     +---------------+---------------+                                   v
     |                               |                        [Rep Logs In Immediately]
     v (Email Sent)                  v (Email Offline)
[User clicks email]         [Admin copies fallback link]
     |                               |
     +---------------+---------------+
                     |
                     v
         [Opens /invite/<token>]
         - Sets password & full name
         - Validates 7-day expiration
         - Creates user account & marks invite accepted
         - Emits audit log: user.invite_accepted
```

##### 1. Invitation Cryptography & Acceptance ([`src/lib/actions/invitations.ts`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/invitations.ts))
- When an invite is created, a high-entropy random token is generated.
- The raw token is sent in the URL (`/invite/{token}`).
- The database stores only the SHA-256 hash (`tokenHash`). Even if the database is inspected, pending invite tokens cannot be reverse-engineered.
- Tokens expire automatically after **7 days**.
- When accepted on [`/invite/[token]`](file:///Users/naveenadicharla/Documents/ridhzo/src/app/invite/%5Btoken%5D/page.tsx), the user sets their own password and name. The record is created with the pre-assigned `roleId` and tenant `organizationId`.

##### 2. Soft-Delete Orphan Prevention ([`src/lib/actions/users.ts#L117`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/users.ts#L117))
- Hard deleting a user would cause foreign key failures or set `assigned_to` and `created_by` columns to NULL across hundreds of leads, notes, and activity logs.
- [`UserService.remove`](file:///Users/naveenadicharla/Documents/ridhzo/src/domains/users/service.ts) executes a **soft-delete**:
  ```sql
  UPDATE users SET deleted_at = NOW(), is_active = FALSE WHERE id = :userId AND organization_id = :orgId;
  ```
- The rep is immediately barred from logging in and excluded from active user dropdowns, but historical customer interactions retain full attribution.

---

#### 6. Security, Self-Protection & Audit Accountability

To prevent administrative lockout and maintain audit compliance, the Users & Roles hub enforces strict server-side rules:

##### 1. Self-Protection Invariants ([`src/lib/actions/users.ts`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/users.ts))
If an administrator attempts an action targeting their own account:
- **Deactivation Guard**: `if (id === userId && !isActive) return fail("VALIDATION", "You can't deactivate your own account.");`
- **Role Demotion Guard**: `if (id === userId) return fail("VALIDATION", "You can't change your own role.");`
- **Deletion Guard**: `if (id === userId) return fail("VALIDATION", "You can't delete your own account.");`

##### 2. Seat Licensing Safeguard ([`PlanService.assertCanAddSeat`](file:///Users/naveenadicharla/Documents/ridhzo/src/domains/billing/planService.ts))
Before sending an invite or creating a user, Ridhzo verifies that active seats + pending invites do not exceed the tenant's purchased subscription plan. If exceeded, the action halts with a prompt to upgrade seats on `/settings/billing`.

##### 3. Active Users Cache Optimization
The active users list is consumed across lead assignment pickers, filter dropdowns, and mentions:
- Cached for 60 seconds per organization via Next.js `unstable_cache`.
- Cache tags (`["active-users"]`) are invalidated on user creation, deactivation, or deletion using `revalidateTag("active-users")`.

##### 4. Audit Log Integration
All identity modifications write immutable audit entries via [`AuditService.log`](file:///Users/naveenadicharla/Documents/ridhzo/src/domains/audit/service.ts):
- `user.create`: Records newly provisioned email.
- `user.invite`: Records invite recipient and email delivery status.
- `user.role_change`: Records target user and new `roleId`.
- `user.activate` / `user.deactivate`: Records state transition.
- `role.create` / `role.delete`: Records role metadata.
- `role.update`: Logs specific `added` and `removed` permission arrays.

---

#### 7. Complete Code & Symbol Reference

##### Frontend Components & Views
- [`UsersPage`](file:///Users/naveenadicharla/Documents/ridhzo/src/app/(dashboard)/settings/users/page.tsx): Main server component verifying permissions and pre-fetching users, teams, roles, and invites.
- [`UsersManager`](file:///Users/naveenadicharla/Documents/ridhzo/src/components/users/UsersManager.tsx): Client-side manager for teams, email invites, direct provisioning, and the members roster.
- [`RolesManager`](file:///Users/naveenadicharla/Documents/ridhzo/src/components/users/RolesManager.tsx): Interactive RBAC canvas rendering custom role cards and permission checkbox matrices.

##### Server Actions
- [`createUserAction`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/users.ts#L53): Provisions a new user account directly with bcrypt hashing.
- [`setUserActiveAction`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/users.ts#L76): Toggles user active state with self-deactivation protection.
- [`setUserTeamAction`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/users.ts#L91): Reassigns a user's sales squad.
- [`setUserRoleAction`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/users.ts#L103): Updates a user's RBAC role with self-demotion protection.
- [`deleteUserAction`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/users.ts#L117): Soft-deletes a user account.
- [`createTeamAction`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/teams.ts): Creates a new sales team squad.
- [`inviteUserAction`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/invitations.ts#L21): Dispatches secure email invitations with join-link fallback.
- [`revokeInvitationAction`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/invitations.ts#L62): Cancels a pending invitation.
- [`createRoleAction`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/roles.ts#L20): Creates a custom tenant role.
- [`updateRoleAction`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/roles.ts#L34): Updates permissions on custom roles and logs permission diffs.
- [`deleteRoleAction`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/roles.ts#L58): Removes a custom role.

##### Domain Services & Database Tables
- [`UserService`](file:///Users/naveenadicharla/Documents/ridhzo/src/domains/users/service.ts): Database service for user records and soft deletion.
- [`RoleService`](file:///Users/naveenadicharla/Documents/ridhzo/src/domains/roles/service.ts): Service managing system and custom tenant roles.
- [`TeamService`](file:///Users/naveenadicharla/Documents/ridhzo/src/domains/teams/service.ts): Service managing organization team squads.
- [`InvitationService`](file:///Users/naveenadicharla/Documents/ridhzo/src/domains/invitations/service.ts): Service managing tokens, hashing, and invite acceptance.
- [`PlanService`](file:///Users/naveenadicharla/Documents/ridhzo/src/domains/billing/planService.ts): Enforces seat counts and subscription constraints.
- [`users`](file:///Users/naveenadicharla/Documents/ridhzo/src/db/schema/users.ts#L26): Drizzle table storing member records, credentials, team/role IDs, and `deletedAt`.
- [`roles`](file:///Users/naveenadicharla/Documents/ridhzo/src/db/schema/users.ts#L8): Drizzle table storing custom and system roles and JSONB permissions.
- [`teams`](file:///Users/naveenadicharla/Documents/ridhzo/src/db/schema/users.ts#L18): Drizzle table storing organization team squads.
- [`invitations`](file:///Users/naveenadicharla/Documents/ridhzo/src/db/schema/system.ts#L85): Drizzle table storing SHA-256 hashed invite tokens and expiration timestamps.

---

## 4. Settings: Custom Fields Hub (`/settings/custom-fields`)

> Source: `docs/SETTINGS_CUSTOM_FIELDS.md`

### Settings: Custom Fields Hub (`/settings/custom-fields`)

The **Custom Fields Hub** is Ridhzo's dynamic schema configuration engine. Located at [`src/app/(dashboard)/settings/custom-fields/page.tsx`](file:///Users/naveenadicharla/Documents/ridhzo/src/app/(dashboard)/settings/custom-fields/page.tsx) and managed by [`CustomFieldsManager.tsx`](file:///Users/naveenadicharla/Documents/ridhzo/src/components/settings/CustomFieldsManager.tsx), this feature allows businesses to extend the CRM's core lead data model with industry-specific attributes, two-level tab groupings, strict data validation, and role-based field visibility.

---

#### 1. Executive Summary & Business Value

Every sales organization operates with proprietary qualification criteria that standard CRM schemas (name, email, phone) cannot capture:

1. **Industry-Tailored Qualification**: Real estate agencies track *Property Type* and *Budget*; driving schools track *License Category* and *Permit Number*; enterprise SaaS tracks *Tech Stack* and *Contract Value*.
2. **Tabbed Information Architecture**: Prevents sprawling, messy lead detail pages by grouping custom fields into custom **Tabs** (`section`) and **Sub-tabs** (`subsection`).
3. **Table Column Customization**: Any custom field flagged with `showOnTable = true` automatically appears as a sortable column in the primary `/leads` table view.
4. **Confidential Governance (Admin Only)**: Sensitive business data (e.g., *Commission Split*, *Credit Score*, *Internal Margin*) can be marked `adminOnly = true`, hiding it completely from standard sales reps.
5. **Strict Data Normalization**: Numbers, currencies, dates, URLs, and multi-select options are automatically validated and sanitized, ensuring clean, aggregatable reporting.

---

#### 2. Technical Architecture & Data Model

```
+----------------------------------------------------------------------------------------------------+
|                                      CUSTOM FIELDS ROUTE & RBAC                                    |
|                                                                                                    |
|  Server Route: src/app/(dashboard)/settings/custom-fields/page.tsx                                 |
|  Authorization Guard: if (!hasPermission("settings.manage")) redirect("/leads")                   |
|  Data Pre-fetch: CustomFieldService.list(organizationId)                                           |
+----------------------------------------------------------------------------------------------------+
                                                |
                                                v
+----------------------------------------------------------------------------------------------------+
|                                    CUSTOM FIELDS MANAGER CANVAS                                    |
|                                                                                                    |
|  Component: src/components/settings/CustomFieldsManager.tsx                                        |
|  - Field Creation Form: Label, Type, Options, Default Value, Tab (section), Sub-tab (subsection)   |
|  - Flags: Required, Show on table, Admin only, Disabled                                            |
|  - In-place Inline Editor: Real-time edits without modal interruption                              |
|  - Positional Reordering: Arrow up / down controls via reorderCustomFieldsAction                   |
+----------------------------------------------------------------------------------------------------+
                                                |
                        +-----------------------+-----------------------+
                        |                                               |
                        v                                               v
+-----------------------------------------------+   +-----------------------------------------------+
|             SCHEMA DEFINITIONS                |   |              VALUE PERSISTENCE                |
|                                               |   |                                               |
|  Table: custom_field_defs                     |   |  Table: leads.custom_data (JSONB)             |
|  - id: UUID (Primary Key)                     |   |                                               |
|  - organizationId: Tenant Scope               |   |  {                                            |
|  - key: Unique machine slug (e.g. "budget")   |   |    "property_budget": 750000,                 |
|  - type: 10 supported types                   |   |    "deal_type": "Commercial Lease",           |
|  - section / subsection: Two-level tabs       |   |    "amenities": ["Parking", "Balcony"]        |
|  - orderIndex: Integer for layout sorting     |   |  }                                            |
+-----------------------------------------------+   +-----------------------------------------------+
```

---

#### 3. UI Layout & Visual Hierarchy

The Custom Fields Hub is rendered within a centered, high-focus container (`max-w-4xl`):

##### A. Navigation & Header
- **Breadcrumb Link**: Ghost button with back arrow linking back to `/settings`.
- **Title**: `Custom Fields`
- **Subtitle**: *"Extra fields captured on every lead, specific to your business."*

##### B. Field Creation Card
Positioned at the top of the canvas, the authoring card provides immediate field creation:

```
+----------------------------------------------------------------------------------------------------+
|                                         ADD A CUSTOM FIELD                                         |
+----------------------------------------------------------------------------------------------------+
|  [ Field label: Property Budget        ]  [ Type: Currency (currency)                            v ]|
|  [ Default value: 500000                                                                         ] |
|  [ Tab / section: Deal Details         ]  [ Sub-tab: Financials                                  ] |
|                                                                                                    |
|  Tab & sub-tab group this field on the lead detail page. Leave blank to keep it under "Custom Attributes".|
|                                                                                                    |
|  [x] Required     [x] Show on table     [ ] Admin only     [ ] Disabled                            |
|                                                                                                    |
|                                                                               [ + Add field ]      |
+----------------------------------------------------------------------------------------------------+
```

- **Dynamic Options Row**: If `select` or `multiselect` is chosen, an options input dynamically expands (`"Options, comma-separated"`).
- **Tab Auto-Suggestions**: The `section` and `subsection` inputs hook into HTML `<datalist>` elements (`cf-sections` and `cf-subsections`), offering auto-complete suggestions based on previously created tabs.

##### C. Configured Fields Roster
Fields are rendered in a vertical card list ordered by `orderIndex`:
- **Label & Machine Key**: Displays the human-readable label alongside the machine slug in a monospace font (e.g., `budget_estimate`).
- **Metadata Badges**:
  - `Type`: Displays the data type badge (`text`, `number`, `currency`, `select`, etc.).
  - `Group`: Displays tab path (e.g., `Deal Details › Financials`).
  - `Status Flags`: Highlights `Required`, `On table`, `Admin only`, and `Disabled`.
- **Action Controls**:
  - `Move Up` / `Move Down` arrow buttons to reorder fields.
  - `Pencil Icon`: Expands in-place inline editing controls.
  - `Trash Icon`: Prompts for confirmation and executes field removal.

---

#### 4. The 10 Supported Data Types & Validation Logic

Ridhzo supports 10 distinct data types. Input validation is enforced by [`CustomFieldService.validate`](file:///Users/naveenadicharla/Documents/ridhzo/src/domains/customFields/service.ts#L133):

```
+---------------+------------------------+-----------------------------------------------------------+
| Field Type    | UI Form Element        | Validation & Normalization Rules                          |
+---------------+------------------------+-----------------------------------------------------------+
| text          | Single-line <Input>    | String trimmed to 2,000 characters.                       |
| textarea      | Multi-line <Textarea>  | Preserves line breaks and markdown formatting.            |
| number        | Numeric <Input>        | Strips commas; validates as a valid JavaScript Number.    |
| currency      | Numeric <Input>        | Strips currency symbols ($ € £ ₹) & commas; stores number.|
| date          | <input type="date">    | Validates strict ISO format: YYYY-MM-DD.                  |
| datetime      | datetime-local <input> | Validates ISO timestamp: YYYY-MM-DDTHH:mm(:ss)?.          |
| select        | Single <Select>        | Asserts submitted value exists in options whitelist.     |
| multiselect   | Multi-tag Picker       | Array of strings; asserts all values exist in whitelist.  |
| checkbox      | Toggle <input type=cb> | Coerces to true or false.                                 |
| url           | Web address <Input>    | Prepends https:// if missing; validates valid HTTP URL.   |
+---------------+------------------------+-----------------------------------------------------------+
```

##### Currency Normalization Example
When a user inputs `$1,250,000.50` into a `currency` custom field:
```typescript
const trimmed = typeof raw === "string" ? raw.trim().replace(/[$€£₹,\s]/g, "") : raw;
const num = Number(trimmed);
if (trimmed === "" || isNaN(num)) throw new FieldValidationError(`${def.label} must be a number`);
clean[def.key] = num; // Stored as integer/float: 1250000.5
```
By normalizing currency to raw numbers, Ridhzo enables sorting, mathematical aggregations, and pipeline value calculations.

---

#### 5. Two-Level Tab Grouping Architecture

To keep complex lead dossiers readable, Ridhzo supports two-level grouping:

```
[Lead Dossier Header]
|
+--- [Tab: Overview]
+--- [Tab: Deal Details] (Defined by customFieldDefs.section = "Deal Details")
|    |
|    +--- [Sub-tab: Property Specs] (subsection = "Property Specs")
|    |    - Square Footage (number)
|    |    - Year Built (number)
|    |    - Architectural Style (select)
|    |
|    +--- [Sub-tab: Financials] (subsection = "Financials")
|         - Asking Price (currency)
|         - HOA Fee Monthly (currency)
|         - Pre-approved (checkbox)
|
+--- [Tab: Custom Attributes] (Default container for ungrouped fields)
```

- **Section (`section`)**: Top-level horizontal tab rendered in [`LeadDetailTabs.tsx`](file:///Users/naveenadicharla/Documents/ridhzo/src/components/leads/LeadDetailTabs.tsx).
- **Subsection (`subsection`)**: Secondary sub-navigation tab within that section.
- **Default Fallback**: Fields with null or empty section values automatically render in the baseline **Custom Attributes** widget.

---

#### 6. Field Modifiers & Governance Rules

```
+----------------------------------------------------------------------------------------------------+
|                                    FIELD MODIFIERS MATRIX                                          |
+-----------------+----------------------------------------------------------------------------------+
| Modifier        | Operational Consequence Across Ridhzo                                            |
+-----------------+----------------------------------------------------------------------------------+
| Required        | Blocks lead creation and updates unless populated. Enforced on webforms & APIs.  |
| Show on Table   | Injects the field as an active data column in the main /leads triage list.       |
| Admin Only      | Hidden from non-admin reps; omitted from listCustomFieldsAction for standard users.|
| Disabled        | Retains historical values in database, but hides field from all intake forms.    |
+-----------------+----------------------------------------------------------------------------------+
```

##### 1. Mandatory Validation Guard
When `required: true` is set, [`CustomFieldService.validate`](file:///Users/naveenadicharla/Documents/ridhzo/src/domains/customFields/service.ts#L152) halts any save lacking the value:
```typescript
const isEmpty = raw === undefined || raw === null || raw === "" ||
  (def.type === "multiselect" && Array.isArray(raw) && raw.length === 0);

if (isEmpty && def.required) {
  throw new FieldValidationError(`Missing required field: ${def.label}`);
}
```

##### 2. Admin-Only Privacy Gate
Fields marked `adminOnly = true` are filtered out server-side for standard members in [`listCustomFieldsAction`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/customFields.ts#L16):
```typescript
const isAdmin = await hasPermission("settings.manage");
const fields = await CustomFieldService.list(organizationId);
return isAdmin ? fields : fields.filter((f) => !f.adminOnly);
```
Standard sales reps cannot view or edit admin-only fields in the UI, nor can they submit them via API.

---

#### 7. Storage Architecture & Key Slugification

##### 1. Automatic Key Slugification
When an administrator enters a label (e.g., `"Target Close Date"`), Ridhzo generates a persistent machine slug:
```typescript
function slugify(label: string) {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 50) || "field";
}
```

##### 2. Collision Defense
If an organization already has a field with the same slug, [`CustomFieldService.uniqueKey`](file:///Users/naveenadicharla/Documents/ridhzo/src/domains/customFields/service.ts#L36) appends numerical counters (`budget_2`, `budget_3`), preventing unique index conflicts on `(organization_id, key)`.

##### 3. Key Immutability
Once created, a custom field's `key` and `type` cannot be modified. Administrators may freely rename the display label, update select options, or reorder the field, but the underlying JSONB key remains fixed. This ensures existing lead data in `leads.customData` is never corrupted or orphaned.

---

#### 8. Complete Code & Symbol Reference

##### Frontend Components & Views
- [`CustomFieldsPage`](file:///Users/naveenadicharla/Documents/ridhzo/src/app/(dashboard)/settings/custom-fields/page.tsx): Route handler checking permissions and pre-fetching organization field definitions.
- [`CustomFieldsManager`](file:///Users/naveenadicharla/Documents/ridhzo/src/components/settings/CustomFieldsManager.tsx): Client-side manager providing field creation, inline editing, drag reordering, and datalist suggestions.

##### Server Actions
- [`listCustomFieldsAction`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/customFields.ts#L11): Fetches custom field definitions with role-based admin filtering.
- [`createCustomFieldAction`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/customFields.ts#L35): Validates and inserts a new custom field definition with automatic slug generation.
- [`updateCustomFieldAction`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/customFields.ts#L63): Updates field labels, options, default values, and display flags.
- [`reorderCustomFieldsAction`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/customFields.ts#L79): Persists new display order indexes for drag-and-drop sorting.
- [`deleteCustomFieldAction`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/customFields.ts#L92): Deletes custom field definitions from the tenant workspace.

##### Domain Services & Database Tables
- [`CustomFieldService`](file:///Users/naveenadicharla/Documents/ridhzo/src/domains/customFields/service.ts): Core domain service managing field definitions, slug uniqueness, and input validation.
- [`FieldValidationError`](file:///Users/naveenadicharla/Documents/ridhzo/src/domains/customFields/service.ts#L13): Custom error class returning user-friendly 422 validation messages.
- [`customFieldDefs`](file:///Users/naveenadicharla/Documents/ridhzo/src/db/schema/system.ts#L48): Drizzle table storing custom field definitions, options, flags, and tab groupings.
- [`leads.customData`](file:///Users/naveenadicharla/Documents/ridhzo/src/db/schema/leads.ts): JSONB column storing actual field values per lead record.

---

## 5. Settings: Lead Intelligence (`/settings/lead-intelligence`)

> Source: `docs/SETTINGS_LEAD_INTELLIGENCE.md`

### Settings: Lead Intelligence (`/settings/lead-intelligence`)

#### 1. Executive Summary & Purpose

The **Lead Intelligence** hub configures three server-side automation engines that enrich inbound leads, sync customer email conversations to the CRM activity feed, and optimize digital ad spend:

1. **Lead Enrichment Engine:** Automatically calls an external data provider (Clearbit, Apollo, ZoomInfo, or a proprietary microservice) in the background when leads arrive, storing verified firmographic and demographic facts under an evidence model.
2. **Inbound Email $\rightarrow$ Timeline:** Generates a secure, tokenized webhook URL for email providers (Postmark, Mailgun, Resend, SendGrid) to parse incoming prospect replies, inject them into the lead's activity timeline, stop active automated drip sequences, and classify buyer intent using AI.
3. **Meta Conversions API (CAPI) & Conversion Leads:** Dispatches server-to-server conversion events directly to Meta Graph API v20.0 with SHA-256 hashed customer parameters, as well as CRM status postbacks keyed by Meta `lead_id` (Conversion Leads) to train Meta's ad delivery algorithms on lead quality and won deals.

---

#### 2. File & Route Architecture

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

#### 3. Database Schema (`tenant_integration_settings`)

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
  enrichmentTimeoutMs: integer('enrichment_timeout_ms'), // not exposed in the UI; null = 10,000 ms

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

#### 4. Pillar 1: Lead Enrichment Engine

##### 4.1 Architecture & Workflow

1. **Trigger:** When a lead is captured, `eventBus.emit('lead.created', { leadId })` fires in [`src/lib/events/handlers.ts`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/events/handlers.ts).
2. **Deduplicated Queue Dispatch:** A job is enqueued to the BullMQ `lead-enrichment` queue:
   ```typescript
   await enrichmentQueue.add(
     `enrich-${p.leadId}`,
     { leadId: p.leadId },
     { jobId: `enrich-${p.leadId}` }
   );
   ```
3. **Asynchronous Background Processing:** In [`src/lib/jobs/workers/enrichmentWorker.ts`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/jobs/workers/enrichmentWorker.ts), the worker processes jobs at concurrency 5 with 3 retries and exponential backoff (5s base). `enrichLead` throws only on transient provider errors (network, timeout, 429, 5xx) so those are retried; a 404, other 4xx, non-JSON or oversized (>20 KB) response is a final skip. Already-enriched leads are skipped.
4. **Provider Invocation:** `callProvider` in [`enrichmentService.ts`](file:///Users/naveenadicharla/Documents/ridhzo/src/domains/leads/enrichmentService.ts) checks the URL against the SSRF guard (`assertPublicHttpUrl` — private, loopback and metadata addresses are refused, redirects are not followed), then issues a `POST` with `{ email, company, name, phone }`. The URL must be https and is also checked on save:
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

##### 4.2 Evidence Discipline Model

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
- **Precedence Rule:** The write is a single SQL update (`customData || {_enrichment}` and a `CASE` on `company`), so an enriched guess **never overwrites** human-entered data and edits made while the provider call was in flight are not lost.
- **Where it shows:** `LeadInsightsCard` on the lead page lists the enriched attributes.
- **Test connection:** the settings page can look up a sample email with the unsaved form values.
- **Activity Log Entry:** Automatically creates an activity record: `"Lead enriched from api.provider.com."`

---

#### 5. Pillar 2: Inbound Email $\rightarrow$ Timeline & Automation Control

##### 5.1 Webhook URL Generation & Security

* **URL Format:** `<app URL>/api/webhooks/email?token=<TOKEN>` (the token may instead be sent as an `x-webhook-token` header)
* **Token Creation:** Generated using cryptographically secure random bytes:
  ```typescript
  crypto.randomBytes(24).toString("base64url"); // 32 URL-safe characters
  ```
* **Instant Rotation:** Users with `settings.manage` can generate a new URL (after a confirmation). [`rotateInboundTokenAction`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/tenantIntegrations.ts) generates a new token and immediately revokes the prior URL.
* **Tenant Isolation:** The webhook endpoint verifies the token against `tenant_integration_settings`. Inbound matching is strictly scoped to the authenticated tenant's `organizationId`.

##### 5.2 Universal Provider Ingestion

The webhook endpoint [`src/app/api/webhooks/email/route.ts`](file:///Users/naveenadicharla/Documents/ridhzo/src/app/api/webhooks/email/route.ts) accepts JSON (Postmark, Resend — whose `{ type: "email.received", data }` envelope is unwrapped) and `multipart/form-data` / urlencoded bodies (Mailgun routes, SendGrid Inbound Parse), then normalizes fields:
- **Sender Address (`from`):** Checks `from`, `sender`, `fromEmail`, `From`. Extracts bare email address via regex `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`.
- **Subject Line:** Checks `subject`, `Subject`.
- **Message Body:** Checks `stripped-text`, `text`, `body-plain`, `body`, `plain`, `TextBody`.
- **Matching:** the most recently updated non-deleted lead in the token's org with that email.

##### 5.3 Downstream Automation & AI Intelligence

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

#### 6. Pillar 3: Meta Conversions API (CAPI) & Conversion Leads

##### 6.1 Server-Side Event Dispatching

In [`src/lib/integrations/metaCapi.ts`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/integrations/metaCapi.ts), Ridhzo posts server-to-server events to Meta Graph API v20.0 (`https://graph.facebook.com/v20.0/${pixelId}/events`).

###### Standard CAPI Events:
1. **`Lead` Event:** Triggered on `lead.created`. Normalizes and hashes customer PII using SHA-256 hex:
   - Email: `em` (lowercased and trimmed).
   - Phone: `ph` (digits only, country code retained).
   - First & Last Names: `fn` and `ln` (split and hashed).
   - Deduplication: `event_id: "${lead.id}:Lead"` allows Meta to deduplicate server events against client-side browser Pixel events.
   - `external_id` (hashed lead id) is also sent. Placeholder names ("Facebook Lead", "Unknown") are never hashed. `Lead` is not sent for imports, auto-merged leads, soft-deleted leads, or Meta Lead Ads leads (Meta already counts those natively).
   - Dedup: `event_id` dedupes only against Meta events inside Meta's ~48h window; there is no browser Pixel event to pair with.
2. **`Purchase` Event:** Triggered on `lead.status_changed` when the new status is in the **won category** (custom won statuses included). Always includes `custom_data.value` (the lead's expected value, 0 if none) and `currency`.
3. **Delivery & failures:** transient failures (network, timeout, 429, 5xx) are retried 3x (1s/4s/16s); everything is logged (`[capi]` lines with HTTP status, Meta code and `fbtrace_id`, never the token or PII) and the last outcome is shown on the settings page. Saving/enabling verifies the Pixel ID and token with Meta first. `META_CAPI_API_VERSION` overrides the default `v20.0`.

##### 6.2 Meta Conversion Leads CRM Postback

For leads generated via **Meta Lead Ads** (`customData.facebook_lead_id` present), Ridhzo posts CRM milestone updates back to Meta under the **Conversion Leads** program:
- **Attribution Identifier:** Uses raw `user_data.lead_id` (the Meta leadgen ID) rather than hashed PII, tying progress directly back to the specific ad and campaign.
- **Source Label:** Identifies `lead_event_source: "Ridhzo"`.
- **Default Stage Mapping** (used while `capi_lead_stage_map` is null; the UI hides keys the tenant has no status for):
  ```json
  {
    "active": "contacted",
    "contacted": "contacted",
    "qualified": "qualified",
    "won": "converted"
  }
  ```
- **Custom Mapping UI:** Administrators pick a status from the tenant's status list and type the Meta event name, in [`LeadIntelligenceManager.tsx`](file:///Users/naveenadicharla/Documents/ridhzo/src/components/settings/LeadIntelligenceManager.tsx). Saving an empty mapping means no stage postbacks are sent.
- **Dedup:** each stage event carries `event_id: "<leadgen id>:<event>"` (Meta dedupes for ~48h). A status with no map entry falls back to its category key (`won`/`lost`).
- **Currency:** Purchase and stage values are sent in the organization's currency (`organizations.currency`).

##### 6.2b Connect with Facebook (embedded flow)

Instead of pasting a Pixel ID and token, **Connect with Facebook** opens the same OAuth popup used for Lead Ads (redirect URI `/api/auth/facebook/callback`, state nonce prefixed `capi-`) with scopes `ads_management,business_management`. The callback exchanges the code for a ~60-day token, lists datasets via `/me/adaccounts?fields=name,adspixels{id,name}`, and stashes the token **server-side** (`fbPendingStore`, 10 min). The page shows a picker; `connectCapiDatasetAction` verifies the chosen dataset with Meta, then saves it (token encrypted, `capi_token_expires_at` set). Requires `FACEBOOK_APP_ID`/`FACEBOOK_APP_SECRET`/`NEXT_PUBLIC_FACEBOOK_APP_ID` and the app approved for `ads_management`. Because the token expires, the card warns 7 days ahead and shows **Reconnect**; a pasted system-user token never expires and clears the expiry.

##### 6.3 Pre-Flight Verification ("Send Test Event")

Administrators can verify CAPI connectivity before activating ad traffic:
1. Enter a **Test event code** (from Meta Events Manager $\rightarrow$ Test Events). It is **required** for a test, so the fake lead never lands in the live dataset.
2. Click **Send test event**. The form's current values are used (a blank token falls back to the saved one) — no need to save first.
3. [`sendTestCapiEventAction`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/tenantIntegrations.ts) triggers [`MetaCapiService.sendTest`](file:///Users/naveenadicharla/Documents/ridhzo/src/domains/leads/metaCapiService.ts), posting a sample `Lead` event (`id: test-<timestamp>`, `email: test@example.com`).
5. **Clear the test code and save when done.** While a code is saved, *all* events go to Test Events; the page shows a warning.
6. Meta's Test Events dashboard immediately displays the parsed event parameters and match quality diagnostic.

---

#### 7. Security & Key Management

1. **AES-256-GCM Encryption:** Secret credentials (`enrichmentAuthValueEnc` and `capiAccessTokenEnc`) are encrypted at rest using the tenant master encryption key in [`src/lib/crypto/secret.ts`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/crypto/secret.ts).
2. **Zero Plaintext Leakage:** Masked view objects return boolean flags (`hasEnrichmentAuthValue`, `hasCapiAccessToken`). Input fields show placeholder `••••••••` to prevent client-side exposure.
3. **Save Semantics:** Every visible field is saved as shown — blanking the URL, header, Pixel ID or test code clears it. Secret inputs are the exception: blank keeps the stored secret. **Remove provider** / **Disconnect** clear the section's config and secret.
4. **Isolated Token Authentication:** The inbound email webhook endpoint rejects any request lacking a valid, active tenant token with HTTP 401.

---

#### 8. Summary Checklist for Administrators

- [ ] **Enrichment:** Enter the https provider URL, the API key and (if not `Authorization`) the header name, then use **Test connection**.
- [ ] **Inbound Email:** Toggle on, copy secret webhook URL, and configure inbound forwarding / parse webhooks in Postmark, Mailgun, SendGrid, or Resend.
- [ ] **Meta CAPI:** Input Meta Pixel / Dataset ID and System User Access Token.
- [ ] **Meta Conversion Leads:** Review the CRM status-to-event mapping table and confirm stages match Events Manager configuration.
- [ ] **Verify Setup:** Enter Meta Test Event Code and click **Send test event** to confirm delivery in Meta Events Manager — then **clear the code and save**.

---

## 6. Settings: API Access Hub (`/settings/api`)

> Source: `docs/SETTINGS_API_ACCESS.md`

### Settings: API Access Hub (`/settings/api`)

The **API Access Hub** is Ridhzo's developer connectivity and integration gateway. Located at [`src/app/(dashboard)/settings/api/page.tsx`](file:///Users/naveenadicharla/Documents/ridhzo/src/app/(dashboard)/settings/api/page.tsx) and managed by [`ApiKeysManager.tsx`](file:///Users/naveenadicharla/Documents/ridhzo/src/components/settings/ApiKeysManager.tsx), this feature allows engineering teams to provision, scope, monitor, and revoke programmatic Bearer API keys for external integrations, custom backends, data pipelines, and third-party automation tools (Zapier, Make, n8n).

---

#### 1. Executive Summary & Business Value

Modern revenue teams require flexible programmatic access to synchronize lead data across proprietary ERPs, data warehouses, and marketing stacks:

1. **Secure Programmatic Ingestion & Sync**: Ingest leads, query pipelines, and update custom attributes directly via standard REST HTTP endpoints (`/api/v1/leads`).
2. **One-Way Cryptographic Hashing**: Raw secret tokens are generated with high-entropy randomness, displayed **only once**, and stored exclusively as irreversible SHA-256 hashes.
3. **Least-Privilege Scoping (Read-Only vs. Full)**: Organizations can create read-only keys for reporting dashboards or external auditors, preventing external scripts from modifying or deleting leads.
4. **Enterprise Rate Limiting**: Enforces an in-memory and Redis sliding-window budget of **600 requests per 60 seconds per API key**, defending against runaway loops and distributed denial-of-service attempts.
5. **Lock-Free Usage Telemetry**: Tracks real-time `lastUsedAt` timestamps with fire-and-forget 60-second write throttling, eliminating database lock contention during high-volume API ingest.
6. **Granular Lifecycle Control**: Instant key revocation cuts off misbehaving integrations immediately while retaining audit trail history.

---

#### 2. Technical Architecture & Authorization Flow

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

#### 3. UI Layout & Visual Hierarchy

The API Access Hub is designed for developer clarity, adhering to strict zero-knowledge credential reveal principles:

##### A. Navigation & Header
- **Breadcrumb Link**: Ghost button linking back to `/settings`.
- **Title**: `API Access`
- **Subtitle**: *"Programmatic access to your leads via the REST API."*

##### B. API Key Provisioning Card
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

###### One-Time Secret Reveal Dialogue
- When a key is created, Ridhzo receives the raw token once from [`createApiKeyAction`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/apiKeys.ts#L15).
- A highlighted box displays the full raw key with an instant copy button (`navigator.clipboard.writeText`).
- Once dismissed or upon page reload, **the raw key is permanently expunged from memory**. The server stores only the cryptographic hash.

##### C. Active API Keys Table
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

#### 4. Cryptographic Token Architecture

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

##### Database Schema ([`apiKeys`](file:///Users/naveenadicharla/Documents/ridhzo/src/db/schema/system.ts))
```typescript
export const apiKeys = pgTable('api_keys', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').references(() => organizations.id).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  keyHash: varchar('key_hash', { length: 64 }).notNull().unique(), // sha256 hex
  prefix: varchar('prefix', { length: 16 }).notNull(), // pk_xxxx for identification
  scope: varchar('scope', { length: 20 }).notNull().default('full'), // full, read_only
  createdById: uuid('created_by_id').references(() => users.id),
  lastUsedAt: timestamp('last_used_at'),
  revokedAt: timestamp('revoked_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
```

Because only `keyHash` is persisted, a database compromise never exposes usable credentials.

---

#### 5. Scope Enforcement: Full vs. Read-Only

API keys support two access tiers:

```
+----------------------------------------------------------------------------------------------------+
|                                      SCOPE CAPABILITY MATRIX                                       |
+-------------------+--------------------+------------------------+----------------------------------+
| Scope Identifier  | Permitted Methods  | Allowed Endpoints      | Blocked Operations               |
+-------------------+--------------------+------------------------+----------------------------------+
| full              | GET, POST, PATCH,  | All /api/v1/ endpoints | None (governed by plan limits)   |
|                   | DELETE, HEAD       |                        |                                  |
| read_only         | GET, HEAD          | Querying leads/data    | POST, PATCH, DELETE rejected 403 |
+-------------------+--------------------+------------------------+----------------------------------+
```

##### Server-Side Method Guard ([`src/lib/apiAuth.ts#L40`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/apiAuth.ts#L40))
When an API request arrives with a read-only key, [`authorizeApiRequest`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/apiAuth.ts) rejects mutating HTTP verbs immediately:
```typescript
if (key.scope === "read_only" && !isSafeMethod(req.method)) {
  return { error: NextResponse.json({ error: "This API key is read-only." }, { status: 403 }) };
}
```
This protects production pipelines from accidental mutations or deletions by external reporting tools.

---

#### 6. High-Throughput Rate Limiting & Usage Telemetry

##### Sliding-Window Rate Limiting
To ensure multi-tenant quality of service and prevent abuse:
- Budget: **600 requests per 60 seconds per API key**.
- Evaluated via [`RateLimiter.checkLimit(`apiv1:apikey:${key.id}`, 600, 60)`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/rate-limit.ts).
- If exhausted, Ridhzo returns HTTP 429 Too Many Requests with standard RFC headers:
  - `X-RateLimit-Limit: 600`
  - `X-RateLimit-Remaining: 0`
  - `X-RateLimit-Reset: <timestamp>`
  - `Retry-After: <seconds>`

##### Lock-Free Telemetry Throttling ([`ApiKeyService.touchLastUsed`](file:///Users/naveenadicharla/Documents/ridhzo/src/domains/apiKeys/service.ts#L74))
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

#### 7. REST API v1 Endpoints Catalog

All v1 endpoints authenticate via the `Authorization: Bearer <key>` header:

##### 1. List Leads (`GET /api/v1/leads`)
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

##### 2. Ingest Lead (`POST /api/v1/leads`)
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

#### 8. Complete Code & Symbol Reference

##### Frontend Components & Views
- [`ApiKeysPage`](file:///Users/naveenadicharla/Documents/ridhzo/src/app/(dashboard)/settings/api/page.tsx): Route handler checking `api.manage` permissions and pre-fetching API keys.
- [`ApiKeysManager`](file:///Users/naveenadicharla/Documents/ridhzo/src/components/settings/ApiKeysManager.tsx): Client-side manager rendering provisioning form, one-time secret modal, and key cards.

##### Server Actions
- [`listApiKeysAction`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/apiKeys.ts#L10): Fetches active and revoked keys for the authenticated organization.
- [`createApiKeyAction`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/apiKeys.ts#L15): Provisions a new API key and returns the raw secret once.
- [`revokeApiKeyAction`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/apiKeys.ts#L31): Sets `revokedAt = now()` to disable an API key.
- [`deleteApiKeyAction`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/apiKeys.ts#L44): Permanently deletes an API key record.

##### Gateway & Domain Services
- [`authorizeApiRequest`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/apiAuth.ts#L20): Central authorization middleware verifying Bearer tokens, scopes, and rate limits.
- [`ApiKeyService`](file:///Users/naveenadicharla/Documents/ridhzo/src/domains/apiKeys/service.ts): Domain service managing token hashing, verification, and throttled telemetry updates.
- [`/api/v1/leads/route.ts`](file:///Users/naveenadicharla/Documents/ridhzo/src/app/api/v1/leads/route.ts): Public REST API endpoint for querying and creating leads.
- [`apiKeys`](file:///Users/naveenadicharla/Documents/ridhzo/src/db/schema/system.ts): Drizzle ORM table storing key hashes, prefixes, scopes, and usage timestamps.

---

## 7. Settings: Outbound Webhooks (`/settings/webhooks`)

> Source: `docs/SETTINGS_OUTBOUND_WEBHOOKS.md`

### Settings: Outbound Webhooks (`/settings/webhooks`)

#### 1. Executive Summary & Purpose

The **Outbound Webhooks** engine allows developers and administrators to subscribe their own HTTP endpoints to core CRM lead events. When a lead is captured or undergoes a pipeline transition, Ridhzo dispatches an HTTP POST request carrying an HMAC-SHA256 signed JSON envelope.

The architecture is built for mission-critical reliability, SSRF security, and zero event loss:
- **Durable Delivery Tracking:** Every outbound delivery is recorded in PostgreSQL (`webhook_deliveries`) as `pending` before BullMQ queue ingestion. Redis or worker outages surface as observable failed jobs rather than silent drops.
- **Enterprise SSRF Protection:** Pre-flight DNS resolution and IP address filtering strictly block private subnets, cloud instance metadata services (e.g. AWS/DigitalOcean `169.254.169.254`), and loopback addresses.
- **Cryptographic Signing:** Every payload is signed with a unique 24-byte hex secret via HMAC-SHA256 in the `X-Ridhzo-Signature` header.
- **Dead Letter Queue (DLQ) & Self-Healing:** Transient failures retry up to 5 times with exponential backoff; permanent failures (3xx/4xx) bypass retries and land in a tenant-scoped DLQ with one-click re-enqueue and purge operations.

---

#### 2. File & Architecture Map

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

#### 3. Database Schema

Managed via Drizzle ORM in [`src/db/schema/integrations.ts`](file:///Users/naveenadicharla/Documents/ridhzo/src/db/schema/integrations.ts):

##### 3.1 `webhook_endpoints`
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

##### 3.2 `webhook_deliveries`
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

#### 4. Supported Event Types & Payload Envelope

Subscribable event types are strictly limited to active event producers in [`WEBHOOK_EVENT_TYPES`](file:///Users/naveenadicharla/Documents/ridhzo/src/domains/integrations/webhookEndpointService.ts):

| Event Key | Label | Producer Location | Data Payload Keys |
| :--- | :--- | :--- | :--- |
| `lead.created` | **Lead created** | [`src/lib/events/handlers.ts:102`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/events/handlers.ts#L102) | `id`, `name`, `email`, `phone`, `company`, `status` |
| `lead.status_changed` | **Status changed** | [`src/lib/events/handlers.ts:160`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/events/handlers.ts#L160) | `id`, `name`, `email`, `phone`, `company`, `status`, `oldStatus`, `newStatus` |

##### JSON Payload Envelope (`WebhookEventPayload`)
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

#### 5. Security & SSRF Protection

##### 5.1 Host & IP Pre-Flight Verification (`ssrf.ts`)
Outbound endpoints accept custom URLs. To protect cloud servers against Server-Side Request Forgery (SSRF), [`assertPublicHttpUrl()`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/webhooks/ssrf.ts) resolves DNS records and checks all addresses against [`isBlockedAddress()`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/webhooks/ssrf.ts#L8):
- **Private Subnets:** `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`.
- **Loopback & Zero:** `127.0.0.0/8`, `0.0.0.0/8`, `::1`.
- **Carrier-Grade NAT:** `100.64.0.0/10`.
- **Cloud Metadata Sink:** `169.254.169.254` (Link-local).
- **Multicast / Reserved:** `>= 224.0.0.0`.
- **IPv6:** `fe80::` (link-local), `fc00::/7` (unique-local), and IPv4-mapped IPv6 literals (`::ffff:a.b.c.d`).

##### 5.2 Redirect Hardening
`fetch` requests are executed with `redirect: "manual"`. If a target endpoint attempts to issue an HTTP 301/302 redirecting the client to an internal IP or metadata endpoint, the request is halted immediately.

##### 5.3 Cryptographic Signature Verification
Each request includes security headers computed over the raw JSON string body:
- `X-Ridhzo-Signature`: Hex-encoded HMAC-SHA256 hash using the endpoint's signing secret.
- `X-Ridhzo-Event`: The event identifier (e.g. `lead.created`).
- `X-Privyr-Signature` & `X-Privyr-Event`: Aliased headers maintained for legacy integration backwards compatibility.

###### Receiver Verification Example (Node.js):
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

##### 5.4 Secret Disclosure & Audit Logging
1. **Never Leaked in UI Props:** `WebhookEndpointService.list()` explicitly omits `secret` from queries.
2. **On-Demand Fetching:** Secrets are retrieved only when the user clicks the "Secret" button via [`revealWebhookSecretAction`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/webhooks.ts#L60).
3. **Audit Trail:** Every secret reveal logs a permanent record to [`AuditService`](file:///Users/naveenadicharla/Documents/ridhzo/src/domains/audit/service.ts) (`webhook.secret_reveal`) recording the requesting user ID and timestamp without logging the secret value.

---

#### 6. End-to-End Delivery Lifecycle & DLQ

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

#### 7. Manager Interface Features (`WebhooksManager.tsx`)

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

#### 8. Summary Checklist for Integration Engineers

- [ ] **Endpoint Setup:** Register HTTPS endpoint in `/settings/webhooks` selecting `Lead created` and/or `Status changed`.
- [ ] **Secret Storing:** Click **Secret**, copy the 48-character hex signing key, and store it securely in application environment variables.
- [ ] **Signature Verification:** Implement HMAC-SHA256 validation comparing `X-Ridhzo-Signature` against `crypto.createHmac("sha256", secret).update(rawBody).digest("hex")`.
- [ ] **Respond with 2xx:** Return HTTP 200/204 within 10 seconds. Unhandled exceptions or timeouts trigger BullMQ retries up to 5 attempts.
- [ ] **Test Delivery:** Click **Test** in the Ridhzo UI and verify that the test lead payload arrives at the receiving service.

---

## 8. User Profile & Account Preferences (`/profile`)

> Source: `docs/USER_PROFILE.md`

### User Profile & Account Preferences (`/profile`)

#### 1. Executive Summary & Purpose

The **User Profile** page (`/profile`) manages personal identity, authentication credentials, and granular notification preferences for the logged-in user. While the organization-wide settings govern system policies and team schemas, the Profile page provides self-service controls for individual reps, managers, and administrators.

Key features include:
- **Authentication & Identity Verification:** Displays verified user details (Name, Email, Phone) derived directly from the authenticated session.
- **Granular Email Notification Preferences:** Controls which in-app notification events trigger outbound email alerts to the user's personal inbox, backed by an opt-out storage model.
- **Secure Sign-Out:** Session invalidation and cache teardown via NextAuth.

---

#### 2. File & Component Architecture

| Purpose | File Path |
| :--- | :--- |
| **Page Route** | [`src/app/(dashboard)/profile/page.tsx`](file:///Users/naveenadicharla/Documents/ridhzo/src/app/(dashboard)/profile/page.tsx) |
| **Notification Preferences Component** | [`src/components/settings/NotificationPreferences.tsx`](file:///Users/naveenadicharla/Documents/ridhzo/src/components/settings/NotificationPreferences.tsx) |
| **Notification Actions** | [`src/lib/actions/notificationPrefs.ts`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/notificationPrefs.ts) |
| **Email Notification Categories** | [`src/lib/notifications/emailTypes.ts`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/notifications/emailTypes.ts) |
| **Header User Menu Integration** | [`src/components/layout/Header.tsx:71-91`](file:///Users/naveenadicharla/Documents/ridhzo/src/components/layout/Header.tsx#L71-L91) |

---

#### 3. Profile Identity & Protected Access

Access to `/profile` is guarded by [`requireAuth()`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/rbac.ts):
```typescript
export default async function ProfilePage() {
  let session;
  try {
    session = await requireAuth();
  } catch {
    redirect("/login");
  }
  // ...
}
```

The user identity card presents the verified session attributes:
- **Full Name:** Retrieved from `session.user.name` (`firstName` + `lastName`).
- **Email Address:** Primary login email and password reset destination.
- **Direct Phone Number:** Rep contact number used in team communication and notifications.

---

#### 4. Granular Email Notification Preferences

Ridhzo maintains a distinction between **In-App Bell Alerts** and **Inbox Emails**:
- **In-App Notification Bell (`NotificationBell.tsx`):** Receives 100% of lead assignments, reminders, and alerts in real-time.
- **Email Notifications (`NotificationPreferences.tsx`):** Users can customize which events also generate email messages delivered via the tenant's configured SMTP or Resend mailer.

##### 4.1 Supported Notification Events (`EMAIL_NOTIFICATION_TYPES`)

| Notification Type | Label in UI | Description |
| :--- | :--- | :--- |
| `new_lead` | **New lead assigned or received** | Dispatched when an inbound lead is captured and assigned to the user. |
| `lead_assigned` | **A lead is assigned to you** | Dispatched when a manager or teammate reassigns an existing lead. |
| `follow_up_due` | **Follow-up due** | Dispatched when a scheduled reminder timestamp is reached. |
| `follow_up_overdue` | **Follow-up overdue** | Dispatched when a reminder passes its due date without completion. |
| `sla_escalation` | **SLA escalation (unactioned lead)** | Dispatched when a new lead remains uncontacted past the 15-minute SLA. |

##### 4.2 Opt-Out Architecture & Data Persistence
To avoid missing critical leads by default, Ridhzo employs an **opt-out model**:
- All notification types default to active (`emailOn = true`).
- Checking an option keeps it active; unchecking adds the event key to the user's `email_opt_out` array in the database.
- Toggling any preference immediately triggers [`setEmailOptOutAction(next)`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/notificationPrefs.ts) with optimistic UI updates and error rollback.

---

#### 5. Session Termination & Sign-Out

The sign-out button triggers a direct POST to `/api/auth/signout` or client-side `signOut({ callbackUrl: "/login" })`:
- Destroys active session cookies and JWT tokens.
- Clears local browser caches and IndexedDB outboxes.
- Redirects user back to the login screen.

---

## 9. Team Management, Roles & Security

> Source: `docs/product-kb/17_TEAM_ROLES_SECURITY.md`

### Team Management, Roles & Security

#### Users & invitations (Settings → Users)
- **Multi-Method Team Invitations:** Invite teammates by **Email**, direct **WhatsApp share**, or copyable **direct invite link**.
- **Guided Profile Gaps Banner:** A prominent contextual banner alerts team members when required profile fields (such as phone number, WhatsApp contact, or operational timezone) are incomplete.
- Activate/deactivate users at any time (deactivated users stop receiving leads; their data stays).
- **Seat calculation:** Seats are counted strictly for active members and pending invitations. Soft-deleted and deactivated team members are excluded, ensuring you never pay for past staff.
- **Teams** — group users (by city, product, language) for team-based lead rotation and reporting.
- Seat count follows your plan (Free 1 · Starter 3 · Unlimited unlimited).

#### Roles & permissions
Two built-in roles plus unlimited **custom roles**:

| Role | Can do |
|---|---|
| **Admin** | Everything |
| **Member** (sales rep) | Create, edit, assign, call, and change status of their leads |
| **Viewer** (custom role without edit) | Read-only access |
| **Custom roles** | Any combination of the permissions below |

**Least-Privilege Role Defaults & Validation:**
Role assignment strictly verifies caller permissions on the server to prevent privilege escalation. Custom roles follow least-privilege principles by default.

**Permission catalog:**
| Permission | Allows |
|---|---|
| Manage users & teams | Invite, deactivate, organise teams |
| Manage roles & permissions | Create/edit roles |
| Edit organization settings | General settings, currency, statuses |
| Manage lead fields | Configure field visibility, required fields, and ordering |
| Manage lead sources & automatic assignment | Connect Facebook/Google/forms/calls, set assignment |
| Manage message templates | Create/edit templates |
| Manage automations | Build/edit automations |
| Manage sequences | Create/edit/delete sequences |
| Edit leads | Create, edit, assign, change status |
| Delete leads | Move leads to recycle bin (30-day soft delete) |
| Permanently purge leads | Hard-delete leads permanently via the purge endpoint |
| Merge duplicate leads | Merge records |
| Manage meetings | Schedule, check-in, and record meeting outcomes |
| View audit log | See who did what |
| Manage API keys, webhooks & new-lead alerts | Developer & alert settings |
| Manage billing & subscription | Plans, invoices, and payments |

**Lead privacy between reps:** sales reps see and work only the leads assigned to them (plus leads they are attending a meeting with). Admins and anyone with "Edit organization settings" see all leads. Reps can't open a colleague's lead even with a direct link.

Admins cannot accidentally lock themselves out (self-protection rules), and permission checks are enforced on the server — not just hidden buttons.

#### Super-Admin Platform Console (`/admin`)
Authorized platform super-administrators have access to a dedicated platform console for multi-tenant governance:
- **Tenant Management:** Search, view, and inspect all registered workspaces, owner profiles, and usage metrics.
- **Plan & Trial Overrides:** Provision complimentary plans, adjust seat and lead volume quotas, and extend free trials on demand.
- **System Telemetry & Support:** Review platform-wide error rates, background worker statuses, and handle user support escalations centrally.

#### In-App Support Center & SLA Protection (Settings → Support)
- **Built-in Support Ticketing:** Allows workspace members to raise, track, and manage help tickets directly within Ridhzo without leaving the CRM.
- **Integration Requests & In-App Error Reporting:** Reps and admins can submit direct feature/integration requests, and report application errors with full diagnostic traces directly from error boundaries.
- **Automated Support SLA Breach Worker:** A background worker monitors ticket SLAs (e.g. 4-hour initial response, 24-hour resolution), proactively flagging at-risk tickets and preventing customer service bottlenecks.
- **Zoho Cliq Operational Alerts:** System anomalies, SLA breach warnings, and executive digests can be streamed directly into internal Zoho Cliq channels via webhook or OAuth integration.

#### Audit log (Settings → Audit)
A permanent record of important actions: who changed settings, roles, users, deleted/merged leads, created API keys, and more — with time and user. Exportable per lead as a full history. System-generated background operations are cleanly tracked.

#### Login & Session Security
- Email & password (securely hashed)
- **Sign in with Google**
- **Sign in with Mobile Phone Number:** Sign in directly using mobile phone number (with international dial code) + password or SMS/Watxio OTP.
- **Mobile Token Revocation:** Mobile sessions can be revoked on-demand (`/api/mobile/auth/token-revoke`), immediately invalidating device JWTs.
- **Session Caching & Token Pruning:** User sessions are securely cached; stale mobile push tokens are pruned automatically to maintain tight device security.

#### Data protection & Billing
- **Complete workspace isolation** — every query is scoped to your organisation; one business can never see another's data.
- **Encryption** of sensitive secrets (SMTP passwords, API keys, integration tokens) with AES-256-GCM.
- **API keys** are hashed; full vs read-only scopes; rate-limited.
- **Signed webhooks** (HMAC-SHA256) in and out; protection against internal-network (SSRF) abuse.
- **Rate limiting** on public forms and webhooks to stop spam.
- **Recycle bin** (30 days) guards against accidental deletion.
- **Permanent Purge:** Compliant hard deletion for GDPR / right-to-be-forgotten requests.
- **GST Invoices & Payment Webhooks:** Automatic GST-compliant tax invoices generated via payment webhooks on Razorpay, with multi-currency handling.

#### Why it matters
- Give every person exactly the access they need — no more, no less.
- Know who did what, always.
- Your customer data stays private and safe.

---

## 10. Integrations, API & Webhooks

> Source: `docs/product-kb/18_INTEGRATIONS_API_WEBHOOKS.md`

### Integrations, API & Webhooks

#### Built-in integrations
| Integration | What it does |
|---|---|
| **Facebook & Instagram Lead Ads** | Real-time lead import, multi-tenant page sharing, form filtering, past-lead sync, proactive token expiry tracking |
| **Google Lead Form Ads** | Real-time lead import via webhook |
| **Android Call Sync & Caller ID** | Native call log sync (`/api/mobile/calls/sync`), Caller ID directory (`/api/mobile/caller-id`), and phone key prefiltering |
| **WhatsApp Business API** | Connect via Watxio or Meta Cloud API with organization tenant ID isolation |
| **Personal WhatsApp** | One-tap wa.me messaging, no setup |
| **Google Calendar** | Meetings and booking-page appointments sync to your calendar; Google Meet links |
| **Email (SMTP & Inbound)** | Gmail, Google Workspace, Zoho, Outlook, SES; custom reply-to, inbound auto-reply/OOO filtering, and deduplication |
| **Meta Conversions API (CAPI)** | Send lead-quality events back to Meta with live delivery status tracking (sent/pending/failed) and an interactive **Test Ping** button |
| **Lead enrichment** | Fill in missing lead details automatically from your data provider |
| **Telephony (missed calls)** | Any provider (Exotel, Knowlarity, Twilio…) → auto-WhatsApp on missed call |
| **Razorpay** | Subscription payments with automated GST tax invoices and printable PDF receipts |
| **Zoho Cliq** | Real-time system and SLA breach notifications routed to channels via webhook or OAuth |
| **Zapier / Make / Pabbly / any tool** | Via inbound webhook, REST API and outbound webhooks |

Lead-intelligence integrations (enrichment, inbound email logging, Meta CAPI delivery & token monitoring) are configured in **Settings → Lead Intelligence**.

#### REST API (Settings → API)
- Create **API keys** with **Full** or **Read-only** scope; keys are shown once and stored hashed.
- Usage tracking and rate limiting per key.
- Endpoints (v1) include:
  - `POST /api/v1/leads` — create a lead · `GET /api/v1/leads` — list/search leads (returns `crn`, `displayId`, trigram phone matching) · `GET/PATCH/DELETE /api/v1/leads/{id}`
  - Activity timeline and status histories include explicit sequence numbers (`seq`) for reliable client ordering.
  - `GET /api/unsubscribe` — cryptographic one-click email unsubscribe handling
  - `POST /api/leads/purge` — permanent lead purge (admin permission required)
  - Follow-ups, meetings, statuses, templates, custom fields, users, notifications, dashboard summary
- **Use cases:** push leads from your own website backend or app; sync leads into an ERP; build a custom report.

#### Mobile API & Offline Sync Endpoints
Dedicated endpoints power the native mobile application:
- **Authentication & Security:** Phone + password login, `/api/mobile/auth/send-otp`, `/api/mobile/auth/verify-otp`, `/api/mobile/auth/token-revoke`.
- **Incremental Lead Sync:** `/api/mobile/leads/sync` supporting `sync_at` timestamp filtering and offline conflict detection.
- **Mobile AI Suggestions & Pre-Call Briefs:** `/api/mobile/leads/[id]/ai-suggestions` for 1-click field updates, stage transitions, and pre-call preparation from mobile.
- **Android Call Sync:** `/api/mobile/calls/sync` and `/api/mobile/calls/phone-keys`.
- **Idempotency-Key Header:** Mobile mutation requests (notes, contact logs, replies) support `Idempotency-Key` headers to prevent duplicate executions during network dropouts.

#### Outbound webhooks (Settings → Webhooks)
Ridhzo can notify your other systems in real time.
- Events: **lead created**, **lead status changed**, **lead became hot**, **lead stuck (stagnant alert)**.
- Each delivery is signed (HMAC-SHA256) so the receiver can verify it came from Ridhzo.
- Automatic **retries with exponential backoff** (up to 5 attempts); failed deliveries are kept for inspection and replay.
- Add, edit, test and disable endpoints from the settings screen.

**Use cases:**
- When a lead is marked **Won**, create the customer in Tally/Zoho Books/your ERP.
- Post new hot leads to a Slack or Google Chat channel via Zapier.
- Update a Google Sheet for a client report.

#### Inbound webhook
Every workspace gets signed webhook URLs to receive leads from any website or tool. See [Lead Capture](04_LEAD_CAPTURE_SOURCES.md).

#### Coming soon
- LinkedIn Lead Gen Forms (Coming soon)
- WhatsApp inbound as an automatic lead source (Coming soon)

---

## 11. Ridhzo REST API (`/api/v1`)

> Source: `docs/API_V1.md`

### Ridhzo REST API (`/api/v1`)

The API behind the mobile app and third-party integrations. This page is the reference; the route handlers under
`src/app/api/v1/**` are the source of truth. Settings → API (in the app) creates keys and shows the base URL.

#### Authentication

Send `Authorization: Bearer <token>` on every request. Two kinds of token:

| Token | Looks like | Who it is | Notes |
|---|---|---|---|
| **API key** | `pk_…` | The workspace (no user) | Created in Settings → API (needs `api.manage` and a verified email). Shown once. Optional expiry (30/90/365 days), optional read-only switch, optional per-area **scopes**. |
| **Mobile session token** | JWT | A signed-in user | From `/auth/login`, `/auth/otp/verify` or Google sign-in. 30 days; `POST /auth/refresh` swaps it for a fresh one (the old one retires 10 minutes later). Honours the user's **live** role: a demoted/deactivated user loses access at once. |

Endpoints marked **user** below need a mobile session token (they act as a person); API keys get `403 A user session is required`.

##### Scopes (API keys only)
A key created without a scope list can reach everything its read/write switch allows. With a list, each area is allowed only
if named: `leads:read|write`, `meetings:read|write`, `followups:read|write`. Areas outside these (e.g. `/me`, `/statuses`,
`/templates`) are not scope-guarded. `GET`/`HEAD` need `:read`, everything else `:write`. A missing scope → `403`.

#### Limits

- **Per minute:** 600 requests per key / per user (`429`, with `Retry-After` and `X-RateLimit-*` headers).
- **Per month (API keys only):** by plan — Free 10,000 · Starter 300,000 · Unlimited 3,000,000 (`429`). The mobile app is not metered.
- **Plan features** apply as in the app (lead cap, storage cap, message/email allowances → `402`/`422` with a clear message).
- **Maintenance mode:** writes return `503` + `Retry-After`; reads keep working.
- **Suspended workspace:** `403`.

#### Conventions

- JSON in, JSON out: success `{ "data": … }`, errors `{ "error": "message", "details"?: { field: "message" } }`.
- Status codes: `200/201` ok · `401` missing/invalid/expired/revoked token · `403` not allowed (role, read-only key, scope) · `404` not found **or not yours** (never reveals other tenants' ids) · `422` validation · `429` throttled · `503` maintenance.
- IDs are UUIDs; a malformed id is a `404`.
- **Idempotency:** `POST /leads`, `/leads/{id}/notes`, `/leads/{id}/follow-ups`, `/leads/{id}/contact`, `/leads/{id}/reply` accept an `Idempotency-Key` header (8–100 chars `[A-Za-z0-9-]`). A repeat with the same key and route returns the first result (`Idempotent-Replayed: true`); keys are kept 35 days.
- **Visibility:** an API key sees the whole workspace. A user token sees leads they own, leads they attend a meeting for or have a follow-up on, and (with `settings.manage`) all leads.
- **Writes** need `leads.edit` for user tokens ("Viewer" roles are read-only here, as on the web).

#### Pagination
`GET /leads` → `limit` (1–200, default 50) and either `offset` or keyset `cursor=<last lead id>` (newest first; stable under inserts).
`?search=` (name/email/company/phone digits), `?status=`, `?owner=me`, `?deleted=1` (recycle bin; needs `leads.delete`).

**Incremental sync (mobile):** `GET /leads?sync=1[&after=<cursor>]` returns changes oldest-first as `{ data, next, done }`;
rows the caller can no longer see (deleted, reassigned away) come back as `{ id, gone: true }`. Loop until `done`.

#### Endpoints

##### Session & app
| Method | Path | Notes |
|---|---|---|
| GET | `/app-config` | public: min app version, store links |
| POST | `/auth/login` | `{ email\|phone, password }` → `{ token, user }` (rate-limited per account and IP) |
| POST | `/auth/otp/send` · `/auth/otp/verify` | WhatsApp OTP login (existing accounts) |
| POST | `/auth/google/exchange` · GET `/auth/google/finish` | Google sign-in hand-off (PKCE-style code) |
| POST | `/auth/refresh` · `/auth/logout` | **user** — rotate / revoke the token |
| GET | `/me` | **user** — profile, workspace, permissions, plan |

##### Leads
| Method | Path | Notes |
|---|---|---|
| GET / POST | `/leads` | list (see Pagination) / create (`name` required; duplicate email/phone → `422` naming the existing lead) |
| GET | `/leads/cold` | going-cold list |
| GET / PATCH / DELETE | `/leads/{id}` | read / edit fields, status, stage / move to recycle bin |
| GET | `/leads/{id}/profile` | the whole lead screen in one call (timeline, follow-ups, meetings, …) |
| POST | `/leads/{id}/restore` · `/leads/{id}/purge` | recycle bin (`leads.delete` / `leads.purge`) |
| GET / POST / DELETE | `/leads/{id}/tags` | |
| POST · PATCH · DELETE | `/leads/{id}/notes`, `/leads/{id}/notes/{noteId}` | |
| POST | `/leads/{id}/follow-ups` | **user** |
| POST | `/leads/{id}/contact` · `/leads/{id}/reply` | **user** — log an outreach / paste a reply |
| POST | `/leads/{id}/whatsapp` · `/leads/{id}/email` | send (Business-API mode / workspace mailer); email is **user** |
| POST | `/leads/{id}/attachments` | **user** — multipart `file` (≤ 25 MB, allow-listed types, content must match the extension) |
| POST | `/leads/{id}/shares` | **user** — branded share link |
| POST | `/leads/{id}/sequences` | enrol in a sequence |
| GET | `/leads/{id}/ai/recap` · POST `/ai/draft` · POST `/ai/suggestions/{id}` | AI features (consume AI credits) |
| GET · DELETE | `/attachments/{id}` | **user** — signed 10-minute download link / remove |

##### Follow-ups, meetings, calls
| Method | Path | Notes |
|---|---|---|
| GET | `/follow-ups` · PATCH `/follow-ups/{id}` | list / complete, snooze, reschedule |
| GET · POST | `/leads/{id}/meetings` | |
| GET | `/meetings` · GET/PATCH `/meetings/{id}` | |
| POST | `/meetings/{id}/outcome` · `/meetings/{id}/check-in` | outcome / **user** check-in |
| PATCH | `/sequence-enrollments/{id}` | pause / resume / stop |
| GET/POST | `/calls/numbers`, `/calls/caller-id`, `/calls/sync`, `/calls/sync/status` | **user** — phone call-log sync |

##### Reference data & misc
`GET /statuses` · `/custom-fields` · `/templates` · `/users` · `/dashboard` · `/badges` ·
`GET/PATCH /notifications` · `POST/DELETE /devices` (push tokens, **user**) · `POST /devices/test` (**user**).

#### Webhooks (outbound)
See [`OUTBOUND_WEBHOOK_EVENTS.md`](OUTBOUND_WEBHOOK_EVENTS.md). Inbound lead capture endpoints (`/api/webhooks/*`) are documented in
`SOURCE_WEBSITE_WEBHOOK.md`, `SOURCE_FACEBOOK_LEAD_ADS.md`, `SOURCE_GOOGLE_LEAD_ADS.md`.

---

## 12. Outbound webhooks — events & payloads

> Source: `docs/OUTBOUND_WEBHOOK_EVENTS.md`

### Outbound webhooks — events & payloads

Settings → Webhooks sends a signed `POST` to your HTTPS URL when something happens in the workspace.

#### Delivery
- `POST` JSON, `Content-Type: application/json`, **10 s timeout**, up to 64 KB of response read. **Redirects are not followed.**
- URLs must be public: private/loopback/link-local/metadata addresses are refused (and re-checked at connect time).
- Success = any `2xx`. `408`, `429`, `5xx` and network errors are **retried** with backoff; other `4xx` and `3xx` are permanent failures.
- After the retries are exhausted a delivery lands in **Failed deliveries** (Settings → Webhooks) where you can retry or discard it.
- Each delivery has a unique `eventId`; **dedupe on it** — a retry re-sends the same event.

#### Headers
| Header | Value |
|---|---|
| `X-Ridhzo-Event` | the event name, e.g. `lead.created` |
| `X-Ridhzo-Signature` | hex HMAC-SHA256 of the **raw request body** keyed with the endpoint's signing secret |
| `X-Privyr-Event`, `X-Privyr-Signature` | same values, for tools already built against that format |

Verify the signature before trusting the body (compare in constant time):

```js
const expected = crypto.createHmac("sha256", SECRET).update(rawBody).digest("hex");
if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(req.headers["x-ridhzo-signature"]))) return res.sendStatus(401);
```

#### Envelope
```json
{
  "version": "1",
  "eventId": "evt_3f9c…",
  "event": "lead.created",
  "timestamp": "2026-10-02T09:15:00.000Z",
  "organizationId": "…uuid…",
  "data": { }
}
```
`version` is bumped when the envelope or `data` shapes change incompatibly.

#### Events and `data`
Lead events share a base: `id, name, email, phone, company, status`.

| Event | Extra `data` fields |
|---|---|
| `lead.created` | — |
| `lead.status_changed` | `oldStatus`, `newStatus` |
| `lead.assigned` | `ownerId` (null = unassigned), `ownerName` |
| `meeting.scheduled` · `meeting.rescheduled` · `meeting.completed` · `meeting.no_show` · `meeting.cancelled` | `meeting`: `{ id, mode, title, status, startAt, durationMinutes, locationName, address, mapUrl, meetingUrl, assigneeId, outcome }` (ISO timestamps) |

Limits: endpoints per workspace are capped by plan (Free 1, Starter 5, Unlimited unlimited). Webhook management needs `api.manage`.
