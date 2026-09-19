# Settings: General & Statuses Hub (`/settings`)

The **General & Statuses** settings hub is Ridhzo's foundational administrative command center. Located at [`src/app/(dashboard)/settings/page.tsx`](file:///Users/naveenadicharla/Documents/ridhzo/src/app/(dashboard)/settings/page.tsx) and managed by [`GeneralSettingsForm.tsx`](file:///Users/naveenadicharla/Documents/ridhzo/src/components/settings/GeneralSettingsForm.tsx), this surface governs the workspace's core identity, localization, lead capture policies, quiet hours, WhatsApp dispatch engines, AI knowledge context, and custom pipeline status schemas.

---

## 1. Executive Summary & Business Value

In a multi-tenant CRM, an organization's configuration directly impacts data consistency, pipeline velocity, and team compliance:

1. **Global Localization & Time Synchronization**: Accurately normalizes schedules, analytics, quiet hours, and currency across global sales teams and international leads.
2. **AI Business Context Ingestion**: Equips Ridhzo's AI assists with deep business domain awareness (offerings, target personas, communication guidelines) to generate hyper-personalized message drafts and summaries.
3. **Optimistic Concurrency & Audit Accountability**: Protects settings against concurrent overwrites by multiple administrators using timestamp versioning, while logging granular `{ old, new }` diffs to the immutable audit trail.
4. **Dynamic Pipeline Status Taxonomy**: Allows businesses to customize their sales stages (colors, labels, categories) while enforcing database-level integrity checks that prevent orphaned leads or broken automation triggers.
5. **Stage Duration Telemetry**: Built-in analytics measure average and median hours spent in each stage to pinpoint sales pipeline bottlenecks.

---

## 2. Technical Architecture & Component Flow

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

## 3. UI Layout & Visual Hierarchy

The settings surface is split into a 4-column responsive layout (`grid grid-cols-1 lg:grid-cols-4 gap-8`):

### A. Left Administrative Navigation Sidebar (`lg:col-span-1`)
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
10. **Lead Distribution** (`/settings/distribution`)
11. **Audit Log** (`/settings/audit`)
12. **Billing & Plan** (`/settings/billing`)
13. **Integrations** (`/settings/integrations`)

### B. Main Settings Canvas (`lg:col-span-3`)
Organized into discrete enterprise card sections with rounded 16px borders, dark-mode awareness, and subtle muted badges.

---

## 4. Deep Dive: General Settings Form Sections

### Section 1: Company Information & AI Business Knowledge
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

#### AI Context Ingestion Engine ([`AiContextDialog.tsx`](file:///Users/naveenadicharla/Documents/ridhzo/src/components/settings/AiContextDialog.tsx))
- **Purpose**: Instead of generating generic sales replies, Ridhzo's AI message drafter, lead summarizer, and sequence generator refer to `organizations.aiContext` to understand the company's value proposition, tone, and offerings.
- **Document Text Extraction**: Admins can upload company pitch decks, brochures, or guidelines (PDF, DOCX, TXT up to 10MB). Handled via [`extractDocTextAction`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/aiContext.ts) using base64 encoding.
- **AI Improvement Assistant**: Clicking `Improve with AI` runs [`improveAiContextAction`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/aiContext.ts) to structure free-form text into concise instructions.
- **Sample Blueprint**: Offers a built-in baseline template outlining company overview, target audience, core offerings, differentiators, and tone constraints.

---

### Section 2: Localization & Live Dynamic Preview
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

### Section 3: Lead Capture Policies & Workflow Rules
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

#### 1. SLA Escalation Window (`slaHours`)
- Sets the maximum permissible window (in hours) a new inbound lead can remain without sales rep outreach.
- When elapsed, Ridhzo triggers automatic manager escalations and highlights the lead as overdue on executive dashboards. Blank disables SLA tracking.

#### 2. Sequence Quiet Hours (`sequenceWindowStart` & `sequenceWindowEnd`)
- Bounded between 0–23 and 1–24 in the organization's local timezone.
- Prevents automated drip steps from firing late at night or early in the morning.
- Steps scheduled outside the window are deferred by `resolveNextSendableAt()` to the start of the next compliant window.

#### 3. WhatsApp Dispatch Mode (`whatsappMode`)
- **Personal (`personal`)**: One-tap deep link (`https://wa.me/{phone}?text={encoded_message}`). Reps click to open WhatsApp on desktop or mobile and send from their personal/work phone.
- **Business API (`bsp`)**: In-app direct sending via Meta Cloud API or Business Solution Provider (BSP) for centralized multi-agent teams.

#### 4. Mandatory Field Enforcement (`requiredLeadFields`)
- `name` is hard-locked as required across all tenant accounts.
- `email`, `phone`, and `company` can be toggled on or off as required fields for lead creation across web forms, manual triage, and imports.

---

## 5. Optimistic Concurrency & Audit Accountability

