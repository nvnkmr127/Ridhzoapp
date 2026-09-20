# PRD — Super-Admin Platform Console (Full)

**Status:** Documenting shipped surface + prioritized gaps · **Last updated:** 2026-09-20
**Owner:** Platform / Founder-ops · **Scope:** `/admin`, tenant impersonation, and all `requireSuperAdmin`-gated actions

> This is a "reverse + forward" spec: it documents the platform-operator console that already exists (`src/app/(dashboard)/admin`, `src/components/platform/*`, `src/lib/actions/platform.ts`, `src/domains/platform/*`) and specs the remaining gaps found in review. Requirements already implemented are marked **[Shipped]**; gaps are **[Gap]**.

---

## Problem Statement

Ridhzo is a multi-tenant lead CRM. Running it as a business requires a single operator surface to manage the whole fleet — provision plans, resolve billing, support tenants, investigate incidents, and satisfy compliance (GDPR/DSR) requests — **without** shipping DB scripts or giving engineers ad-hoc production access. Without one governed console, every operational task becomes a manual SQL/one-off, which is slow, unauditable, and risky (a mistyped `WHERE` can touch the wrong tenant).

**Who experiences it:** the platform operator(s) / founder-ops (1–5 people today), plus, indirectly, every tenant whose plan, suspension, credits, or support ticket flows through it.

**Cost of not solving:** unauditable production access, slow support/billing resolution, compliance exposure (no DSR tooling), and no safe way to reproduce a tenant's view when debugging.

---

## Goals

1. **One governed surface for all fleet operations** — a super-admin can run every routine platform task (plan, suspend, credits, billing, support, compliance, incident) from `/admin` with no direct DB access. *(Measure: % of ops tasks doable in-console vs. requiring a script.)*
2. **Every privileged action is authorized and audited** — 100% of state-changing platform actions pass `requireSuperAdmin` and write an `audit_logs` row attributable to the operator. *(Measure: audit coverage = mutating actions with a log ÷ total mutating actions.)*
3. **Safe tenant reproduction** — an operator can view a tenant exactly as its users do, in a read-only mode that cannot alter tenant data. *(Measure: 0 tenant writes originate from read-only impersonation sessions.)*
4. **Fast incident containment** — an operator can suspend a tenant, revoke sessions, and enable maintenance mode, and the effect is enforced within one session-refresh window (≤60s). *(Measure: time from action → enforced.)*
5. **Compliance-ready** — DSR subject lookup, dossier export, and right-to-be-forgotten are self-serve for the operator. *(Measure: DSR request turnaround.)*

---

## Non-Goals

1. **Tenant-facing admin** — this console is for the platform operator, not tenant admins (tenant settings live under `/settings`). *Separate surface, separate RBAC.*
2. **A general BI/analytics warehouse** — RevOps metrics here are operational, not a replacement for a data warehouse. *Different tool, different latency needs.*
3. **Multi-operator RBAC granularity** — super-admin is currently all-or-nothing; per-permission platform roles (e.g. "support-only" operator) are out of scope for v1. *(See P2.)*
4. **Editing tenant business data at will** — impersonation exists to reproduce/support, not to routinely author a tenant's leads; read-only is the default posture we want to encourage.
5. **Self-service operator onboarding** — super-admin is granted via CLI (`grant:superadmin`), not a UI. *Low volume; UI is unjustified.*

---

## Personas

- **Platform Operator (primary)** — founder / ops. Manages the whole fleet. Trusted, low-volume, high-blast-radius.
- **Support Operator (secondary, future)** — handles tickets and read-only tenant lookups; should *not* have destructive powers. Today collapses into "super-admin".
- **Compliance Operator (secondary)** — runs DSR/RTBF. Today collapses into "super-admin".

---

## User Stories

### Fleet & tenant management
- As a **platform operator**, I want to see every organization with plan, status, and health so that I can triage the fleet at a glance. **[Shipped]**
- As a **platform operator**, I want to set a tenant's plan / trial so that I can provision or comp accounts. **[Shipped]**
- As a **platform operator**, I want to suspend/reactivate a tenant so that I can contain abuse or non-payment, and have it take effect immediately. **[Shipped]**
- As a **platform operator**, I want to hard-delete a tenant (with typed confirmation) so that I can honor account-closure requests. **[Shipped]**
- As a **platform operator**, I want a Tenant 360 view (usage, billing, sources, health, ingestion failures) so that I can diagnose one tenant deeply. **[Shipped]**

