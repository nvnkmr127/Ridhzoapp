# Team Management, Roles & Security

## Users & invitations (Settings → Users)
- **Invite teammates by email**; they set their password or sign in with Google.
- Activate/deactivate users at any time (deactivated users stop receiving leads; their data stays).
- **Teams** — group users (by city, product, language) for team-based lead rotation and reporting.
- Seat count follows your plan (Free 1 · Starter 3 · Unlimited unlimited); pending invites count as seats.

## Roles & permissions
Two built-in roles plus unlimited **custom roles**:

| Role | Can do |
|---|---|
| **Admin** | Everything |
| **Member** (sales rep) | Create, edit, assign and change status of leads |
| **Viewer** (custom role without edit) | Read-only access |
| **Custom roles** | Any combination of the permissions below |

**Permission catalog:**
| Permission | Allows |
|---|---|
| Manage users & teams | Invite, deactivate, organise teams |
| Manage roles & permissions | Create/edit roles |
| Edit organization settings | General settings, statuses |
| Manage lead sources & automatic assignment | Connect Facebook/Google/forms, set assignment |
| Manage message templates | Create/edit templates |
| Manage automations | Build/edit automations |
| Manage sequences | Create/edit/delete sequences |
| Edit leads | Create, edit, assign, change status |
| Delete leads | Move leads to recycle bin |
| Permanently delete leads | Empty the recycle bin |
| Merge duplicate leads | Merge records |
| View audit log | See who did what |
| Manage API keys, webhooks & new-lead alerts | Developer & alert settings |
| Manage billing & subscription | Plans and payments |

**Lead privacy between reps:** sales reps see and work only the leads assigned to them (plus leads they are attending a meeting with). Admins and anyone with "Edit organization settings" see all leads. Reps can't open a colleague's lead even with a direct link.

Admins cannot accidentally lock themselves out (self-protection rules), and permission checks are enforced on the server — not just hidden buttons.

## Audit log (Settings → Audit)
A permanent record of important actions: who changed settings, roles, users, deleted/merged leads, created API keys, and more — with time and user. Exportable per lead as a full history.

## Login options
- Email & password (securely hashed)
- **Sign in with Google**
- **Phone number + OTP**
- Password reset by email; sessions can be revoked.

## Data protection
- **Complete workspace isolation** — every query is scoped to your organisation; one business can never see another's data.
- **Encryption** of sensitive secrets (SMTP passwords, API keys, integration tokens) with AES-256-GCM.
- **API keys** are hashed; full vs read-only scopes; rate-limited.
- **Signed webhooks** (HMAC-SHA256) in and out; protection against internal-network (SSRF) abuse.
- **Rate limiting** on public forms and webhooks to stop spam.
- **Recycle bin** (30 days) guards against accidental deletion.
- **Data deletion & privacy requests** — individual lead data can be exported or erased on request (right to be forgotten), and Meta data-deletion callbacks are supported.
- Automatic retries and background job queues so leads and messages are not lost during spikes.

## Why it matters
- Give every person exactly the access they need — no more, no less.
- Know who did what, always.
- Your customer data stays private and safe.
