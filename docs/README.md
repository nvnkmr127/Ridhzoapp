# Ridhzo Documentation Index

Welcome to the Ridhzo documentation repository. This directory houses architectural specifications, API references, feature runbooks, and audit logs.

## Documentation Structure

Documentation is maintained in individual modular source files under `docs/` and consolidated into 10 structured chapters under `docs-consolidated/` via `npm run docs:consolidate`:

- **Modular Specs (`docs/*.md`, `docs/product-kb/*.md`):** Focused, granular specifications for specific features, settings, and APIs.
- **Consolidated Chapters (`docs-consolidated/*.md`):** Auto-generated, complete topic chapters for offline reading, LLM context, and onboarding.

---

## Master Table of Contents

### 1. Platform, Setup & Admin
Consolidated Chapter: [`docs-consolidated/01-platform-setup-and-admin.md`](../docs-consolidated/01-platform-setup-and-admin.md)

- [`README.md`](../README.md) — System overview, tech stack, architecture diagram, and local dev setup.
- [`deploy/railway-setup.md`](../deploy/railway-setup.md) — Railway Postgres, Redis, and worker deployment guide.
- [`docs/RUNBOOK.md`](RUNBOOK.md) — Health checks, deployment, database backups, and secret rotation runbook.
- [`docs/DATABASE.md`](DATABASE.md) — Complete database schema and foreign key constraint reference.
- [`docs/THEME.md`](THEME.md) — Design tokens, color palette, typography, and UI component standards.
- [`docs/SUPERADMIN_PLATFORM_CONSOLE_PRD.md`](SUPERADMIN_PLATFORM_CONSOLE_PRD.md) — Platform super-admin console (`/admin`) requirements.

### 2. Leads & Pipeline
Consolidated Chapter: [`docs-consolidated/02-leads-and-pipeline.md`](../docs-consolidated/02-leads-and-pipeline.md)

- [`docs/LEADS.md`](LEADS.md) — Lead table, filters, bulk selection, ownership assignment, and triage.
- [`docs/LEAD_PROFILE.md`](LEAD_PROFILE.md) — Lead profile header, stage advancement, activity timeline, and playbooks.
- [`docs/QUICK_ADD.md`](QUICK_ADD.md) — Global quick-add drawer with duplicate detection and client-side capture.
- [`docs/GLOBAL_SEARCH.md`](GLOBAL_SEARCH.md) — Command palette (`Cmd+K`) and trigram indexed instant search.
- [`docs/PIPELINE_AND_GOING_COLD.md`](PIPELINE_AND_GOING_COLD.md) — Kanban pipeline board and "going cold" lead resurrection.
- [`docs/product-kb/05_LEADS_MANAGEMENT.md`](product-kb/05_LEADS_MANAGEMENT.md) — Knowledge base guide on lead lifecycle.
- [`docs/product-kb/06_LEAD_PROFILE.md`](product-kb/06_LEAD_PROFILE.md) — Knowledge base guide on 360-degree lead view.
- [`docs/product-kb/07_PIPELINE_AND_STATUSES.md`](product-kb/07_PIPELINE_AND_STATUSES.md) — Knowledge base guide on visual pipelines.

### 3. Lead Sources & Ingestion
Consolidated Chapter: [`docs-consolidated/03-lead-sources-and-capture.md`](../docs-consolidated/03-lead-sources-and-capture.md)

- [`docs/SETTINGS_SOURCES.md`](SETTINGS_SOURCES.md) — Ingestion hub, round-robin rules, and source tracking.
- [`docs/SOURCE_FACEBOOK_LEAD_ADS.md`](SOURCE_FACEBOOK_LEAD_ADS.md) — Meta Lead Ads webhook listener and field mappings.
- [`docs/SOURCE_GOOGLE_LEAD_ADS.md`](SOURCE_GOOGLE_LEAD_ADS.md) — Google Lead Form webhook listener and key validation.
- [`docs/SOURCE_HOSTED_WEB_FORMS.md`](SOURCE_HOSTED_WEB_FORMS.md) — Hosted standalone lead capture forms and embed codes.
- [`docs/SOURCE_WEBSITE_WEBHOOK.md`](SOURCE_WEBSITE_WEBHOOK.md) — Generic website webhook ingestion endpoints.
- [`docs/product-kb/04_LEAD_CAPTURE_SOURCES.md`](product-kb/04_LEAD_CAPTURE_SOURCES.md) — Knowledge base guide on multi-channel lead capture.

### 4. Automations & Sequences
Consolidated Chapter: [`docs-consolidated/04-automations-and-sequences.md`](../docs-consolidated/04-automations-and-sequences.md)

