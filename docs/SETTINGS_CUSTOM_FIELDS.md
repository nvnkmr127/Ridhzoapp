# Settings: Custom Fields Hub (`/settings/custom-fields`)

The **Custom Fields Hub** is Ridhzo's dynamic schema configuration engine. Located at [`src/app/(dashboard)/settings/custom-fields/page.tsx`](file:///Users/naveenadicharla/Documents/ridhzo/src/app/(dashboard)/settings/custom-fields/page.tsx) and managed by [`CustomFieldsManager.tsx`](file:///Users/naveenadicharla/Documents/ridhzo/src/components/settings/CustomFieldsManager.tsx), this feature allows businesses to extend the CRM's core lead data model with industry-specific attributes, two-level tab groupings, strict data validation, and role-based field visibility.

---

## 1. Executive Summary & Business Value

Every sales organization operates with proprietary qualification criteria that standard CRM schemas (name, email, phone) cannot capture:

1. **Industry-Tailored Qualification**: Real estate agencies track *Property Type* and *Budget*; driving schools track *License Category* and *Permit Number*; enterprise SaaS tracks *Tech Stack* and *Contract Value*.
2. **Tabbed Information Architecture**: Prevents sprawling, messy lead detail pages by grouping custom fields into custom **Tabs** (`section`) and **Sub-tabs** (`subsection`).
3. **Table Column Customization**: Any custom field flagged with `showOnTable = true` automatically appears as a sortable column in the primary `/leads` table view.
4. **Confidential Governance (Admin Only)**: Sensitive business data (e.g., *Commission Split*, *Credit Score*, *Internal Margin*) can be marked `adminOnly = true`, hiding it completely from standard sales reps.
5. **Strict Data Normalization**: Numbers, currencies, dates, URLs, and multi-select options are automatically validated and sanitized, ensuring clean, aggregatable reporting.

---

## 2. Technical Architecture & Data Model

```
+----------------------------------------------------------------------------------------------------+
|                                      CUSTOM FIELDS ROUTE & RBAC                                    |
|                                                                                                    |
|  Server Route: src/app/(dashboard)/settings/custom-fields/page.tsx                                 |
|  Authorization Guard: if (!hasPermission("settings.manage")) redirect("/leads")                   |
|  Data Pre-fetch: CustomFieldService.list(organizationId)                                           |
+----------------------------------------------------------------------------------------------------+
                                                |
                                                v
+----------------------------------------------------------------------------------------------------+
|                                    CUSTOM FIELDS MANAGER CANVAS                                    |
|                                                                                                    |
|  Component: src/components/settings/CustomFieldsManager.tsx                                        |
|  - Field Creation Form: Label, Type, Options, Default Value, Tab (section), Sub-tab (subsection)   |
|  - Flags: Required, Show on table, Admin only, Disabled                                            |
|  - In-place Inline Editor: Real-time edits without modal interruption                              |
|  - Positional Reordering: Arrow up / down controls via reorderCustomFieldsAction                   |
+----------------------------------------------------------------------------------------------------+
                                                |
                        +-----------------------+-----------------------+
                        |                                               |
                        v                                               v
+-----------------------------------------------+   +-----------------------------------------------+
|             SCHEMA DEFINITIONS                |   |              VALUE PERSISTENCE                |
|                                               |   |                                               |
|  Table: custom_field_defs                     |   |  Table: leads.custom_data (JSONB)             |
|  - id: UUID (Primary Key)                     |   |                                               |
|  - organizationId: Tenant Scope               |   |  {                                            |
|  - key: Unique machine slug (e.g. "budget")   |   |    "property_budget": 750000,                 |
|  - type: 10 supported types                   |   |    "deal_type": "Commercial Lease",           |
|  - section / subsection: Two-level tabs       |   |    "amenities": ["Parking", "Balcony"]        |
|  - orderIndex: Integer for layout sorting     |   |  }                                            |
+-----------------------------------------------+   +-----------------------------------------------+
```

---

## 3. UI Layout & Visual Hierarchy

The Custom Fields Hub is rendered within a centered, high-focus container (`max-w-4xl`):

### A. Navigation & Header
- **Breadcrumb Link**: Ghost button with back arrow linking back to `/settings`.
- **Title**: `Custom Fields`
- **Subtitle**: *"Extra fields captured on every lead, specific to your business."*

### B. Field Creation Card
Positioned at the top of the canvas, the authoring card provides immediate field creation:

