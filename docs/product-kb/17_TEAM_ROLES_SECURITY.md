# Team Management, Roles & Security

## Users & invitations (Settings → Users)
- **Invite teammates by email**; they set their password or sign in with Google or Mobile OTP.
- Activate/deactivate users at any time (deactivated users stop receiving leads; their data stays).
- **Seat calculation:** Seats are counted strictly for active members and pending invitations. Soft-deleted and deactivated team members are excluded, ensuring you never pay for past staff.
- **Teams** — group users (by city, product, language) for team-based lead rotation and reporting.
- Seat count follows your plan (Free 1 · Starter 3 · Unlimited unlimited).

## Roles & permissions
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

## In-App Support Ticket Management (Settings → Support)
- Built-in support ticketing allows workspace members to raise, track, and manage help tickets directly within Ridhzo.
- Tickets are processed in real time by the Ridhzo technical team from the central platform console, ensuring fast response times without leaving the CRM.

## Audit log (Settings → Audit)
A permanent record of important actions: who changed settings, roles, users, deleted/merged leads, created API keys, and more — with time and user. Exportable per lead as a full history.

## Login & Session Security
- Email & password (securely hashed)
- **Sign in with Google**
- **Mobile Phone number + OTP** (via SMS/Watxio)
- **Mobile Token Revocation:** Mobile sessions can be revoked on-demand (`/api/mobile/auth/token-revoke`), immediately invalidating device JWTs.
- **Session Caching & Token Pruning:** User sessions are securely cached; stale mobile push tokens are pruned automatically to maintain tight device security.

## Data protection & Billing
- **Complete workspace isolation** — every query is scoped to your organisation; one business can never see another's data.
- **Encryption** of sensitive secrets (SMTP passwords, API keys, integration tokens) with AES-256-GCM.
- **API keys** are hashed; full vs read-only scopes; rate-limited.
- **Signed webhooks** (HMAC-SHA256) in and out; protection against internal-network (SSRF) abuse.
- **Rate limiting** on public forms and webhooks to stop spam.
- **Recycle bin** (30 days) guards against accidental deletion.
- **Permanent Purge:** Compliant hard deletion for GDPR / right-to-be-forgotten requests.
- **GST Invoices & Payment Webhooks:** Automatic GST-compliant tax invoices generated via payment webhooks on Razorpay, with multi-currency handling.

## Why it matters
- Give every person exactly the access they need — no more, no less.
- Know who did what, always.
- Your customer data stays private and safe.