- [`docs/AUTOMATIONS.md`](AUTOMATIONS.md) — Event-driven automation engine (triggers, conditions, actions).
- [`docs/CREATE_AUTOMATION.md`](CREATE_AUTOMATION.md) — Workflow builder UI for multi-step drip logic.
- [`docs/SEQUENCES.md`](SEQUENCES.md) — Automated time-staggered follow-up sequences.
- [`docs/SEQUENCE_DETAIL.md`](SEQUENCE_DETAIL.md) — Funnel visualizer, step completion, and enrollment stats.
- [`docs/SEQUENCE_EDIT.md`](SEQUENCE_EDIT.md) — Sequence editor with message templates and timing offsets.
- [`docs/product-kb/12_AUTOMATIONS.md`](product-kb/12_AUTOMATIONS.md) — Knowledge base guide on automations.
- [`docs/product-kb/13_SEQUENCES.md`](product-kb/13_SEQUENCES.md) — Knowledge base guide on sequences.

### 5. Follow-ups, Messaging & Meetings
Consolidated Chapter: [`docs-consolidated/05-follow-ups-messaging-and-meetings.md`](../docs-consolidated/05-follow-ups-messaging-and-meetings.md)

- [`docs/FOLLOW_UPS.md`](FOLLOW_UPS.md) — Task reminders, overdue escalations, and auto-completion.
- [`docs/SETTINGS_MESSAGE_TEMPLATES.md`](SETTINGS_MESSAGE_TEMPLATES.md) — WhatsApp, Email, and SMS templates with variable tags.
- [`docs/SETTINGS_EMAIL_SMTP.md`](SETTINGS_EMAIL_SMTP.md) — Custom SMTP credentials with Resend dual transport fallback.
- [`docs/product-kb/08_ASSIGNMENT_AND_ALERTS.md`](product-kb/08_ASSIGNMENT_AND_ALERTS.md) — Real-time team assignment and push alerts.
- [`docs/product-kb/09_MESSAGING.md`](product-kb/09_MESSAGING.md) — WhatsApp Business API, one-tap outreach, and templates.
- [`docs/product-kb/10_FOLLOW_UPS.md`](product-kb/10_FOLLOW_UPS.md) — Daily follow-up workflows and reminder badges.
- [`docs/product-kb/11_MEETINGS_AND_BOOKING.md`](product-kb/11_MEETINGS_AND_BOOKING.md) — Field visits, client meetings, and public scheduling links.

### 6. Dashboards, Insights & AI
Consolidated Chapter: [`docs-consolidated/06-dashboards-insights-and-ai.md`](../docs-consolidated/06-dashboards-insights-and-ai.md)

