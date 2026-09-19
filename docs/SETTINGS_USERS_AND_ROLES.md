# Settings: Users & Roles Hub (`/settings/users`)

The **Users & Roles Hub** is Ridhzo's identity and access management command center. Located at [`src/app/(dashboard)/settings/users/page.tsx`](file:///Users/naveenadicharla/Documents/ridhzo/src/app/(dashboard)/settings/users/page.tsx) and orchestrated by [`UsersManager.tsx`](file:///Users/naveenadicharla/Documents/ridhzo/src/components/users/UsersManager.tsx) and [`RolesManager.tsx`](file:///Users/naveenadicharla/Documents/ridhzo/src/components/users/RolesManager.tsx), this surface governs sales team onboarding, team segmentation, custom role-based access control (RBAC), and user lifecycle states.

---

## 1. Executive Summary & Business Value

In high-velocity multi-rep sales environments, granular permission controls protect pipeline data while streamlining collaboration:

1. **Granular RBAC Security**: Replaces crude "all-or-nothing" access with a 13-permission capability matrix. Sales managers can restrict lead deletion, purge rights, API key access, or audit visibility to specific roles.
2. **Zero-Trust Self-Protection**: Admins cannot accidentally lock themselves out—system-level protections block self-deactivation, self-deletion, and self-role demotion.
3. **Frictionless Onboarding (Email & Direct)**: Supports both tokenized email invitations (where new reps securely set their own passwords) and direct administrator provisioning for immediate call center onboarding.
4. **Resilient Invitation Fallback**: If corporate SMTP delivery is unconfigured or blocked by email filters, Ridhzo generates a secure one-click join link for administrators to share manually via Slack or WhatsApp.
5. **Team-Based Sales Segmentation**: Groups sales reps into functional squads (e.g., *Inbound SDRs*, *Enterprise AEs*, *Commercial Team*) to feed automated round-robin distribution rules.
6. **Soft-Delete Orphan Prevention**: Departing employees are soft-deleted (`deleted_at`), preserving all historical customer notes, activity logs, closed deals, and audit trails.

---

## 2. Technical Architecture & Access Control Flow

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

## 3. UI Layout & Visual Hierarchy

The Users & Roles interface is structured into cohesive cards with high visual clarity:

### A. Navigation & Header
- **Breadcrumb Link**: Ghost button linking back to `/settings`.
- **Title**: `Users & Roles`
- **Subtitle**: *"Invite teammates, assign roles, and manage access."*

### B. Teams Management Card
- Displays active team badges (e.g., `Enterprise`, `Outbound`, `Real Estate Advisors`).
- Inline input with Enter-key submission and double-click prevention (`creatingTeam` guard).
- Calls [`createTeamAction`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/teams.ts).

### C. Email Invitation Card
- Form fields: Recipient Email input + Role selector dropdown.
- **Join Link Copy Fallback**: If outbound SMTP is unconfigured or fails, the row remains in the pending list with an emerald **Copy link** button (`navigator.clipboard.writeText`), allowing manual distribution without blocking onboarding.

### D. Direct Provisioning Card
- Collapsible form for immediate provisioning: First Name, Last Name, Email, Initial Password (validated $\ge$ 6 characters), and initial Role.
- Enforces subscription seat limits before creating the account.

### E. Pending Invitations Table
- Renders pending invitations that have not yet been accepted (`accepted_at IS NULL`).
- Displays email, role badge, "Pending" status, expiration date (7 days from creation), and a revoke button (`revokeInvitationAction`).

### F. Searchable Members Roster
- **Search Bar**: Real-time client-side filter querying first name, last name, and email.
- **Roster Rows**:
  - Full Name & Email.
  - Current User Indicator (`You` badge).
  - Status Badge (`Active` in green vs `Inactive` in muted gray).
  - **Inline Role Selector**: Dropdown to change roles on the fly (disabled for own account).
  - **Inline Team Selector**: Dropdown to reassign squads.
  - **Activation Toggle**: `Activate` / `Deactivate` button (disabled for self).
  - **Delete Action**: Trash button triggering soft deletion (disabled for self).

### G. Custom Roles & Permissions Grid (`RolesManager.tsx`)
- Appears if the administrator has `roles.manage` permissions.
- Allows creating custom roles (e.g., *Sales Lead*, *Junior SDR*, *External Auditor*).
- Displays a 2-column checkbox grid of all 13 system permissions.

---

## 4. Granular RBAC Permissions Catalog

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

### System Roles vs. Custom Roles
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

## 5. User Lifecycle & Onboarding Workflows

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

