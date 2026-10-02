# User Profile & Account Preferences (`/profile`)

## 1. Executive Summary & Purpose

The **User Profile** page (`/profile`) manages personal identity, authentication credentials, and granular notification preferences for the logged-in user. While the organization-wide settings govern system policies and team schemas, the Profile page provides self-service controls for individual reps, managers, and administrators.

Key features include:
- **Authentication & Identity Verification:** Displays verified user details (Name, Email, Phone) derived directly from the authenticated session.
- **Login Methods & Linked Accounts:** Manage linked Google single-sign-on and primary email/phone login credentials.
- **Password Setup & Management:** Set an account password for phone/Google signups (`passwordSet = false`) or change an existing password.
- **Granular Email & Push Preferences:** Controls which in-app notification events trigger outbound email alerts (backed by `users.email_opt_out`), plus mobile push channel preferences.
- **Interface Language Selection:** Choose display language across English, Hindi (हिन्दी), and Telugu (తెలుగు) stored in `users.language`.
- **Alert Chime Customization:** Choose and preview the audio chime played on new lead assignments and reminders.
- **Secure Sign-Out:** Session invalidation and cache teardown via NextAuth.

---

## 2. File & Component Architecture

| Purpose | File Path |
| :--- | :--- |
| **Page Route** | [`src/app/(dashboard)/profile/page.tsx`](file:///Users/naveenadicharla/Documents/ridhzo/src/app/(dashboard)/profile/page.tsx) |
| **Login Methods & Social Link** | [`src/components/settings/LoginMethods.tsx`](file:///Users/naveenadicharla/Documents/ridhzo/src/components/settings/LoginMethods.tsx) |
| **Password Setup / Change** | [`src/components/settings/PasswordForm.tsx`](file:///Users/naveenadicharla/Documents/ridhzo/src/components/settings/PasswordForm.tsx) |
| **Notification Preferences Component** | [`src/components/settings/NotificationPreferences.tsx`](file:///Users/naveenadicharla/Documents/ridhzo/src/components/settings/NotificationPreferences.tsx) |
| **Language Selection Component** | [`src/components/settings/LanguagePicker.tsx`](file:///Users/naveenadicharla/Documents/ridhzo/src/components/settings/LanguagePicker.tsx) |
| **Audio Alert Sound Picker** | [`src/components/settings/AlertSoundPicker.tsx`](file:///Users/naveenadicharla/Documents/ridhzo/src/components/settings/AlertSoundPicker.tsx) |
| **Notification Actions** | [`src/lib/actions/notificationPrefs.ts`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/notificationPrefs.ts) |
| **Email Notification Categories** | [`src/lib/notifications/emailTypes.ts`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/notifications/emailTypes.ts) |
| **Header User Menu Integration** | [`src/components/layout/Header.tsx:71-91`](file:///Users/naveenadicharla/Documents/ridhzo/src/components/layout/Header.tsx#L71-L91) |

---

## 3. Profile Identity & Protected Access

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

## 4. Authentication & Credentials Management

### 4.1 Linked Login Methods (`LoginMethods.tsx`)
- Displays current primary email and phone login methods.
- Allows connecting or disconnecting Google OAuth for single-sign-on.
- Handles cross-tenant collision detection (alerting if a Google account is already registered in another workspace).

### 4.2 Password Setup & Modification (`PasswordForm.tsx`)
- Users who signed up via phone OTP or Google OAuth initially have `passwordSet: false`.
- The form allows first-time password creation without requiring an existing password.
- Existing password users can change their password after verifying their current password.

---

## 5. Granular Email Notification Preferences

Ridhzo maintains a distinction between **In-App Bell Alerts** and **Inbox Emails**:
- **In-App Notification Bell (`NotificationBell.tsx`):** Receives 100% of lead assignments, reminders, and alerts in real-time.
- **Email Notifications (`NotificationPreferences.tsx`):** Users can customize which events also generate email messages delivered via the tenant's configured SMTP or Resend mailer.

### 5.1 Supported Notification Events (`EMAIL_NOTIFICATION_TYPES`)

| Notification Type | Label in UI | Description |
| :--- | :--- | :--- |
| `new_lead` | **New lead assigned or received** | Dispatched when an inbound lead is captured and assigned to the user. |
| `lead_assigned` | **A lead is assigned to you** | Dispatched when a manager or teammate reassigns an existing lead. |
| `follow_up_due` | **Follow-up due** | Dispatched when a scheduled reminder timestamp is reached. |
| `follow_up_overdue` | **Follow-up overdue** | Dispatched when a reminder passes its due date without completion. |
| `sla_escalation` | **SLA escalation (unactioned lead)** | Dispatched when a new lead remains uncontacted past the 15-minute SLA. |

### 5.2 Opt-Out Architecture & Data Persistence
To avoid missing critical leads by default, Ridhzo employs an **opt-out model**:
- All notification types default to active (`emailOn = true`).
- Checking an option keeps it active; unchecking adds the event key to the user's `email_opt_out` array in the database.
- Toggling any preference immediately triggers [`setEmailOptOutAction(next)`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/notificationPrefs.ts) with optimistic UI updates and error rollback.

---

## 6. Personalization: Languages & Audio Alerts

- **Language Preference (`LanguagePicker.tsx`):** Switch between English (`en`), Hindi (`hi`), and Telugu (`te`), updating `users.language`.
- **Alert Sounds (`AlertSoundPicker.tsx`):** Select and preview in-browser audible chime alerts for incoming leads.

---

## 7. Session Termination & Sign-Out

The sign-out button triggers a direct POST to `/api/auth/signout` or client-side `signOut({ callbackUrl: "/login" })`:
- Destroys active session cookies and JWT tokens.
- Clears local browser caches and IndexedDB outboxes.
- Redirects user back to the login screen.