- [`docs/EXECUTIVE_DASHBOARD.md`](EXECUTIVE_DASHBOARD.md) — Executive revenue KPIs, pipeline velocity, and conversion charts.
- [`docs/MY_DASHBOARD.md`](MY_DASHBOARD.md) — Sales rep operational cockpit (today's tasks, overdue calls, hot leads).
- [`docs/INSIGHTS.md`](INSIGHTS.md) — Source attribution ROI, stage transition bottlenecks, and SLA compliance.
- [`docs/AI_ASSISTANT.md`](AI_ASSISTANT.md) — AI Copilot, call recap generation, and Next Best Action streaming.
- [`docs/product-kb/14_AI_FEATURES.md`](product-kb/14_AI_FEATURES.md) — Knowledge base guide on AI features.
- [`docs/product-kb/15_DASHBOARDS_AND_INSIGHTS.md`](product-kb/15_DASHBOARDS_AND_INSIGHTS.md) — Knowledge base guide on reporting and metrics.

### 7. Settings, Team & Integrations
Consolidated Chapter: [`docs-consolidated/07-settings-team-and-integrations.md`](../docs-consolidated/07-settings-team-and-integrations.md)

- [`docs/SETTINGS_OVERVIEW.md`](SETTINGS_OVERVIEW.md) — Settings directory and administrative navigation.
- [`docs/SETTINGS_GENERAL_AND_STATUSES.md`](SETTINGS_GENERAL_AND_STATUSES.md) — Company profile, localization, quiet hours, status lifecycle.
- [`docs/SETTINGS_USERS_AND_ROLES.md`](SETTINGS_USERS_AND_ROLES.md) — 15-permission RBAC matrix, team grouping, invites.
- [`docs/SETTINGS_CUSTOM_FIELDS.md`](SETTINGS_CUSTOM_FIELDS.md) — Custom field definitions, field privacy, and table layout.
- [`docs/SETTINGS_LEAD_INTELLIGENCE.md`](SETTINGS_LEAD_INTELLIGENCE.md) — Third-party data enrichment, inbound email parsing, Meta CAPI.
- [`docs/SETTINGS_API_ACCESS.md`](SETTINGS_API_ACCESS.md) — Bearer API tokens (`pk_`), granular scopes, expiration, and quotas.
- [`docs/SETTINGS_OUTBOUND_WEBHOOKS.md`](SETTINGS_OUTBOUND_WEBHOOKS.md) — Outbound event dispatch, HMAC signing, DLQ retries.
- [`docs/USER_PROFILE.md`](USER_PROFILE.md) — Personal credentials, Google linking, password setup, language preferences.
- [`docs/API_V1.md`](API_V1.md) — REST API reference for mobile app and third-party integrations.
- [`docs/OUTBOUND_WEBHOOK_EVENTS.md`](OUTBOUND_WEBHOOK_EVENTS.md) — Outbound webhook event catalog and JSON schemas.
- [`docs/product-kb/17_TEAM_ROLES_SECURITY.md`](product-kb/17_TEAM_ROLES_SECURITY.md) — Knowledge base guide on RBAC and security.
- [`docs/product-kb/18_INTEGRATIONS_API_WEBHOOKS.md`](product-kb/18_INTEGRATIONS_API_WEBHOOKS.md) — Knowledge base guide on integrations.

### 8. Mobile App & Offline
Consolidated Chapter: [`docs-consolidated/08-mobile-app.md`](../docs-consolidated/08-mobile-app.md)

- [`docs/MOBILE_APP.md`](MOBILE_APP.md) — React Native & Expo mobile app architecture and background sync.
- [`docs/MOBILE_APP_AUDIT_2026-09-27.md`](MOBILE_APP_AUDIT_2026-09-27.md) — Initial native mobile stability and security audit.
- [`docs/MOBILE_PRE_MARKETING_QA_2026-10-01.md`](MOBILE_PRE_MARKETING_QA_2026-10-01.md) — Pre-launch mobile QA report.
- [`docs/MOBILE_FULL_AUDIT_2026-10-02.md`](MOBILE_FULL_AUDIT_2026-10-02.md) — Full mobile audit covering permissions, offline, caller ID.
- [`docs/MOBILE_REAUDIT_2026-10-02.md`](MOBILE_REAUDIT_2026-10-02.md) — Mobile re-audit verifying post-fix stability and live production checks.
- [`docs/product-kb/16_NOTIFICATIONS_MOBILE_OFFLINE.md`](product-kb/16_NOTIFICATIONS_MOBILE_OFFLINE.md) — Mobile notifications and offline SQLite sync.
- [`docs/product-kb/22_MOBILE_APP.md`](product-kb/22_MOBILE_APP.md) — Knowledge base guide on mobile app usage.

### 9. Audits & Production Readiness
Consolidated Chapter: [`docs-consolidated/09-audits-and-reviews.md`](../docs-consolidated/09-audits-and-reviews.md)

- [`docs/WEB_APP_AUDIT_2026-09-28.md`](WEB_APP_AUDIT_2026-09-28.md) — Web app performance, database queries, and sync audit.
- [`docs/PRE_MARKETING_AUDIT_2026-10-01.md`](PRE_MARKETING_AUDIT_2026-10-01.md) — Pre-marketing platform capabilities and readiness audit.
- [`docs/PRODUCTION_AUDIT_2026-10-02.md`](PRODUCTION_AUDIT_2026-10-02.md) — Comprehensive production-readiness audit across security and reliability.

### 10. Product Knowledge Base & Marketing
Consolidated Chapter: [`docs-consolidated/10-product-knowledge-base-and-marketing.md`](../docs-consolidated/10-product-knowledge-base-and-marketing.md)

- [`docs/product-kb/00_README.md`](product-kb/00_README.md) — Product knowledge base overview.
- [`docs/product-kb/01_PRODUCT_OVERVIEW.md`](product-kb/01_PRODUCT_OVERVIEW.md) — High-level platform positioning and value proposition.
- [`docs/product-kb/02_PRICING_AND_PLANS.md`](product-kb/02_PRICING_AND_PLANS.md) — Pricing tiers (Free, Starter, Unlimited) and quotas.
- [`docs/product-kb/03_GETTING_STARTED_EASE_OF_USE.md`](product-kb/03_GETTING_STARTED_EASE_OF_USE.md) — Onboarding walk-through and quick-start.
- [`docs/product-kb/19_INDUSTRY_USE_CASES.md`](product-kb/19_INDUSTRY_USE_CASES.md) — Real estate, interior design, education, and financial playbooks.
- [`docs/product-kb/20_FAQ.md`](product-kb/20_FAQ.md) — Customer and technical FAQ.
- [`docs/product-kb/21_WEBSITE_COPY_KIT.md`](product-kb/21_WEBSITE_COPY_KIT.md) — Marketing website headlines, copy blocks, and feature summaries.

---

## Maintenance Command

To regenerate the consolidated chapters after modifying any source file:

```bash
npm run docs:consolidate
```

To verify in CI that consolidated chapters are up to date:

```bash
npm run docs:consolidate -- --check
```
