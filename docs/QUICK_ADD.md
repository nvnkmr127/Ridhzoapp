# Global Quick Add (`QuickAddLeadDrawer`)

## 1. Executive Summary & Purpose

The **Global Quick Add** drawer is the primary high-velocity lead intake tool in Ridhzo CRM. Accessible from any page in the dashboard header via the **Quick Add** button (or keyboard shortcuts), it enables sales reps to capture inbound phone leads, event contacts, and walk-ins in under 5 seconds without leaving their current workflow.

Key capabilities include:
- **Global Header Availability:** Mounted on the dashboard top bar across desktop and tablet viewports.
- **Dynamic Custom Fields Injection:** Automatically fetches and renders the organization's custom field definitions with strict required-field validation.
- **Offline-First Resilience:** If network connectivity drops, leads are intercepted and safely enqueued in client-side IndexedDB outboxes with automatic background synchronization upon reconnection.
- **Immediate Team Assignment:** Direct owner assignment dropdown with user pre-fetching.
- **Inline Server-Side Error Mapping:** Catches duplicates, email format anomalies, and constraint violations, highlighting the specific form controls directly.

---

## 2. File & Component Architecture

| Purpose | File Path |
| :--- | :--- |
| **Drawer UI & Form Controller** | [`src/components/leads/QuickAddLeadDrawer.tsx`](file:///Users/naveenadicharla/Documents/ridhzo/src/components/leads/QuickAddLeadDrawer.tsx) |
| **Header Integration** | [`src/components/layout/Header.tsx:62-67`](file:///Users/naveenadicharla/Documents/ridhzo/src/components/layout/Header.tsx#L62-L67) |
| **Custom Field Dynamic Renderer** | [`src/components/leads/CustomFieldInputs.tsx`](file:///Users/naveenadicharla/Documents/ridhzo/src/components/leads/CustomFieldInputs.tsx) |
| **Server Lead Creation Action** | [`src/lib/actions/leads.ts`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/leads.ts) |
| **Offline Sync & Storage Queue** | [`src/lib/offline/outbox.ts`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/offline/outbox.ts) |
| **Custom Field Schema Query** | [`src/lib/actions/customFields.ts`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/customFields.ts) |
| **Team Users Directory Action** | [`src/lib/actions/users.ts`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/users.ts) |

---

## 3. Data Intake & Validation Schema

The form uses `react-hook-form` paired with a Zod resolver schema to ensure high data integrity:

```typescript
const formSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(255, "Name cannot exceed 255 characters"),
  email: z.string().trim().email("Invalid email address").optional().or(z.literal("")).or(emptyStringToUndefined),
  phone: z.string().trim().max(50, "Phone number too long").optional().or(z.literal("")).or(emptyStringToUndefined),
  company: z.string().trim().max(255, "Company name cannot exceed 255 characters").optional().or(z.literal("")).or(emptyStringToUndefined),
  ownerId: z.string().optional().or(z.literal("")).or(emptyStringToUndefined),
});
```

### Core Input Fields:
1. **Full Name (`name`):** Required. Standard text input with autofocus.
2. **Email Address (`email`):** Optional. Validated against standard email RFC format.
3. **Phone Number (`phone`):** Optional. International dial code and digit handling.
4. **Company / Organization (`company`):** Optional. Firmographic association.
5. **Assign Owner (`ownerId`):** Optional. Dropdown populated with active organization members; defaults to unassigned or current logged-in rep.

---

## 4. Dynamic Custom Fields Integration

1. **Preload on Mount & On Open:** When the drawer mounts, `listCustomFieldsAction()` loads all active fields. When opened, it re-fetches to guarantee newly added fields in `/settings/custom-fields` appear instantly.
2. **Support for 10 Field Types:** Leverages [`CustomFieldInputs`](file:///Users/naveenadicharla/Documents/ridhzo/src/components/leads/CustomFieldInputs.tsx) supporting:
   - Text & Long Text (Textarea)
   - Number & Currency (with ISO currency symbol normalization)
   - Date & Time
   - Single Select & Multi-Select
   - Checkbox (Boolean)
   - URL
3. **Client-Side Required Enforcement:** Before submission, the form iterates over active definitions:
   ```typescript
   const missing = activeDefs.filter((d) => d.required && !(String(customValues[d.key] ?? "")).trim());
   if (missing.length) {
     toast({
       variant: "destructive",
       title: "Required field missing",
       description: `Please fill in required custom field: ${missing.map((m) => m.label).join(", ")}`,
     });
     return;
   }
   ```

---

## 5. Offline-First Resilience

Field sales representatives frequently capture lead details in trade shows, elevators, or areas with unstable mobile connectivity.

If `!navigator.onLine`:
1. The submission skips the network fetch.
2. The payload is passed to [`enqueueOfflineLead(leadPayload)`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/offline/outbox.ts).
3. The lead is saved locally in IndexedDB with a client-generated UUID and local timestamp.
4. A friendly toast informs the user:
   `"Saved offline ⚡ — You're offline. Lead was saved locally and will auto-sync once reconnected."`
5. The drawer cleanly closes and resets the form.
6. The global `OfflineStatusIndicator` tracks the outbox, and the service worker flushes pending leads to `/api/leads` as soon as connectivity resumes.

---

## 6. Server Action Execution & Error Handling

When online, `createLeadAction` dispatches to [`LeadService.createLead`](file:///Users/naveenadicharla/Documents/ridhzo/src/domains/leads/service.ts):
- **Event Fan-Out:** Automatically emits `lead.created` triggering deduplication checks, automated lead distribution, CAPI conversion postback, and BullMQ background enrichment.
- **Structured Error Handling:** If the server returns field-level validation errors (e.g., duplicated phone number or invalid domain), errors are mapped directly onto the form fields via `form.setError(key, { message })`.
- **Success Flow:** Displays a success toast, closes the drawer, resets custom field inputs, and revalidates dashboard and lead list routes (`router.refresh()`).