### Optimistic Concurrency Control
In team environments, multiple administrators may open settings concurrently. To prevent accidental overwrite collisions:
1. When the form loads, it captures `organization.updatedAt` as `expectedUpdatedAt`.
2. When saving, `updateOrganizationAction` compares `expectedUpdatedAt` with the live database record:
   ```typescript
   if (expected && current.updatedAt.getTime() !== expected.getTime()) {
     return fail("CONFLICT", "Settings were modified by another user. Please refresh and try again.");
   }
   ```
3. If another admin updated settings in the interim, the save is rejected with a descriptive conflict notification, protecting configuration integrity.

### Granular Audit Trail Logging
When changes are successfully persisted, Ridhzo calculates a shallow diff between previous and new states:
- Operational fields (`timezone`, `locale`, `currency`, `dateFormat`, `slaHours`, `whatsappMode`, `sequenceWindowStart`, `sequenceWindowEnd`, `requiredLeadFields`) are logged with exact `{ old, new }` values into `audit_logs`.
- Sensitive or high-cardinality fields (`aiContext`, phone, address) are noted in `changedFields` without persisting raw text, preserving privacy and keeping the audit log performant.

---

## 6. Custom Lead Status Taxonomy & Analytics ([`StatusManagementModal.tsx`](file:///Users/naveenadicharla/Documents/ridhzo/src/components/leads/StatusManagementModal.tsx))

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

### A. Status Categories & System Default Protection
Every status is grouped into one of five functional categories:
1. `open`: Fresh inquiries awaiting first contact.
2. `in_progress`: Actively worked leads (demos, proposals, discussions).
3. `won`: Successfully converted deals (triggers revenue accounting and wins).
4. `lost`: Lost prospects (prompts for loss reason analysis).
5. `unqualified`: Spam, out-of-region, or non-viable inquiries.

#### System Default Immunity
- Default statuses (`new`, `active`, `won`, `lost`, `unqualified`) are seeded on workspace creation.
- System defaults **cannot be deleted**, ensuring core CRM logic, Kanban boards, and funnel analytics always have baseline anchors.
- Display labels and badge colors of system defaults can be customized freely, but their underlying category remains locked to safeguard conversion calculations.

### B. Deletion Integrity & Orphan Prevention Guards
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

### C. Stage Duration Analytics
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

## 7. Complete Code & Symbol Reference

### Frontend Components & Views
- [`SettingsPage`](file:///Users/naveenadicharla/Documents/ridhzo/src/app/(dashboard)/settings/page.tsx): Main server layout rendering navigation sidebar and settings form.
- [`GeneralSettingsForm`](file:///Users/naveenadicharla/Documents/ridhzo/src/components/settings/GeneralSettingsForm.tsx): Client-side form handling company info, localization previews, quiet hours, and unsaved changes warnings.
- [`StatusManagementModal`](file:///Users/naveenadicharla/Documents/ridhzo/src/components/leads/StatusManagementModal.tsx): Tabbed modal for custom status taxonomy management and stage residence analytics.
- [`AiContextDialog`](file:///Users/naveenadicharla/Documents/ridhzo/src/components/settings/AiContextDialog.tsx): Dialog for editing AI business context, document text extraction, and AI rewrites.

### Server Actions
- [`getOrganizationAction`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/organizations.ts#L78): Retrieves organization settings for the authenticated tenant.
- [`updateOrganizationAction`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/organizations.ts#L91): Validates and updates organization profile with optimistic concurrency and audit logging.
- [`getTenantStatusSchemaAction`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/customStatuses.ts#L19): Fetches or seeds the tenant's custom status taxonomy.
- [`addOrUpdateStatusAction`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/customStatuses.ts#L24): Creates or updates custom pipeline statuses.
- [`deleteCustomStatusAction`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/customStatuses.ts#L48): Deletes custom statuses with lead count and automation reference guards.
- [`getStatusDurationAnalyticsAction`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/customStatuses.ts#L87): Computes average and median hours spent per stage.
- [`extractDocTextAction`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/aiContext.ts): Extracts text content from uploaded business documents.
- [`improveAiContextAction`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/aiContext.ts): Uses LLM to refine and structure company context for CRM AI features.

### Domain Services & Database Tables
- [`OrgService`](file:///Users/naveenadicharla/Documents/ridhzo/src/domains/organizations/service.ts): Data layer for tenant organization configuration and concurrency checks.
- [`CustomStatusSchemaService`](file:///Users/naveenadicharla/Documents/ridhzo/src/domains/leads/customStatusSchemaService.ts): Manages status configurations, base category mappings, and deletion validation.
- [`LeadStatusService`](file:///Users/naveenadicharla/Documents/ridhzo/src/domains/leads/leadStatusService.ts): Aggregates stage duration analytics from lead status history logs.
- [`AuditService`](file:///Users/naveenadicharla/Documents/ridhzo/src/domains/audit/service.ts): Writes immutable audit entries with operational field diffs.
- [`customStatusConfigs`](file:///Users/naveenadicharla/Documents/ridhzo/src/db/schema/leads.ts): Database schema storing status keys, labels, colors, categories, and order indexes.
- [`organizations`](file:///Users/naveenadicharla/Documents/ridhzo/src/db/schema/organizations.ts): Database schema storing company details, localization, quiet hours, and AI context.