### Impersonation & support
- As a **platform operator**, I want to impersonate a tenant **read-only** so that I can reproduce their view without any risk of altering their data. **[Shipped]**
- As a **platform operator**, I want a persistent banner while impersonating so that I never forget I'm acting inside a tenant. **[Shipped]**
- As a **support operator**, I want a support-ticket desk (assign, reply, note, status) so that I can resolve tenant issues in one place. **[Shipped]**

### Billing & RevOps
- As a **platform operator**, I want RevOps metrics (MRR, churn risk, funnel) so that I can see fleet health. **[Shipped]**
- As a **platform operator**, I want to grant credits, generate/void invoices, issue credit notes, and manage coupons so that I can handle billing exceptions. **[Shipped]**
- As a **platform operator**, I want billing-lifecycle tools (extend grace, mark manually paid, dunning, simulate failure) so that I can manage dunning without touching Razorpay directly. **[Shipped]**

### Security, incident & compliance
- As a **platform operator**, I want to revoke a user's or an org's sessions so that a compromised account is locked out fast. **[Shipped — fixed 2026-09-20]**
- As a **platform operator**, I want a maintenance mode that actually locks tenants out (except super-admins) so that I can safely run migrations. **[Shipped — fixed 2026-09-20]**
- As a **platform operator**, I want anomaly/threat detection with resolve/remediate so that I can respond to security signals. **[Shipped]**
- As a **compliance operator**, I want DSR subject search, dossier export, and right-to-be-forgotten so that I can satisfy GDPR requests. **[Shipped]**
- As a **platform operator**, I want a system broadcast + ops alerts + executive digest so that I can communicate and stay informed. **[Shipped]**

---

## Requirements

### Must-Have (P0) — the console is not viable without these
All P0s are **[Shipped]** and gated by `requireSuperAdmin`; listed here as the contract.

| # | Requirement | Acceptance criteria |
|---|-------------|---------------------|
| P0-1 | **Authorization on every mutation** | Given a non-super-admin, when they call any platform action or open `/admin`, then they are refused (`Forbidden`) / redirected to `/leads`. |
| P0-2 | **Audit on every mutation** | Given any state-changing platform action, when it completes, then an `audit_logs` row exists attributing it to the operator (platform-scoped events log under the system org, never dropped). |
| P0-3 | **Plan / trial management** | Operator can set plan (free/pro/business) + trial days; org row + audit updated; unknown org → clear error. |
| P0-4 | **Suspend / reactivate (instant)** | Given a suspended org, when its user loads any page, then they are sent to `/suspended` within ≤60s (session refresh), super-admins exempt. |
| P0-5 | **Read-only impersonation cannot write** | Given read-only impersonation, when the operator attempts *any* mutation (permission-gated **or** `requireOrg`-only), then it is refused. *(Enforced via `hasPermission` `.view`-only + `assertWritable`.)* |
| P0-6 | **Session revocation enforced** | Given an operator revokes a user/org, when that session's next request lands (≤60s), then it is treated as unauthenticated. Sessions issued before the revoke timestamp are the only ones affected. |
| P0-7 | **Hard delete is guarded + transactional** | Requires typing the tenant slug or name; deletes all child rows then the org in one transaction; partial failure rolls back. |
| P0-8 | **DSR / right-to-be-forgotten** | Operator can search a subject, export a dossier, and anonymize a lead; action is audited. |

### Nice-to-Have (P1) — fast follows
| # | Requirement | Rationale / acceptance |
|---|-------------|------------------------|
| P1-1 | **Confirm dialogs for suspend & bulk-suspend** *(Gap)* | Replace native `confirm()` in `PlatformConsole` with the same `AlertDialog` pattern hard-delete uses; consistent, styleable, testable. AC: destructive fleet actions use an in-app dialog naming the tenant(s) and count. |
| P1-2 | **Hard-delete FK-coverage guard** *(Gap)* | Add a test/assertion that cross-checks every table with an FK to `organizations`/`leads` against the delete list, so a future schema addition can't silently make hard-delete roll back. AC: test fails if an org-referencing table is missing from the delete routine. |
| P1-3 | **Reduced-motion + tab a11y polish** *(partly done)* | `motion-reduce:animate-none` on the threat badge; `aria-current` on active tabs **[Shipped]**. |
| P1-4 | **Bulk operations beyond suspend** | Bulk plan-set / bulk credit-grant with partial-success reporting (suspend already loops sequentially — `ponytail:` note flags a batch endpoint when fleet > 100). |
| P1-5 | **Maintenance mode scheduling + message preview** | Schedule a window and preview the tenant-facing screen before enabling. |

