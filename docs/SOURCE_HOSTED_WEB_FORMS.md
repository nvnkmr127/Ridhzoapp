# Lead Source Specification: Hosted Web Forms & Embeds (`webform`)

The **Hosted Web Forms & Embeddable iFrames** feature provides a complete no-code lead capture solution built directly into Ridhzo. It enables non-technical sales and marketing managers to design, customize, and publish multi-step lead capture forms in under a minute without writing code or provisioning hosting infrastructure.

---

## 1. Executive Summary & Business Functionality

- **Channel Focus**: Inbound landing page traffic, direct social bio links, client intake forms, and embedded website contact widgets.
- **Delivery Mechanism**: Available as both a standalone public webpage (`https://<domain>/f/[slug]`) and a responsive `<iframe>` embed code.
- **Ridhzo Value**: Eliminates the need for expensive third-party form builders (Typeform, JotForm, Wufoo). Offers visual drag-and-drop field builders, multi-step pagination (up to 10 steps), automated CRM schema mapping, and zero-latency lead insertion.

---

## 2. Technical Architecture & Component Flow

```
+----------------------------------------------------------------------------------------------------+
|                                      CRM ADMIN DASHBOARD                                           |
+----------------------------------------------------------------------------------------------------+
  Admin accesses: /settings/sources -> clicks "Create Web Form" or "Customize fields"
                                    |
                                    v
+----------------------------------------------------------------------------------------------------+
|                                    VISUAL FIELD BUILDER                                            |
|                                                                                                    |
|  Component: src/components/sources/FormFieldsEditor.tsx                                            |
|  Schema Engine: src/lib/leads/formFields.ts                                                        |
|                                                                                                    |
|  - Field Management: Add, delete, and reorder fields (move up/down)                                |
|  - Field Types: text, email, tel, number, textarea                                                 |
|  - Step Pagination: Group fields across 1 to 10 discrete steps                                     |
|  - Server Action: updateSourceFormAction(sourceId, fields) sanitizes and persists schema            |
|    into lead_sources.config.formFields                                                             |
+----------------------------------------------------------------------------------------------------+
                                    |
                                    v
+----------------------------------------------------------------------------------------------------+
|                                     PUBLIC DEPLOYMENT MODES                                        |
+-----------------------------------+----------------------------------------------------------------+
| Mode A: Hosted Landing Page       | Mode B: Embeddable iFrame                                      |
| URL: https://<domain>/f/<slug>    | Snippet: <iframe src="https://<domain>/f/<slug>" ...></iframe> |
| SSR Page: src/app/f/[slug]/page.ts| Embedded in WordPress, Webflow, Squarespace, or Shopify        |
+-----------------------------------+----------------------------------------------------------------+
                                    |
                                    v
+----------------------------------------------------------------------------------------------------+
|                                    SUBMISSION & DATA MAPPING                                       |
|                                                                                                    |
|  Component: src/components/PublicLeadForm.tsx                                                      |
|                                                                                                    |
|  1. Contact Validation: Requires at least an Email or Phone number to resolve deduplication         |
|  2. Core Lead Columns: Name, Email, Phone, Company, and Message map directly to `leads` table      |
|  3. Custom Field Preservation: Unmapped fields are compiled into JSON and saved to leads.customData|
|  4. Automation Trigger: Round-robin distribution and instant lead welcome sequences fired          |
+----------------------------------------------------------------------------------------------------+
```

---

## 3. Visual Field Editor ([`FormFieldsEditor.tsx`](file:///Users/naveenadicharla/Documents/ridhzo/src/components/sources/FormFieldsEditor.tsx))

Clicking **Customize fields** on any webform source expands the inline visual schema builder:

```
+----------------------------------------------------------------------------------------------------+
|                                     INLINE SCHEMA EDITOR UI                                        |
+----------------------------------------------------------------------------------------------------+
|  [::]  [ Full Name        ]  [ Type: text     v ]  [x] Required  [ Step: 1 ]  [^]  [v]  [Trash]   |
|  [::]  [ Business Email   ]  [ Type: email    v ]  [x] Required  [ Step: 1 ]  [^]  [v]  [Trash]   |
|  [::]  [ Phone Number     ]  [ Type: tel      v ]  [ ] Required  [ Step: 1 ]  [^]  [v]  [Trash]   |
|  [::]  [ Company Size     ]  [ Type: number   v ]  [ ] Required  [ Step: 2 ]  [^]  [v]  [Trash]   |
|  [::]  [ Project Scope    ]  [ Type: textarea v ]  [ ] Required  [ Step: 2 ]  [^]  [v]  [Trash]   |
+----------------------------------------------------------------------------------------------------+
|  [ + Add field ]                                                       [ Save form fields ]        |
+----------------------------------------------------------------------------------------------------+
```