```
+----------------------------------------------------------------------------------------------------+
|                                         ADD A CUSTOM FIELD                                         |
+----------------------------------------------------------------------------------------------------+
|  [ Field label: Property Budget        ]  [ Type: Currency (currency)                            v ]|
|  [ Default value: 500000                                                                         ] |
|  [ Tab / section: Deal Details         ]  [ Sub-tab: Financials                                  ] |
|                                                                                                    |
|  Tab & sub-tab group this field on the lead detail page. Leave blank to keep it under "Custom Attributes".|
|                                                                                                    |
|  [x] Required     [x] Show on table     [ ] Admin only     [ ] Disabled                            |
|                                                                                                    |
|                                                                               [ + Add field ]      |
+----------------------------------------------------------------------------------------------------+
```

- **Dynamic Options Row**: If `select` or `multiselect` is chosen, an options input dynamically expands (`"Options, comma-separated"`).
- **Tab Auto-Suggestions**: The `section` and `subsection` inputs hook into HTML `<datalist>` elements (`cf-sections` and `cf-subsections`), offering auto-complete suggestions based on previously created tabs.

### C. Configured Fields Roster
Fields are rendered in a vertical card list ordered by `orderIndex`:
- **Label & Machine Key**: Displays the human-readable label alongside the machine slug in a monospace font (e.g., `budget_estimate`).
- **Metadata Badges**:
  - `Type`: Displays the data type badge (`text`, `number`, `currency`, `select`, etc.).
  - `Group`: Displays tab path (e.g., `Deal Details › Financials`).
  - `Status Flags`: Highlights `Required`, `On table`, `Admin only`, and `Disabled`.
- **Action Controls**:
  - `Move Up` / `Move Down` arrow buttons to reorder fields.
  - `Pencil Icon`: Expands in-place inline editing controls.
  - `Trash Icon`: Prompts for confirmation and executes field removal.

---

## 4. The 10 Supported Data Types & Validation Logic

