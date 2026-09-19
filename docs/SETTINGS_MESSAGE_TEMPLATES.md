# Settings: Message Templates Hub (`/settings/templates`)

The **Message Templates Hub** is Ridhzo's centralized repository for authoring, managing, and standardizing reusable sales outreach across WhatsApp, Email, and SMS. Located at [`src/app/(dashboard)/settings/templates/page.tsx`](file:///Users/naveenadicharla/Documents/ridhzo/src/app/(dashboard)/settings/templates/page.tsx) and driven by [`TemplatesManager.tsx`](file:///Users/naveenadicharla/Documents/ridhzo/src/components/templates/TemplatesManager.tsx), this feature equips sales teams with one-tap canned responses, dynamic token interpolation, and consistent multi-channel communication.

---

## 1. Executive Summary & Business Value

In high-velocity inbound sales, response time and message quality dictate deal conversion:

1. **Sub-60-Second First Contact**: Reps select pre-approved templates with a single tap rather than manually typing repetitive greetings, meeting links, or pricing brochures.
2. **Dynamic Lead Personalization**: Built-in interpolation tokens (`{{first_name}}`, `{{name}}`, `{{email}}`, `{{phone}}`, `{{company}}`) automatically tailor each message to the recipient, avoiding robotic boilerplate.
3. **Multi-Channel Consistency**: Unifies outreach standards across **WhatsApp**, **Email**, and **SMS**, ensuring brand compliance across all sales representatives.
4. **Native Omnichannel Integration**: Templates flow seamlessly into the **Lead Profile Dossier** ([`WhatsAppSendBox.tsx`](file:///Users/naveenadicharla/Documents/ridhzo/src/components/leads/WhatsAppSendBox.tsx)), **Quick Response Modals** ([`QuickResponseDialog.tsx`](file:///Users/naveenadicharla/Documents/ridhzo/src/components/leads/QuickResponseDialog.tsx)), and **Automated Drip Sequences** ([`Sequences.tsx`](file:///Users/naveenadicharla/Documents/ridhzo/src/components/sequences/SequencesManager.tsx)).

---

## 2. Technical Architecture & Data Flow

```
+----------------------------------------------------------------------------------------------------+
|                                      TEMPLATE MANAGEMENT HUB                                       |
|                                                                                                    |
|  Server Route: src/app/(dashboard)/settings/templates/page.tsx                                     |
|  Permissions: requirePermission("templates.manage")                                                |
|  Data Pre-fetch: listTemplates() -> SELECT FROM message_templates WHERE organization_id = :orgId   |
+----------------------------------------------------------------------------------------------------+
                                                |
                                                v
+----------------------------------------------------------------------------------------------------+
|                                      TEMPLATES MANAGER CANVAS                                      |
|                                                                                                    |
|  Component: src/components/templates/TemplatesManager.tsx                                         |
|  - Create / Edit Form: Name, Channel (WhatsApp/Email/SMS), Subject (Email), Body                  |
|  - Token Insertion Guide: {{name}}, {{first_name}}, {{email}}, {{phone}}, {{company}}             |
|  - Real-time Local State: Optimistic updates on create/edit/delete with rollback on failure         |
+----------------------------------------------------------------------------------------------------+
                                                |
                        +-----------------------+-----------------------+
                        |                                               |
                        v                                               v
+-----------------------------------------------+   +-----------------------------------------------+
|             ONE-TAP MANUAL DISPATCH           |   |           AUTOMATED DRIP & WORKFLOWS          |
|                                               |   |                                               |
|  1. WhatsApp Send Box (WhatsAppSendBox.tsx)   |   |  1. Sequences Engine (SequenceStep.tsx)       |
|     - Personal: wa.me deep-link with prefill  |   |     - Automated scheduled drip steps          |
|     - BSP: Direct in-app Meta Cloud API send  |   |  2. Workflow Automations (automationsWorker)  |
|  2. Quick Response Dialog (QuickResponse.tsx) |   |     - Triggered on new lead or status change  |
|     - Instant WhatsApp or Email modal popup   |   |     - Executes send_whatsapp / send_email     |
+-----------------------------------------------+   +-----------------------------------------------+
                        |                                               |
                        +-----------------------+-----------------------+
                                                |
                                                v
+----------------------------------------------------------------------------------------------------+
|                                    LEAD TIMELINE & AUDIT LOGGING                                   |
|                                                                                                    |
|  ActivityService.addActivity({ type: "message" | "email", content: "[channel] <body preview>" })   |
|  Recorded on lead detail timeline with timestamp and sender ID                                     |
+----------------------------------------------------------------------------------------------------+
```

---

## 3. UI Layout & Visual Hierarchy

The Message Templates page provides a clean, distraction-free authoring and management environment:

### A. Navigation & Header
- **Breadcrumb Back Link**: Ghost button linking back to `/settings`.
- **Title**: `Message Templates`
- **Subtitle**: *"Canned messages for one-tap sending and automations. Tokens are filled per lead."*

### B. Template Authoring Card (`TemplatesManager.tsx`)
Positioned at the top of the canvas, the authoring card switches between **New Template** and **Edit Template** modes:

```
+----------------------------------------------------------------------------------------------------+
|                                           NEW TEMPLATE                                             |
+----------------------------------------------------------------------------------------------------+
|  [ Template Name: Intro & Schedule Call            ]  [ Channel: WhatsApp                        v ]|
|  [ Email Subject: Discussion regarding your property inquiry                                      ] |
|                                                                                                    |
|  Message Body:                                                                                     |
|  +----------------------------------------------------------------------------------------------+  |
|  | Hi {{first_name}}, thanks for reaching out to {{company}}!                                   |  |
|  |                                                                                              |  |
|  | I saw your inquiry regarding our services. Are you free for a quick 5-minute call today at    |  |
|  | 3:00 PM or tomorrow morning?                                                                 |  |
|  |                                                                                              |  |
|  | Best regards,                                                                                |  |
|  | Sales Advisory Team                                                                          |  |
|  +----------------------------------------------------------------------------------------------+  |
|                                                                                                    |
|  Use tokens: {{first_name}}, {{name}}, {{email}}, {{phone}}, {{company}}      [ + Save template ]  |
+----------------------------------------------------------------------------------------------------+
```

- **Template Name Input**: Clear alphanumeric title (e.g., *"Price Quote Follow-up"*).
- **Channel Selector**: Native dropdown selecting `WhatsApp`, `Email`, or `SMS`.
- **Conditional Email Subject**: When `channel === "email"`, an additional input appears for the email subject line.
- **Message Body Textarea**: Expandable input supporting multi-line text and token placeholders.
- **Action Buttons**:
  - `Save template` / `Update template` (with loading spinner).
  - `Cancel edit` button when modifying an existing template.

### C. Active Templates List
Templates are displayed as distinct cards:
- **Card Header**: Displays template name, channel badge (`whatsapp`, `sms`, `email`), and quick action buttons.
- **Actions**:
  - **Edit (Pencil Icon)**: Populates the authoring form with the template's data and scrolls to the top.
  - **Delete (Trash Icon)**: Removes the template with immediate optimistic UI removal and database synchronization.
- **Body Preview**: Renders formatted text with preserved line breaks (`whitespace-pre-wrap`).
- **Subject Display**: Displays `Subject: <text>` for email templates.

---

## 4. Supported Channels & Dispatch Mechanisms

```
+----------------------------------------------------------------------------------------------------+
|                                     CHANNEL COMPARISON MATRIX                                      |
+-----------+----------------------+-----------------------------+-----------------------------------+
| Channel   | Key Identifier       | Dispatch Methods            | Protocol / Provider               |
+-----------+----------------------+-----------------------------+-----------------------------------+
| WhatsApp  | whatsapp             | 1. Personal (wa.me)         | WhatsApp Web / Mobile Protocol    |
|           |                      | 2. Business API (In-app)    | Meta Cloud API / Watxio BSP       |
| Email     | email                | In-App SMTP Mailer          | Nodemailer / SendGrid / SMTP      |
| SMS       | sms                  | In-App Gateway & Twilio     | Direct Cellular Carrier Network   |
+-----------+----------------------+-----------------------------+-----------------------------------+
```

### Channel 1: WhatsApp (`whatsapp`)
WhatsApp is Ridhzo's primary real-time engagement channel:
1. **Personal Mode (`mode = "personal"`)**:
   - Generates a pre-filled direct WhatsApp link:
     ```
     https://wa.me/<digits>?text=<encoded_body>
     ```
   - Opens the rep's personal or desktop WhatsApp client. Reps review and tap send from their own phone number.
   - Bypasses Meta's 24-hour service conversation window and template approval requirements.
2. **Business API Mode (`mode = "bsp"`)**:
   - Sends directly through the CRM via [`sendWhatsAppAction`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/messaging.ts#L78).
   - Inside Meta's 24-hour customer care window: Dispatches free-form text.
   - Outside the 24-hour window: Prompts the rep to select a pre-approved Meta Business template.

### Channel 2: Email (`email`)
- Requires both a **Subject Line** and **Message Body**.
- Dispatches via [`sendEmailAction`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/messaging.ts#L105) using the organization's configured SMTP server ([`src/lib/mail/mailer.ts`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/mail/mailer.ts)).
- Converts line breaks to clean HTML paragraphs (`<p>${body.replace(/\n/g, "<br/>")}</p>`).
- Automatically logs the sent email as a timeline event in `activities`.

### Channel 3: SMS (`sms`)
- Standard text messaging for quick alerts, verification codes, or prospects without active WhatsApp accounts.
- Concise plain text without subject lines.

---

## 5. Dynamic Token Interpolation Engine

Ridhzo supports dynamic token placeholders, allowing one template to adapt across thousands of distinct contacts:

```
+------------------+------------------------------+-------------------------+------------------------+
| Token Syntax     | Source Column                | Extraction Logic        | Sample Output          |
+------------------+------------------------------+-------------------------+------------------------+
| {{first_name}}   | leads.name                   | name.split(' ')[0]      | "Alex"                 |
| {{name}}         | leads.name                   | leads.name || "Client"  | "Alex Johnson"         |
| {{email}}        | leads.email                  | leads.email             | "alex@example.com"     |
| {{phone}}        | leads.phone                  | leads.phone             | "+1 (415) 555-0199"    |
| {{company}}      | leads.company                | leads.company || Org    | "Acme Corporation"     |
+------------------+------------------------------+-------------------------+------------------------+
```

### Interpolation Implementation ([`QuickResponseDialog.tsx`](file:///Users/naveenadicharla/Documents/ridhzo/src/components/leads/QuickResponseDialog.tsx#L47))
When a rep selects a template from a dropdown, Ridhzo immediately parses and replaces tokens in the active textarea:
```typescript
let text = tmpl.body || "";
text = text.replace(/\{\{first_name\}\}/gi, leadName ? leadName.split(" ")[0] : "there");
text = text.replace(/\{\{name\}\}/gi, leadName || "Client");
text = text.replace(/\{\{email\}\}/gi, email || "");
text = text.replace(/\{\{phone\}\}/gi, phone || "");
text = text.replace(/\{\{company\}\}/gi, company || "your company");
setBody(text);
```
Reps can review and edit the personalized text before sending.

---

## 6. Omnichannel Integration Across Ridhzo

Templates are consumed across four primary workflow areas:

### 1. Lead Profile Dossier ([`WhatsAppSendBox.tsx`](file:///Users/naveenadicharla/Documents/ridhzo/src/components/leads/WhatsAppSendBox.tsx))
Inside the lead dossier's WhatsApp tab:
- Reps click **Insert a template...** dropdown.
- Selecting a template populates the message box instantly.
- Reps can click **Draft with AI** to adjust tone or tap **Send** for immediate delivery.

### 2. Quick Response Modal ([`QuickResponseDialog.tsx`](file:///Users/naveenadicharla/Documents/ridhzo/src/components/leads/QuickResponseDialog.tsx))
Accessible directly from lead table rows or Kanban cards:
- Opens a lightweight modal with channel toggle (WhatsApp / Email).
- Selecting a template automatically switches the channel to match the template's designated type.
- Delivers the message and updates lead activity in a single interaction.

### 3. Automated Sequences Engine ([`SequenceFlow.tsx`](file:///Users/naveenadicharla/Documents/ridhzo/src/components/sequences/SequenceFlow.tsx))
- Sequence creators choose message templates when constructing multi-day drip steps (e.g., Step 1: Immediate WhatsApp intro $\rightarrow$ Step 2: Day 3 Email check-in $\rightarrow$ Step 3: Day 7 SMS reminder).

### 4. Workflow Automations Worker ([`automationsWorker.ts`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/jobs/workers/automationsWorker.ts))
- Automated actions (e.g., WHEN lead status changes to "Won", THEN send customer onboarding template) execute server-side using pre-configured message templates.

---

## 7. Security, RBAC & Database Schema

### Role-Based Access Control (RBAC)
- **Authoring & Modification**: Restricted to administrators and managers via `requirePermission("templates.manage")`.
- **Consumption & Dispatch**: All authenticated sales representatives can view and send templates via `requireOrg()`.

### Database Schema ([`messageTemplates`](file:///Users/naveenadicharla/Documents/ridhzo/src/db/schema/templates.ts#L5))
```typescript
export const messageTemplates = pgTable('message_templates', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').references(() => organizations.id),
  name: varchar('name', { length: 255 }).notNull(),
  channel: varchar('channel', { length: 20 }).notNull().default('whatsapp'), // whatsapp, sms, email
  subject: varchar('subject', { length: 255 }), // email only
  body: text('body').notNull(), // supports {{name}} {{first_name}} {{email}} {{phone}} {{company}}
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
```

- **Tenant Isolation**: Every query includes `where(eq(messageTemplates.organizationId, organizationId))`.
- **Referential Integrity**: Linked to `organizations.id` to ensure proper cascading when an organization is managed.

---

## 8. Complete Code & Symbol Reference

### Frontend Components & Views
- [`TemplatesPage`](file:///Users/naveenadicharla/Documents/ridhzo/src/app/(dashboard)/settings/templates/page.tsx): Server route pre-fetching organization templates.
- [`TemplatesManager`](file:///Users/naveenadicharla/Documents/ridhzo/src/components/templates/TemplatesManager.tsx): Client-side manager handling CRUD operations, form editing, and channel filtering.
- [`WhatsAppSendBox`](file:///Users/naveenadicharla/Documents/ridhzo/src/components/leads/WhatsAppSendBox.tsx): Lead profile messaging box with one-tap template selector.
- [`QuickResponseDialog`](file:///Users/naveenadicharla/Documents/ridhzo/src/components/leads/QuickResponseDialog.tsx): Modal dialog for instant outreach across WhatsApp and Email.

### Server Actions
- [`listTemplates`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/messaging.ts#L12): Retrieves templates for the tenant organization, with optional channel filtering.
- [`createTemplateAction`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/messaging.ts#L29): Validates and inserts a new template with Zod schema verification.
- [`updateTemplateAction`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/messaging.ts#L44): Modifies an existing template with tenant ownership checks.
- [`deleteTemplateAction`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/messaging.ts#L63): Permanently deletes a template from the database.
- [`sendWhatsAppAction`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/messaging.ts#L78): Dispatches WhatsApp messages via Watxio or Meta Cloud API.
- [`sendEmailAction`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/messaging.ts#L105): Sends outbound emails through the shared SMTP mailer and logs activity.
- [`logMessageAction`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/messaging.ts#L134): Records message dispatch events onto the lead's activity timeline.

### Database Tables
- [`messageTemplates`](file:///Users/naveenadicharla/Documents/ridhzo/src/db/schema/templates.ts#L5): Drizzle ORM table storing template schemas, channels, subjects, and bodies.
- [`activities`](file:///Users/naveenadicharla/Documents/ridhzo/src/db/schema/leads.ts): Activity timeline recording dispatched messages.