### 1. Field Operations & Controls
- **Reordering**: Move fields up or down using the arrow buttons (`move(i, -1)` / `move(i, 1)`).
- **Label Editing**: Direct text input updates the question displayed to respondents.
- **Field Type Selection**:
  - `text`: Single-line text for names, job titles, or addresses.
  - `email`: Enforces standard email syntax validation.
  - `tel`: Formats and validates phone numbers.
  - `number`: Numeric constraints for team sizes, budgets, or quantities.
  - `textarea`: Multi-line expandable box for messages or project requirements.
- **Required Checkbox**: Toggles client-side and server-side mandatory validation.
- **Step Assignment**: Assigns the field to a specific pagination page (`1` to `MAX_STEPS = 10`).

### 2. Schema Sanitization ([`sanitizeFields`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/leads/formFields.ts))
Before saving, Ridhzo cleans the schema:
- Removes dangerous characters and strips non-printable control codes.
- Generates snake_case machine keys for custom fields (e.g., `"Budget Estimate"` → `"budget_estimate"`).
- Locks standard keys (`name`, `email`, `phone`, `company`) so their core database bindings cannot be corrupted.

---

## 4. Multi-Step Form Pagination (`groupIntoSteps`)

Long single-page forms suffer from high abandonment rates. Ridhzo provides native multi-step pagination:

1. **Automatic Grouping**: The helper function `groupIntoSteps(fields)` organizes fields into sequential step buckets based on their `step` integer.
2. **Interactive Stepper UI**:
   - The public form displays progress indicators: `Step 1 of 3: Contact Info`, `Step 2 of 3: Requirements`.
   - Respondents navigate forward with `Next` and backward with `Back`.
   - Form state is retained in client memory between steps.
3. **Step-Level Validation**: Users cannot advance to the next step until all required fields in the current step pass validation checks.

---

## 5. Deployment Options: Hosted Link vs. iFrame Embed

### Option A: Standalone Public Landing Page
- **URL Format**: `https://<your-domain>/f/<SOURCE_UUID>`
- **Server Component**: [`src/app/f/[slug]/page.tsx`](file:///Users/naveenadicharla/Documents/ridhzo/src/app/f/[slug]/page.tsx)
- **Features**:
  - Server-side renders the form card centered on a responsive background.
  - Displays the source's name as the page title (e.g., *"Schedule an Enterprise Demo"*).
  - Fast page loads with zero external analytics tracker bloat.
  - Perfect for sharing in email signatures, WhatsApp messages, LinkedIn bios, or QR codes.

### Option B: Embeddable iFrame
- One-click copyable embed code:
  ```html
  <iframe 
    src="https://<your-domain>/f/<SOURCE_UUID>" 
    style="border:0;width:100%;max-width:480px;height:520px" 
    title="Lead form">
  </iframe>
  ```
- **Universal Compatibility**: Can be pasted into WordPress Gutenberg / Elementor HTML widgets, Webflow embed elements, Squarespace code blocks, Shopify page templates, or raw HTML files.
- Operates in a sandboxed iframe to prevent CSS collisions with host websites.

---

## 6. Data Mapping & Deduplication Engine

When a user submits a hosted form:

1. **Contact Identification**: The form evaluates whether an `email` or `phone` is provided. If neither is filled, the form halts submission with: *"Please enter at least an email or a phone number."*
2. **Core Field Mapping**:
   - `name` → `leads.name`
   - `email` → `leads.email`
   - `phone` → `leads.phone`
   - `company` → `leads.company`
3. **Custom Data Aggregation**:
   All non-standard responses are bundled into a JSON object:
   ```json
   {
     "team_size": "25-50",
     "target_start_date": "2026-10-01",
     "current_solution": "Salesforce",
     "form_submission_timestamp": "2026-09-19T10:45:00Z"
   }
   ```
   Stored in `leads.customData` and rendered inside the **Lead Dossier** custom fields tab.
4. **Pipeline Routing**: Triggers organization-level assignment rules and enqueues automated drip sequences.

---

## 7. Code & Symbol Reference

- [`FormFieldsEditor.tsx`](file:///Users/naveenadicharla/Documents/ridhzo/src/components/sources/FormFieldsEditor.tsx): Interactive client component for field reordering, type assignment, and step configuration.
- [`formFields.ts`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/leads/formFields.ts): Schema definitions (`FormField`, `FormFieldType`), default schemas, and `groupIntoSteps`.
- [`/app/f/[slug]/page.tsx`](file:///Users/naveenadicharla/Documents/ridhzo/src/app/f/%5Bslug%5D/page.tsx): SSR route serving public forms by source ID.
- [`PublicLeadForm.tsx`](file:///Users/naveenadicharla/Documents/ridhzo/src/components/PublicLeadForm.tsx): Client-side form engine handling multi-step navigation and validation.
- [`updateSourceFormAction`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/sources.ts#L65): Server action persisting sanitized field configurations.
- [`createSourceAction`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/sources.ts#L52): Generates new `webform` source records.