Ridhzo supports 10 distinct data types. Input validation is enforced by [`CustomFieldService.validate`](file:///Users/naveenadicharla/Documents/ridhzo/src/domains/customFields/service.ts#L133):

```
+---------------+------------------------+-----------------------------------------------------------+
| Field Type    | UI Form Element        | Validation & Normalization Rules                          |
+---------------+------------------------+-----------------------------------------------------------+
| text          | Single-line <Input>    | String trimmed to 2,000 characters.                       |
| textarea      | Multi-line <Textarea>  | Preserves line breaks and markdown formatting.            |
| number        | Numeric <Input>        | Strips commas; validates as a valid JavaScript Number.    |
| currency      | Numeric <Input>        | Strips currency symbols ($ € £ ₹) & commas; stores number.|
| date          | <input type="date">    | Validates strict ISO format: YYYY-MM-DD.                  |
| datetime      | datetime-local <input> | Validates ISO timestamp: YYYY-MM-DDTHH:mm(:ss)?.          |
| select        | Single <Select>        | Asserts submitted value exists in options whitelist.     |
| multiselect   | Multi-tag Picker       | Array of strings; asserts all values exist in whitelist.  |
| checkbox      | Toggle <input type=cb> | Coerces to true or false.                                 |
| url           | Web address <Input>    | Prepends https:// if missing; validates valid HTTP URL.   |
+---------------+------------------------+-----------------------------------------------------------+
```

### Currency Normalization Example
When a user inputs `$1,250,000.50` into a `currency` custom field:
```typescript
const trimmed = typeof raw === "string" ? raw.trim().replace(/[$€£₹,\s]/g, "") : raw;
const num = Number(trimmed);
if (trimmed === "" || isNaN(num)) throw new FieldValidationError(`${def.label} must be a number`);
clean[def.key] = num; // Stored as integer/float: 1250000.5
```
By normalizing currency to raw numbers, Ridhzo enables sorting, mathematical aggregations, and pipeline value calculations.

---

## 5. Two-Level Tab Grouping Architecture

To keep complex lead dossiers readable, Ridhzo supports two-level grouping:

```
[Lead Dossier Header]
|
+--- [Tab: Overview]
+--- [Tab: Deal Details] (Defined by customFieldDefs.section = "Deal Details")
|    |
|    +--- [Sub-tab: Property Specs] (subsection = "Property Specs")
|    |    - Square Footage (number)
|    |    - Year Built (number)
|    |    - Architectural Style (select)
|    |
|    +--- [Sub-tab: Financials] (subsection = "Financials")
|         - Asking Price (currency)
|         - HOA Fee Monthly (currency)
|         - Pre-approved (checkbox)
|
+--- [Tab: Custom Attributes] (Default container for ungrouped fields)
```

- **Section (`section`)**: Top-level horizontal tab rendered in [`LeadDetailTabs.tsx`](file:///Users/naveenadicharla/Documents/ridhzo/src/components/leads/LeadDetailTabs.tsx).
- **Subsection (`subsection`)**: Secondary sub-navigation tab within that section.
- **Default Fallback**: Fields with null or empty section values automatically render in the baseline **Custom Attributes** widget.

---

## 6. Field Modifiers & Governance Rules

```
+----------------------------------------------------------------------------------------------------+
|                                    FIELD MODIFIERS MATRIX                                          |
+-----------------+----------------------------------------------------------------------------------+
| Modifier        | Operational Consequence Across Ridhzo                                            |
+-----------------+----------------------------------------------------------------------------------+
| Required        | Blocks lead creation and updates unless populated. Enforced on webforms & APIs.  |
| Show on Table   | Injects the field as an active data column in the main /leads triage list.       |
| Admin Only      | Hidden from non-admin reps; omitted from listCustomFieldsAction for standard users.|
| Disabled        | Retains historical values in database, but hides field from all intake forms.    |
+-----------------+----------------------------------------------------------------------------------+
```

### 1. Mandatory Validation Guard
When `required: true` is set, [`CustomFieldService.validate`](file:///Users/naveenadicharla/Documents/ridhzo/src/domains/customFields/service.ts#L152) halts any save lacking the value:
```typescript
const isEmpty = raw === undefined || raw === null || raw === "" ||
  (def.type === "multiselect" && Array.isArray(raw) && raw.length === 0);

if (isEmpty && def.required) {
  throw new FieldValidationError(`Missing required field: ${def.label}`);
}
```

### 2. Admin-Only Privacy Gate
Fields marked `adminOnly = true` are filtered out server-side for standard members in [`listCustomFieldsAction`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/customFields.ts#L16):
```typescript
const isAdmin = await hasPermission("settings.manage");
const fields = await CustomFieldService.list(organizationId);
return isAdmin ? fields : fields.filter((f) => !f.adminOnly);
```
Standard sales reps cannot view or edit admin-only fields in the UI, nor can they submit them via API.

---

## 7. Storage Architecture & Key Slugification

### 1. Automatic Key Slugification
When an administrator enters a label (e.g., `"Target Close Date"`), Ridhzo generates a persistent machine slug:
```typescript
function slugify(label: string) {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 50) || "field";
}
```

### 2. Collision Defense
If an organization already has a field with the same slug, [`CustomFieldService.uniqueKey`](file:///Users/naveenadicharla/Documents/ridhzo/src/domains/customFields/service.ts#L36) appends numerical counters (`budget_2`, `budget_3`), preventing unique index conflicts on `(organization_id, key)`.

### 3. Key Immutability
Once created, a custom field's `key` and `type` cannot be modified. Administrators may freely rename the display label, update select options, or reorder the field, but the underlying JSONB key remains fixed. This ensures existing lead data in `leads.customData` is never corrupted or orphaned.

---

## 8. Complete Code & Symbol Reference

### Frontend Components & Views
- [`CustomFieldsPage`](file:///Users/naveenadicharla/Documents/ridhzo/src/app/(dashboard)/settings/custom-fields/page.tsx): Route handler checking permissions and pre-fetching organization field definitions.
- [`CustomFieldsManager`](file:///Users/naveenadicharla/Documents/ridhzo/src/components/settings/CustomFieldsManager.tsx): Client-side manager providing field creation, inline editing, drag reordering, and datalist suggestions.

### Server Actions
- [`listCustomFieldsAction`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/customFields.ts#L11): Fetches custom field definitions with role-based admin filtering.
- [`createCustomFieldAction`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/customFields.ts#L35): Validates and inserts a new custom field definition with automatic slug generation.
- [`updateCustomFieldAction`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/customFields.ts#L63): Updates field labels, options, default values, and display flags.
- [`reorderCustomFieldsAction`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/customFields.ts#L79): Persists new display order indexes for drag-and-drop sorting.
- [`deleteCustomFieldAction`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/customFields.ts#L92): Deletes custom field definitions from the tenant workspace.

### Domain Services & Database Tables
- [`CustomFieldService`](file:///Users/naveenadicharla/Documents/ridhzo/src/domains/customFields/service.ts): Core domain service managing field definitions, slug uniqueness, and input validation.
- [`FieldValidationError`](file:///Users/naveenadicharla/Documents/ridhzo/src/domains/customFields/service.ts#L13): Custom error class returning user-friendly 422 validation messages.
- [`customFieldDefs`](file:///Users/naveenadicharla/Documents/ridhzo/src/db/schema/system.ts#L48): Drizzle table storing custom field definitions, options, flags, and tab groupings.
- [`leads.customData`](file:///Users/naveenadicharla/Documents/ridhzo/src/db/schema/leads.ts): JSONB column storing actual field values per lead record.
