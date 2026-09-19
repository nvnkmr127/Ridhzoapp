# User Profile & Account Preferences (`/profile`)

## 1. Executive Summary & Purpose

The **User Profile** page (`/profile`) manages personal identity, authentication credentials, and granular notification preferences for the logged-in user. While the organization-wide settings govern system policies and team schemas, the Profile page provides self-service controls for individual reps, managers, and administrators.

Key features include:
- **Authentication & Identity Verification:** Displays verified user details (Name, Email, Phone) derived directly from the authenticated session.
- **Granular Email Notification Preferences:** Controls which in-app notification events trigger outbound email alerts to the user's personal inbox, backed by an opt-out storage model.
- **Secure Sign-Out:** Session invalidation and cache teardown via NextAuth.

---

## 2. File & Component Architecture

| Purpose | File Path |
| :--- | :--- |
| **Page Route** | [`src/app/(dashboard)/profile/page.tsx`](file:///Users/naveenadicharla/Documents/ridhzo/src/app/(dashboard)/profile/page.tsx) |
| **Notification Preferences Component** | [`src/components/settings/NotificationPreferences.tsx`](file:///Users/naveenadicharla/Documents/ridhzo/src/components/settings/NotificationPreferences.tsx) |
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

## 4. Granular Email Notification Preferences

Ridhzo maintains a distinction between **In-App Bell Alerts** and **Inbox Emails**:
- **In-App Notification Bell (`NotificationBell.tsx`):** Receives 100% of lead assignments, reminders, and alerts in real-time.
- **Email Notifications (`NotificationPreferences.tsx`):** Users can customize which events also generate email messages delivered via the tenant's configured SMTP or Resend mailer.

### 4.1 Supported Notification Events (`EMAIL_NOTIFICATION_TYPES`)

| Notification Type | Label in UI | Description |
| :--- | :--- | :--- |
| `new_lead` | **New lead assigned or received** | Dispatched when an inbound lead is captured and assigned to the user. |
| `lead_assigned` | **A lead is assigned to you** | Dispatched when a manager or teammate reassigns an existing lead. |
| `follow_up_due` | **Follow-up due** | Dispatched when a scheduled reminder timestamp is reached. |
| `follow_up_overdue` | **Follow-up overdue** | Dispatched when a reminder passes its due date without completion. |
| `sla_escalation` | **SLA escalation (unactioned lead)** | Dispatched when a new lead remains uncontacted past the 15-minute SLA. |

### 4.2 Opt-Out Architecture & Data Persistence
To avoid missing critical leads by default, Ridhzo employs an **opt-out model**:
- All notification types default to active (`emailOn = true`).
- Checking an option keeps it active; unchecking adds the event key to the user's `email_opt_out` array in the database.
- Toggling any preference immediately triggers [`setEmailOptOutAction(next)`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/notificationPrefs.ts) with optimistic UI updates and error rollback.

---

## 5. Session Termination & Sign-Out

The sign-out button triggers a direct POST to `/api/auth/signout` or client-side `signOut({ callbackUrl: "/login" })`:
- Destroys active session cookies and JWT tokens.
- Clears local browser caches and IndexedDB outboxes.
- Redirects user back to the login screen.