### 1. Invitation Cryptography & Acceptance ([`src/lib/actions/invitations.ts`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/invitations.ts))
- When an invite is created, a high-entropy random token is generated.
- The raw token is sent in the URL (`/invite/{token}`).
- The database stores only the SHA-256 hash (`tokenHash`). Even if the database is inspected, pending invite tokens cannot be reverse-engineered.
- Tokens expire automatically after **7 days**.
- When accepted on [`/invite/[token]`](file:///Users/naveenadicharla/Documents/ridhzo/src/app/invite/%5Btoken%5D/page.tsx), the user sets their own password and name. The record is created with the pre-assigned `roleId` and tenant `organizationId`.

### 2. Soft-Delete Orphan Prevention ([`src/lib/actions/users.ts#L117`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/users.ts#L117))
- Hard deleting a user would cause foreign key failures or set `assigned_to` and `created_by` columns to NULL across hundreds of leads, notes, and activity logs.
- [`UserService.remove`](file:///Users/naveenadicharla/Documents/ridhzo/src/domains/users/service.ts) executes a **soft-delete**:
  ```sql
  UPDATE users SET deleted_at = NOW(), is_active = FALSE WHERE id = :userId AND organization_id = :orgId;
  ```
- The rep is immediately barred from logging in and excluded from active user dropdowns, but historical customer interactions retain full attribution.

---

## 6. Security, Self-Protection & Audit Accountability

To prevent administrative lockout and maintain audit compliance, the Users & Roles hub enforces strict server-side rules:

### 1. Self-Protection Invariants ([`src/lib/actions/users.ts`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/users.ts))
If an administrator attempts an action targeting their own account:
- **Deactivation Guard**: `if (id === userId && !isActive) return fail("VALIDATION", "You can't deactivate your own account.");`
- **Role Demotion Guard**: `if (id === userId) return fail("VALIDATION", "You can't change your own role.");`
- **Deletion Guard**: `if (id === userId) return fail("VALIDATION", "You can't delete your own account.");`

### 2. Seat Licensing Safeguard ([`PlanService.assertCanAddSeat`](file:///Users/naveenadicharla/Documents/ridhzo/src/domains/billing/planService.ts))
Before sending an invite or creating a user, Ridhzo verifies that active seats + pending invites do not exceed the tenant's purchased subscription plan. If exceeded, the action halts with a prompt to upgrade seats on `/settings/billing`.

### 3. Active Users Cache Optimization
The active users list is consumed across lead assignment pickers, filter dropdowns, and mentions:
- Cached for 60 seconds per organization via Next.js `unstable_cache`.
- Cache tags (`["active-users"]`) are invalidated on user creation, deactivation, or deletion using `revalidateTag("active-users")`.

### 4. Audit Log Integration
All identity modifications write immutable audit entries via [`AuditService.log`](file:///Users/naveenadicharla/Documents/ridhzo/src/domains/audit/service.ts):
- `user.create`: Records newly provisioned email.
- `user.invite`: Records invite recipient and email delivery status.
- `user.role_change`: Records target user and new `roleId`.
- `user.activate` / `user.deactivate`: Records state transition.
- `role.create` / `role.delete`: Records role metadata.
- `role.update`: Logs specific `added` and `removed` permission arrays.

---

## 7. Complete Code & Symbol Reference

### Frontend Components & Views
- [`UsersPage`](file:///Users/naveenadicharla/Documents/ridhzo/src/app/(dashboard)/settings/users/page.tsx): Main server component verifying permissions and pre-fetching users, teams, roles, and invites.
- [`UsersManager`](file:///Users/naveenadicharla/Documents/ridhzo/src/components/users/UsersManager.tsx): Client-side manager for teams, email invites, direct provisioning, and the members roster.
- [`RolesManager`](file:///Users/naveenadicharla/Documents/ridhzo/src/components/users/RolesManager.tsx): Interactive RBAC canvas rendering custom role cards and permission checkbox matrices.

### Server Actions
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

### Domain Services & Database Tables
- [`UserService`](file:///Users/naveenadicharla/Documents/ridhzo/src/domains/users/service.ts): Database service for user records and soft deletion.
- [`RoleService`](file:///Users/naveenadicharla/Documents/ridhzo/src/domains/roles/service.ts): Service managing system and custom tenant roles.
- [`TeamService`](file:///Users/naveenadicharla/Documents/ridhzo/src/domains/teams/service.ts): Service managing organization team squads.
- [`InvitationService`](file:///Users/naveenadicharla/Documents/ridhzo/src/domains/invitations/service.ts): Service managing tokens, hashing, and invite acceptance.
- [`PlanService`](file:///Users/naveenadicharla/Documents/ridhzo/src/domains/billing/planService.ts): Enforces seat counts and subscription constraints.
- [`users`](file:///Users/naveenadicharla/Documents/ridhzo/src/db/schema/users.ts#L26): Drizzle table storing member records, credentials, team/role IDs, and `deletedAt`.
- [`roles`](file:///Users/naveenadicharla/Documents/ridhzo/src/db/schema/users.ts#L8): Drizzle table storing custom and system roles and JSONB permissions.
- [`teams`](file:///Users/naveenadicharla/Documents/ridhzo/src/db/schema/users.ts#L18): Drizzle table storing organization team squads.
- [`invitations`](file:///Users/naveenadicharla/Documents/ridhzo/src/db/schema/system.ts#L85): Drizzle table storing SHA-256 hashed invite tokens and expiration timestamps.
