# Settings Hub Overview (`/settings`)

## 1. Executive Summary & Layout Structure

The **Settings Hub** (`/settings`) is the administrative control center of Ridhzo CRM. It coordinates all organization-wide configuration, data taxonomies, messaging templates, security controls, and third-party integrations.

The route is structured as a two-column responsive grid:
- **Left Column (Navigation Sidebar):** A persistent 13-item navigation list categorizing every configuration surface in the platform.
- **Right Column (Main Canvas):** Hosts the **General & Statuses** configuration interface by default, displaying company identity, business context preambles for AI features, timezone/currency localization, quiet hours, and pipeline stage taxonomies.

---

## 2. File & Route Architecture

| Purpose | File Path |
| :--- | :--- |
| **Settings Directory Page** | [`src/app/(dashboard)/settings/page.tsx`](file:///Users/naveenadicharla/Documents/ridhzo/src/app/(dashboard)/settings/page.tsx) |
| **General Settings Form** | [`src/components/settings/GeneralSettingsForm.tsx`](file:///Users/naveenadicharla/Documents/ridhzo/src/components/settings/GeneralSettingsForm.tsx) |
| **Organization Server Action** | [`src/lib/actions/organizations.ts`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/organizations.ts) |
| **Role-Based Access Control** | [`src/lib/rbac.ts`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/rbac.ts) |

---

## 3. Master Settings Navigation Map (13 Dedicated Surfaces)

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
 ├── 10. Lead Distribution (/settings/distribution) ─── Automated lead routing rules & round-robin
 ├── 11. Audit Log (/settings/audit) ─── Chronological compliance trail for security events
 ├── 12. Billing & Plan (/settings/billing) ─── Subscription tiers, seat count, invoices
 └── 13. Integrations (/settings/integrations) ─── Connected apps and ecosystem connectors
```

### Detailed Section Directory:

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
| **Lead Distribution** | `/settings/distribution` | *(Planned)* | Lead assignment rules by source/tags, round-robin load distribution. |
| **Audit Log** | `/settings/audit` | *(Planned)* | Immutable record of user actions, auth events, secret reveals, and configuration changes. |
| **Billing & Plan** | `/settings/billing` | *(Planned)* | Stripe billing portal, seat allocation, subscription tiers. |
| **Integrations** | `/settings/integrations` | *(Planned)* | Master dashboard for active third-party connections. |

---

## 4. Role-Based Access Control (RBAC)

Access to the settings hub and its sub-pages is strictly enforced server-side:
- **`settings.manage`:** Required to view and modify General Settings, Lead Sources, Message Templates, Custom Fields, and Lead Intelligence.
- **`users.manage` / `users.view`:** Required to view or manage Users & Roles.
- **`api.manage`:** Required to generate or revoke API keys and manage Outbound Webhooks.
- **Unauthorized Handling:** Users lacking required permissions are automatically redirected to `/leads`.