### Future Considerations (P2) — design for, don't build
| # | Requirement | Why design for it now |
|---|-------------|-----------------------|
| P2-1 | **Granular platform roles** (support-only, billing-only, compliance-only, read-only auditor) | Today super-admin is all-or-nothing; the audit already records `by: super_admin`. Keep action authorization centralized (`requireSuperAdmin`) so it can later branch on a platform-role without touching call sites. |
| P2-2 | **Session-revocation for pre-fix sessions / global "revoke all"** | Current revoke can't touch sessions issued before `authAt` existed; a token-version column would make revocation absolute. |
| P2-3 | **Config in migrations, not runtime DDL** | `platform_configs` is created lazily via `CREATE TABLE IF NOT EXISTS`; move to a drizzle migration so the schema is declarative and DDL grants aren't needed at runtime. |
| P2-4 | **Batch fleet endpoints** | For 100+ orgs, replace sequential loops with set-based operations. |
| P2-5 | **Operator activity replay / immutable audit export** | Signed, exportable audit trail for the platform events themselves. |

---

## Success Metrics

### Leading (days–weeks)
- **In-console task coverage** — ≥ 95% of routine ops tasks done without a DB script. *Method: ops log / self-report. Eval: 30 days.*
- **Audit coverage** — 100% of mutating platform actions produce an audit row. *Method: static enumeration (mutating actions ÷ actions with `AuditService.log`). Eval: per release.*
- **Read-only write leakage** — **0** tenant writes originate from a read-only impersonation session. *Method: `assertWritable` throws + no `impersonate_readonly` writes in audit. Eval: continuous.*
- **Enforcement latency** — suspend / revoke / maintenance enforced ≤ 60s. *Method: session-refresh interval. Eval: per release.*

### Lagging (weeks–months)
- **Support/billing resolution time** — trend down as tools replace manual work.
- **Compliance turnaround** — DSR request → dossier/RTBF completed, target < 24h.
- **Incidents caused by direct DB access** — trend to 0.

---

## Open Questions

- **[stakeholder]** Do we need granular platform roles (P2-1) before adding a second/third operator, or is all-or-nothing acceptable at current headcount? *(Non-blocking; affects when P2-1 lands.)*
- **[legal]** For right-to-be-forgotten, is lead **anonymization** sufficient, or do specific jurisdictions require hard deletion of the row? *(Blocking for any compliance SLA commitment.)*
- **[engineering]** Should platform-scoped audit events keep logging under the system-org sentinel (`00000…000`), or do we want a dedicated `platform_audit` stream? *(Non-blocking; current behavior is "never dropped".)*
- **[data]** What is the authoritative churn-risk definition powering RevOps, and does it match Finance's? *(Non-blocking.)*
- **[engineering]** Do we adopt a token-version column to make session revocation absolute (P2-2), accepting a forced global re-login on rollout? *(Non-blocking.)*

---

## Timeline Considerations

- **No hard external deadline.** Phasing is driven by operator pain and compliance risk.
- **Delivered this cycle (2026-09-20):** P0-5 (read-only write guard via `assertWritable`), P0-6 (session revocation enforcement), maintenance-mode enforcement, platform audit-log always-on, plus a11y/build/lint cleanups.
- **Phase 1 (next):** P1-1 (confirm dialogs), P1-2 (FK-coverage guard) — both low-effort, high-safety.
- **Phase 2:** P1-4/P1-5 (bulk ops, maintenance scheduling).
- **Phase 3:** P2-1 (granular roles) — largest, gate on second-operator need.
- **Dependency:** P2-3 (config → migrations) should precede any environment where the DB user lacks DDL rights.
