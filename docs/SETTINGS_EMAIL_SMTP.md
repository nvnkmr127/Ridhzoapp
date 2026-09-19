# Settings: Email (SMTP) Hub (`/settings/email`)

The **Email (SMTP) Hub** is Ridhzo's outbound email infrastructure manager. Located at [`src/app/(dashboard)/settings/email/page.tsx`](file:///Users/naveenadicharla/Documents/ridhzo/src/app/(dashboard)/settings/email/page.tsx) and managed by [`EmailSettingsManager.tsx`](file:///Users/naveenadicharla/Documents/ridhzo/src/components/settings/EmailSettingsManager.tsx), this feature allows organizations to route all outbound customer communications through their own corporate mail servers (Google Workspace, Microsoft 365, Amazon SES, SendGrid, Mailgun, or private SMTP servers) with AES-256-GCM credential encryption and automated fallback resilience.

---

## 1. Executive Summary & Business Value

Outbound email deliverability and sender reputation directly influence sales engagement:

1. **Custom Domain Authority & SPF/DKIM Alignment**: Sending sales emails from your own domain (e.g., `sales@acme.com`) rather than a shared generic CRM domain dramatically improves inbox placement, eliminates spam flagging, and reinforces brand legitimacy.
2. **Zero-Knowledge Credential Encryption**: Sensitive SMTP passwords are encrypted at rest using industry-standard AES-256-GCM. Passwords are never returned in client JSON responses or exposed in browser HTML.
3. **Resilient Dual-Transport Architecture**: If an organization's custom mail server experiences downtime, rate limits, or network errors, Ridhzo's mailer automatically falls back to the shared high-availability platform transport ([`mailer.ts`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/mail/mailer.ts#L44)), guaranteeing invitations and customer messages are never lost.
4. **Pre-Flight Diagnostic Testing**: Administrators can send real-time diagnostic test emails to their own accounts before turning on custom sending, with live error surfacing for DNS, TLS, or authentication mismatches.

---

## 2. Technical Architecture & Mail Delivery Pipeline

```
+----------------------------------------------------------------------------------------------------+
|                                    EMAIL SETTINGS ROUTE & RBAC                                     |
|                                                                                                    |
|  Server Route: src/app/(dashboard)/settings/email/page.tsx                                         |
|  Authorization Guard: if (!hasPermission("settings.manage")) redirect("/leads")                   |
|  Data Pre-fetch: EmailSettingsService.getView(organizationId)                                      |
+----------------------------------------------------------------------------------------------------+
                                                |
                                                v
+----------------------------------------------------------------------------------------------------+
|                                    EMAIL SETTINGS MANAGER UI                                       |
|                                                                                                    |
|  Component: src/components/settings/EmailSettingsManager.tsx                                       |
|  - Sender Profile: From Name, From Email                                                           |
|  - SMTP Host & Port: Host, Port (587 / 465), TLS toggle (smtpSecure)                               |
|  - Authentication: Username, Password (blank preserves existing encrypted hash)                    |
|  - Activation Switch: "Use my SMTP server" toggle                                                  |
|  - Diagnostic Engine: "Send test email" button with live error surfacing                           |
+----------------------------------------------------------------------------------------------------+
                                                |
                                                v
+----------------------------------------------------------------------------------------------------+
|                                    OUTBOUND MAILER ORCHESTRATOR                                    |
|                                                                                                    |
|  Service: src/lib/mail/mailer.ts (sendEmail)                                                       |
|                                                                                                    |
|  Is organizationId provided AND email_settings.enabled === 1?                                      |
|                                                                                                    |
|            YES (Custom SMTP Enabled)                               NO (Custom SMTP Off)            |
|                       |                                                     |                      |
|                       v                                                     v                      |
|  [Nodemailer Custom Transport]                                 [Shared Resend Transport]           |
|  - Decrypts AES-256-GCM password                                - Uses platform MAIL_FROM          |
|  - Connects to tenant host:port                                - Fallback if tenant SMTP fails    |
|  - Sends from tenant domain                                                                        |
+----------------------------------------------------------------------------------------------------+
```

---

## 3. UI Layout & Visual Hierarchy

The Email Settings Hub is contained within a centered, high-focus container (`max-w-2xl`):

### A. Navigation & Header
- **Breadcrumb Link**: Ghost button with back arrow linking back to `/settings`.
- **Title**: `Email (SMTP)`
- **Subtitle**: *"Send lead emails from your own mail server. When off, the built-in transport is used."*

### B. Sender Identity Card
Configures the public-facing identity visible in the recipient's inbox:
- **From Name**: Friendly sender name (e.g., *"Acme Advisory Group"*).
- **From Email**: Validated corporate address (e.g., `advisors@acme.com`). Validated via Zod email regex.

```
+----------------------------------------------------------------------------------------------------+
|                                             SENDER                                                 |
+----------------------------------------------------------------------------------------------------+
|  From Name:   [ Acme Advisory Group                   ]                                            |
|  From Email:  [ advisors@acme.com                     ]                                            |
+----------------------------------------------------------------------------------------------------+
```

### C. SMTP Server Configuration Card
Configures the network credentials for connecting to the mail transfer agent:
- **Host**: SMTP domain or IP (e.g., `smtp.gmail.com`, `smtp.sendgrid.net`, `smtp.office365.com`).
- **Port**: Port number (`587` for STARTTLS, `465` for direct SSL/TLS).
- **Username**: SMTP login account or API key token (e.g., `apikey`).
- **Password**: Password input field with intelligent state preservation:
  - If a password is already stored, the input placeholder renders `•••••••• (leave blank to keep)`.
  - Leaving the field blank on update preserves the previously encrypted password without forcing the admin to re-enter credentials.
- **TLS (SSL) Checkbox**: Toggles `smtpSecure` (on for port 465, off for 587/STARTTLS).

```
+----------------------------------------------------------------------------------------------------+
|                                           SMTP SERVER                                              |
+----------------------------------------------------------------------------------------------------+
|  Host:        [ smtp.sendgrid.net                     ]  Port:     [ 587                         ] |
|  Username:    [ apikey                                ]  Password: [ •••••••• (leave blank to keep)]|
|                                                                                                    |
|  [x] Use TLS (SSL) — on for port 465, off for 587/STARTTLS                                         |
+----------------------------------------------------------------------------------------------------+
```

### D. Activation Switch & Diagnostic Actions
- **Custom SMTP Activation Toggle**:
  - `Use my SMTP server`: Master switch activating custom sending.
  - Subtitle: *"When off, emails send via the built-in transport."*
  - **Incomplete Config Gate**: The toggle cannot be enabled unless host, port, username, password, and from-email are all present ([`src/lib/actions/emailSettings.ts#L37`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/emailSettings.ts#L37)).
- **Action Buttons**:
  - `Save`: Persists configuration.
  - `Send test email`: Fires an immediate diagnostic message to the logged-in administrator's account.

```
+----------------------------------------------------------------------------------------------------+
|  Use my SMTP server                                                            [  (o) Toggle: ON ] |
|  When off, emails send via the built-in transport.                                                 |
+----------------------------------------------------------------------------------------------------+
|  [ Save Button ]   [ Send test email (Send Icon) ]                                                 |
|                                                                                                    |
|  The password is encrypted at rest and never shown again. Test sends to your own account email     |
|  using the saved settings — do this before turning the toggle on.                                  |
+----------------------------------------------------------------------------------------------------+
```

---

## 4. Cryptographic Security & AES-256-GCM Encryption

SMTP credentials allow unauthorized mail dispatch if compromised. Ridhzo enforces zero-knowledge storage principles:

```
+----------------------------------------------------------------------------------------------------+
|                                    SECURITY SPECIFICATION                                          |
+-----------------------+----------------------------------------------------------------------------+
| Attribute             | Technical Implementation                                                   |
+-----------------------+----------------------------------------------------------------------------+
| Cipher Algorithm      | AES-256-GCM (Galois/Counter Mode with integrity authentication tag)        |
| Key Derivation        | process.env.ENCRYPTION_SECRET (32-byte secret key)                         |
| Encrypted Column      | email_settings.smtp_password_enc (stored as ciphertext:iv:tag)             |
| Client Exposure       | ZERO. Only boolean `hasPassword` is returned to the browser.               |
| Empty Update Handling | Blank passwords on update retain the existing encrypted hash.              |
+-----------------------+----------------------------------------------------------------------------+
```

### Database Schema ([`emailSettings`](file:///Users/naveenadicharla/Documents/ridhzo/src/db/schema/emailSettings.ts#L7))
```typescript
export const emailSettings = pgTable('email_settings', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').references(() => organizations.id, { onDelete: 'cascade' }).notNull().unique(),
  fromName: varchar('from_name', { length: 255 }),
  fromEmail: varchar('from_email', { length: 255 }),
  smtpHost: varchar('smtp_host', { length: 255 }),
  smtpPort: integer('smtp_port'),
  smtpSecure: integer('smtp_secure').default(1).notNull(), // 1 = TLS (465), 0 = STARTTLS/none
  smtpUser: varchar('smtp_user', { length: 255 }),
  smtpPasswordEnc: text('smtp_password_enc'), // AES-256-GCM ciphertext
  enabled: integer('enabled').default(0).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
```

---

## 5. Dual-Transport Engine & Resilient Fallback

Ridhzo’s mailer ([`src/lib/mail/mailer.ts`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/mail/mailer.ts)) implements an intelligent dual-transport system:

### 1. Lazy Runtime Isolation
`nodemailer` and `EmailSettingsService` are imported dynamically inside `sendViaOrgSmtp()`:
```typescript
const { EmailSettingsService } = await import("@/domains/organizations/emailSettingsService");
const nodemailer = (await import("nodemailer")).default;
```
This ensures heavyweight SMTP libraries and native Node sockets never leak into client-side code or edge runtime bundles.

### 2. Automatic Fault-Tolerant Fallback
Network timeouts or misconfigured SMTP credentials must not block mission-critical communications (such as team member invites or deal notifications):
```typescript
export async function sendEmail(mail: Mail, organizationId?: string): Promise<void> {
  if (organizationId) {
    try {
      if (await sendViaOrgSmtp(organizationId, mail)) return;
    } catch (e) {
      console.error("[mail] tenant SMTP send failed, falling back to shared transport", (e as Error)?.message);
    }
  }

  // Fallback to shared platform transport (Resend in production, console in development)
  const r = resend();
  if (!r) {
    console.log(`[mail:dev] to=${mail.to} subject="${mail.subject}"\n${mail.html}`);
    return;
  }
  await r.emails.send({ from: FROM, to: mail.to, subject: mail.subject, html: mail.html });
}
```
If the tenant's mail server rejects the message, Ridhzo catches the error, logs the failure for administrative review, and delivers the message via the platform's shared transport. **No emails are silently dropped.**

---

## 6. Pre-Flight Diagnostic Testing Flow

Before enabling custom SMTP, administrators can test their configuration:

1. Admin fills in Host, Port, User, Password, and From-Email, then clicks **Save**.
2. Admin clicks **Send test email**.
3. Server Action [`sendTestEmailAction`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/emailSettings.ts#L64) triggers:
   - Queries the active user's email address from `users`.
   - Invokes [`EmailSettingsService.sendTest`](file:///Users/naveenadicharla/Documents/ridhzo/src/domains/organizations/emailSettingsService.ts#L91), decrypting the stored password and initializing a Nodemailer transport.
   - Sends a test email with the subject *"Ridhzo SMTP test"*.
4. **Error Transparency**: If connection or authentication fails, the exact SMTP server error (e.g., `535 5.7.8 Username and Password not accepted`, `ENOTFOUND smtp.invalid.com`) is surfaced in a destructive toast notification, allowing immediate troubleshooting.

---

## 7. Outbound Email Triggers Across Ridhzo

Once enabled, custom SMTP routes all outbound email operations:

1. **Direct One-Tap Lead Outreach**: Reps emailing leads via [`sendEmailAction`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/messaging.ts#L105) inside the lead profile dossier.
2. **Quick Response Modal**: One-click email templates dispatched from the `/leads` list view.
3. **Automated Drip Sequences**: Email steps scheduled within multi-day sequence drips ([`Sequences.tsx`](file:///Users/naveenadicharla/Documents/ridhzo/src/components/sequences/SequencesManager.tsx)).
4. **Team Member Invitations**: Branded onboarding emails dispatched by [`inviteUserAction`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/invitations.ts).
5. **System Password Resets**: Tokenized password reset emails sent via [`requestPasswordResetAction`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/passwordReset.ts).

---

## 8. Complete Code & Symbol Reference

### Frontend Components & Views
- [`EmailSettingsPage`](file:///Users/naveenadicharla/Documents/ridhzo/src/app/(dashboard)/settings/email/page.tsx): Route handler checking `settings.manage` permissions and pre-fetching email configuration.
- [`EmailSettingsManager`](file:///Users/naveenadicharla/Documents/ridhzo/src/components/settings/EmailSettingsManager.tsx): Client-side manager providing sender forms, SMTP fields, TLS toggle, and test send triggers.

### Server Actions
- [`getEmailSettingsAction`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/emailSettings.ts#L12): Retrieves the sanitized public view of the tenant's email settings.
- [`updateEmailSettingsAction`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/emailSettings.ts#L28): Validates inputs, enforces complete config when enabling, and encrypts the password.
- [`sendTestEmailAction`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/emailSettings.ts#L64): Dispatches a live diagnostic test message to the administrator's email.

### Domain Services & Delivery Infrastructure
- [`EmailSettingsService`](file:///Users/naveenadicharla/Documents/ridhzo/src/domains/organizations/emailSettingsService.ts): Domain service managing database records, password encryption/decryption, and test dispatches.
- [`sendEmail`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/mail/mailer.ts#L39): Core mailer function coordinating tenant SMTP and shared Resend fallback.
- [`encryptSecret` / `decryptSecret`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/crypto/secret.ts): AES-256-GCM encryption helpers.
- [`emailSettings`](file:///Users/naveenadicharla/Documents/ridhzo/src/db/schema/emailSettings.ts#L7): Drizzle ORM table storing SMTP configurations and encrypted passwords.
