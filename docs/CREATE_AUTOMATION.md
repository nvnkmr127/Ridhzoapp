# Ridhzo "Create Automation" & Workflow Builder: Product & Marketing Specification

> **Document Type:** Product Architecture, Feature Analysis & Website Marketing Reference  
> **Target Audience:** Chief Revenue Officers, Sales Operations Directors, Growth Marketers, CRM Administrators  
> **Scope:** Create Automation Surface (`/automations/create`), Edit Automation Surface (`/automations/[id]/edit`), Visual Rule Canvas (`AutomationBuilder.tsx`), Condition Engine (`conditions.ts`), Transactional Persistence (`automations.ts`), Capacity Routing (`capacityAssignmentService.ts`), and Timing Offsets (`resolveDueAt`).  
> **Source Verification:** Verified against live Ridhzo codebase (`src/app/(dashboard)/automations/create/page.tsx`, `src/app/(dashboard)/automations/[id]/edit/page.tsx`, `AutomationBuilder.tsx`, `engine.ts`, `schema.ts`, `conditions.ts`, `sourceService.ts`, `sequenceService.ts`, `capacityAssignmentService.ts`, `src/lib/actions/automations.ts`, and PostgreSQL schema).

---

## 1. Executive Overview

In competitive sales environments, standard "if this, then that" automation tools frequently fall short. They either force non-technical sales managers into intimidating, spaghetti-like node editors or restrict them to simplistic, single-step triggers that cannot inspect custom attributes or balance rep capacity.

The **Ridhzo Create Automation Suite** (`/automations/create`) delivers an intuitive, three-tiered visual canvas designed specifically for revenue operations:
1. **The "WHEN → IF → THEN" Mental Model:** A clean, vertical rule canvas that mirrors human logic. Teams specify the initiating CRM event (WHEN), optional multi-layered lead filters (IF), and an ordered sequence of automated tasks (THEN).
2. **Context-Aware Dynamic Selectors:** The builder automatically queries the tenant's real-time configuration—populating lead sources (Facebook Ads, Web Forms, Inbound Webhooks) and active multi-step sequences directly into visual dropdown menus.
3. **Capacity-Aware Team Load Balancing:** Includes native intelligent round-robin actions that inspect real-time rep workload (`maxCapacity`) and route deals to the agent with the highest available bandwidth.
4. **Relative Timing Offsets (`resolveDueAt`):** Solves the classic automation pitfall of hardcoded dates. Follow-ups and tasks calculate deadlines dynamically relative to the execution moment (e.g., `dueInDays: 1`, `dueInHours: 4`, `dueInMinutes: 30`).
5. **Transactional Integrity & Atomic Updates:** Whether creating a new rule or updating an active workflow, changes persist atomically within database transactions, preventing partial or broken state.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        RIDHZO "CREATE AUTOMATION" ARCHITECTURE                         │
└────────────────────────────────────────────────────────────────────────────────────────┘
                                              │
                      ┌───────────────────────┴───────────────────────┐
                      ▼                                               ▼
             [/automations/create]                         [/automations/[id]/edit]
         Loads sources & sequences                     Fetches existing workflow + steps
                      │                                               │
                      └───────────────────────┬───────────────────────┘
                                              ▼
                             ┌─────────────────────────────────┐
                             │     AutomationBuilder.tsx       │
                             │  • Rule Name & Active State     │
                             │  • 1. WHEN (Trigger Select)     │
                             │  • 2. IF (Source & Field Match) │
                             │  • 3. THEN (Ordered Actions)    │
                             └─────────────────────────────────┘
                                              │
                                       [Client Save]
                                 • Upfront JSON Validation
                                 • RBAC: automations.manage
                                              │
                                              ▼
                             ┌─────────────────────────────────┐
                             │  createAutomation Server Action │
                             │  (Atomic DB Transaction)        │
                             └─────────────────────────────────┘
                                              │
                     ┌────────────────────────┼────────────────────────┐
                     ▼                        ▼                        ▼
         INSERT into automations    INSERT into triggers      INSERT into actions
         • organizationId           • type                    • orderIndex (0, 1, 2)
         • name, isActive           • config                  • type, config
                                              │
                                              ▼
                                    INSERT into conditions
                                    • Recursive AND/OR group
```

---

## 2. The 3-Tier Rule Canvas Structure

### 1. Automation Metadata
* **Automation Name:** Required descriptive text field (e.g., *"Facebook Leads → Welcome WhatsApp + Day 1 Call"*). Maximum 255 characters.
* **Active Status Toggle:** Controls whether the automation is live immediately upon saving (`isActive = true`) or saved in a draft/paused state (`isActive = false`).

---

### 2. Tier 1: WHEN (Trigger Configuration)

The **WHEN** block defines the exact lifecycle event that invokes the automation:

```
┌────────────────────────────────────────────────────────────┐
│ 1. WHEN (trigger)                                          │
│    [ Lead created                                     v ]  │
└────────────────────────────────────────────────────────────┘
```

#### Supported Primary Triggers (Dropdown UI):
* **`lead.created` (Lead created):** Fires the instant a prospect enters the CRM via Meta Lead Ads webhooks, landing page forms, API endpoints, or manual intake.
* **`lead.assigned` (Lead assigned):** Fires whenever lead ownership is granted to a representative or transferred between reps.
* **`lead.status_changed` (Lead status changed):** Fires when a deal progresses across lifecycle states (e.g., `new` → `active`, `contacted` → `won`, `lost`).

#### Full Schema Triggers (Supported by Underlying Engine):
* `lead.stage_changed`: Fires when a lead card moves across Kanban pipeline stages.
* `lead.tag_added`: Fires when a user or batch process attaches a new categorization tag.
* `follow_up.scheduled`: Fires when a call, meeting, or task is booked.
* `follow_up.completed`: Fires when a rep marks a scheduled outreach completed.
* `follow_up.overdue`: Fires when a scheduled task crosses its deadline without completion.
* `task.completed`: Fires upon fulfillment of a general rep task.

---

### 3. Tier 2: IF (Conditions & Filtering) — Optional

The **IF** block provides precision filtering to ensure automations execute only on target prospects, avoiding unwanted mass actions:

```
┌────────────────────────────────────────────────────────────┐
│ 2. IF (conditions) — optional                              │
│    Lead source:                                            │
│    [ Facebook Ads                                     v ]  │
│                                                            │
│    Advanced field match — optional:                        │
│    [ status           ] [ Equals v ] [ new               ] │
└────────────────────────────────────────────────────────────┘
```

#### 1. Lead Source Selector
Dynamically populated with real-time sources from [LeadSourceService.getSources](file:///Users/naveenadicharla/Documents/ridhzo/src/domains/leads/sourceService.ts):
* **`__any__` (Any source):** Triggers regardless of origin channel.
* **Specific Source:** Restricts execution to specific channels (e.g., *Facebook Lead Ads*, *Google Ads Webhook*, *Website Contact Form*, *Cold Outreach List*).

#### 2. Advanced Field Matcher
Matches any attribute of the customer record:
* **Target Field:**
  * Native fields: `status`, `company`, `email`, `phone`, `expectedValue`, `priority`.
  * Lead Tags: Evaluates tags attached to the lead (e.g., `VIP`, `Enterprise`).
  * Custom Fields (`customData.*`): Dynamically inspects tenant custom fields (e.g., `customData.budget`, `customData.industry`, `customData.propertyType`).
* **Comparison Operators:**
  * `equals`: Exact case-insensitive match (`String(val).toLowerCase()`).
  * `not_equals`: Excludes specific values.
  * `contains`: Substring search.
  * `does_not_contain`: Negative substring search.
  * `greater_than`: Numeric comparison (e.g., `expectedValue > 10000`).
  * `less_than`: Numeric comparison.
* **Condition Engine Logic:** The builder combines the selected Source and Advanced Field into a composite `AND` condition group stored as structured JSONB:
  ```json
  {
    "type": "AND",
    "conditions": [
      { "field": "sourceId", "operator": "equals", "value": "uuid-facebook-ads" },
      { "field": "status", "operator": "equals", "value": "new" }
    ]
  }
  ```

---

### 4. Tier 3: THEN (Ordered Action Sequence)

The **THEN** block represents an ordered, sequential pipeline of actions that execute step-by-step when conditions pass:

```
┌────────────────────────────────────────────────────────────┐
│ 3. THEN (actions) — Runs in order                          │
│                                                            │
│ (1) [ Assign round-robin (balance across team)        v ]  │
│     Config: {"maxCapacity": 25}                            │
│                                                            │
│ (2) [ Send WhatsApp                                   v ]  │
│     Config: {"templateName": "welcome", "variables": ["{{name}}"]}
│                                                            │
│ (3) [ Enroll in sequence                              v ]  │
│     Sequence: [ 7-Day Inbound Nurture                 v ]  │
│                                                            │
│ [+ Add action]                                             │
└────────────────────────────────────────────────────────────┘
```

* **Visual Step Sequencing:** Each action displays a circular sequence badge (`1`, `2`, `3`...) indicating strict execution order (`orderIndex`).
* **Reorder & Removal:** Individual steps can be deleted via the trash icon button while preserving the rest of the chain.
* **Multi-Step Stacking:** Users can append unlimited actions by clicking **`+ Add action`**.

---

## 3. Deep Dive: Supported Actions & Configuration Schemas

| Action Key | Display Label | Purpose & Mechanism | Config Payload Example |
| :--- | :--- | :--- | :--- |
| `assign_lead` | **Assign lead (to a person)** | Directly assigns lead ownership to a specific rep. Calls `AssignmentService.assignLead`. | `{"userId": "7b8e1f02-..."}` |
| `assign_round_robin` | **Assign round-robin (balance across team)** | Dynamically inspects rep workloads and assigns deal to the rep with greatest available capacity. Calls `CapacityAssignmentService.assignLeadWithCapacity`. | `{"maxCapacity": 25}` |
| `change_status` | **Change status** | Updates lead lifecycle stage, writes audit history, and updates conversion tracking. | `{"status": "contacted"}` |
| `add_note` | **Add note** | Writes an internal note on the lead's chronological timeline. Calls `ActivityService.addActivity`. | `{"content": "Automated intake note: High priority inbound."}` |
| `create_task` | **Create task** | Schedules an internal rep task with relative offset computation. | `{"title": "Verify business registration", "dueInHours": 4}` |
| `schedule_follow_up` | **Schedule follow-up** | Creates a formal customer follow-up, synchronizing `leads.nextFollowUpAt`. | `{"title": "First discovery call", "dueInDays": 1}` |
| `send_whatsapp` | **Send WhatsApp** | Dispatches a Meta Business Cloud API pre-approved template with token substitution. | `{"templateName": "welcome", "variables": ["{{name}}"]}` |
| `enroll_in_sequence` | **Enroll in sequence** | Enrolls the lead into a multi-step drip nurture sequence via friendly dropdown. | `{"sequenceId": "9c12a4..."}` |

---

## 4. Intelligent Dynamic Capabilities

### 1. Capacity-Aware Round-Robin Balancing (`CapacityAssignmentService`)
Unlike basic round-robin implementations that blindly distribute leads in a static circle—overloading busy reps and ignoring absent staff—Ridhzo's `assign_round_robin` action performs real-time capacity analysis:
1. **Queries Active Reps:** Evaluates all users in the organization where `isActive = true`.
2. **Counts Active Deals:** Computes each rep's current open pipeline (`status IN ('new', 'active')`).
3. **Calculates Remaining Bandwidth:**
   $$\text{capacityRemaining} = \max(0, \text{maxCapacity} - \text{activeCount})$$
   *(Default capacity is 25 deals, customizable per action config).*
4. **Selects Optimal Rep:** Ranks reps by available capacity descending; the rep with the greatest bandwidth receives the lead.
5. **Fail-Safe Protection:** If all reps have reached their maximum limit, an error is caught and logged, preventing deal assignment to overloaded agents.

### 2. Relative Time Resolution (`resolveDueAt`)
A critical engineering challenge in CRM automation is scheduling tasks relative to when an event occurs. If an automation hardcoded an absolute date, subsequent leads would inherit expired deadlines.

Ridhzo’s [resolveDueAt](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/automation/engine.ts) function computes timestamps dynamically at execution time:
* **`dueInMinutes`:** $\text{dueAt} = \text{now} + (\text{minutes} \times 60,000)$
* **`dueInHours`:** $\text{dueAt} = \text{now} + (\text{hours} \times 3,600,000)$
* **`dueInDays`:** $\text{dueAt} = \text{now} + (\text{days} \times 86,400,000)$
* **Absolute Override (`dueAt`):** Allows an exact ISO timestamp if required.

### 3. Integrated Sequence Dropdown
When users select `enroll_in_sequence`:
* The builder replaces raw JSON input with a **Sequence Picker Dropdown**.
* It queries [SequenceService.list](file:///Users/naveenadicharla/Documents/ridhzo/src/domains/leads/sequenceService.ts) to populate all available drip sequences configured in the tenant workspace.
* Selecting a sequence automatically formats the underlying action config payload: `{"sequenceId": "..."}`.

### 4. WhatsApp Cloud API Prerequisite Guard
Automated instant messaging requires Meta Business Cloud API integration. If a user selects `send_whatsapp`, the builder renders a contextual advisory banner:
> ⚠️ **Info:** Automated WhatsApp needs the WhatsApp Business API. In personal mode it is logged as a manual reminder instead.

---

## 5. Persistence & Transactional Integrity

When a user clicks **"Save automation"**, the request is processed by [createAutomation](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/automations.ts) or [updateAutomation](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/automations.ts).

### 1. RBAC Permission Gate
Mutations require the `automations.manage` role permission:
```typescript
const { organizationId } = await requirePermission("automations.manage");
```
Regular sales reps can view active automations, but only authorized administrators or sales operations managers can create or modify them.

### 2. Transactional Atomicity (Zero Partial Saves)
Creating or editing an automation touches four separate relational tables (`automations`, `automationTriggers`, `automationConditions`, `automationActions`). To prevent orphaned rows or corrupted configurations:
```typescript
const newAutomation = await db.transaction(async (tx) => {
  // 1. Insert/Update parent automation record
  const [created] = await tx.insert(automations).values({ organizationId, name, isActive }).returning();
  
  // 2. Insert trigger definition
  await tx.insert(automationTriggers).values({ automationId: created.id, type: trigger.type, config: trigger.config });

  // 3. Insert condition tree
  if (conditions) {
    await tx.insert(automationConditions).values({ automationId: created.id, config: conditions });
  }

  // 4. Insert ordered action chain with explicit orderIndex
  for (let i = 0; i < actions.length; i++) {
    await tx.insert(automationActions).values({
      automationId: created.id,
      type: actions[i].type,
      config: actions[i].config,
      orderIndex: i,
    });
  }
  return created;
});
```
When editing an existing automation, `updateAutomation` executes an atomic wholesale replacement of child records within the transaction—guaranteeing that deleted steps or modified triggers never leave residual configurations.

---

## 6. Real-World Blueprint Recipes

### Recipe 1: High-Volume Inbound Meta Ad Playbook
* **Business Goal:** Instantly greet inbound Facebook Ad leads via WhatsApp, balance them across available SDRs, and book next-day calls.
* **Trigger (WHEN):** `lead.created`
* **Condition (IF):** `sourceId equals "Facebook Ads"`
* **Action 1 (THEN):** `assign_round_robin` (`{"maxCapacity": 30}`)
* **Action 2 (THEN):** `send_whatsapp` (`{"templateName": "welcome_v1", "variables": ["{{first_name}}"]}`)
* **Action 3 (THEN):** `schedule_follow_up` (`{"title": "Introductory Discovery Call", "dueInDays": 1}`)
* **Action 4 (THEN):** `enroll_in_sequence` (`{"sequenceId": "7-day-product-onboarding"}`)

### Recipe 2: High-Value VIP Inbound Escalation
* **Business Goal:** Route high-budget enterprise prospects directly to a Senior Account Executive and flag priority.
* **Trigger (WHEN):** `lead.created`
* **Condition (IF):** `customData.budget greater_than 50000`
* **Action 1 (THEN):** `assign_lead` (`{"userId": "ae-user-uuid"}`)
* **Action 2 (THEN):** `change_status` (`{"status": "active"}`)
* **Action 3 (THEN):** `add_note` (`{"content": "🚨 HIGH TICKET INBOUND: Budget exceeds $50k. Immediate phone contact required."}`)
* **Action 4 (THEN):** `create_task` (`{"title": "Conduct background company research", "dueInHours": 2}`)

### Recipe 3: Stalled Deal Alert on Overdue Follow-up
* **Business Goal:** Ensure deals do not slip when a rep misses their follow-up deadline.
* **Trigger (WHEN):** `follow_up.overdue`
* **Condition (IF):** `priority equals "high"`
* **Action 1 (THEN):** `add_note` (`{"content": "ALERT: Scheduled follow-up is past due. Manager notified."}`)

---

## 7. Marketing-Friendly Feature Explanation

### Why Revenue Operations Teams Love the Ridhzo Workflow Builder

Most CRMs force sales operations into a painful dilemma: settle for primitive 1-step notification tools, or spend thousands of dollars on third-party integration platforms that break whenever schemas change.

**Ridhzo’s Workflow Builder gives you enterprise automation power with no-code simplicity.**

* **The 3-Minute Workflow:** Build powerful multi-step sales engines in under three minutes. With intuitive "When → If → Then" structuring, anyone on your team can design automated processes without engineering help.
* **Smart Capacity Load Balancing:** Never burn out your top performers. Ridhzo’s built-in round-robin engine monitors active deal counts and automatically routes leads to reps who have the bandwidth to convert them.
* **Dynamic Time Intelligence:** Schedule tasks and follow-up calls that automatically adjust to when a lead arrives. Set calls for 30 minutes, 4 hours, or 1 business day after initial contact.
* **Seamless Drip Integration:** Connect inbound inquiries directly into automated nurture sequences with a single click.

---

## 8. Feature List for Website Marketing

* **Visual "When → If → Then" Rule Canvas**  
  An intuitive, vertical workflow builder that translates sales playbooks into executable automation sequences in minutes.

* **Dynamic Workspace Synchronization**  
  Automatically pulls active lead sources, team members, and communication sequences into visual dropdown selectors.

* **Capacity-Aware Round-Robin Lead Routing**  
  Balances inbound opportunities across sales reps based on real-time open pipeline volume and configurable capacity limits.

* **Relative Time Offsets (`resolveDueAt`)**  
  Dynamically calculates task and follow-up due dates relative to trigger execution (`dueInMinutes`, `dueInHours`, `dueInDays`).

* **Unstructured Custom Field Filtering**  
  Filter automations using standard CRM fields, organizational tags, or custom JSON attributes (`customData.field`).

* **Multi-Condition Boolean Nesting**  
  Supports complex `AND` and `OR` condition trees with full comparison operators (`equals`, `contains`, `greater_than`).

* **Pre-Built Sequence Enrollment**  
  Directly enroll leads into multi-channel WhatsApp and email drip campaigns from within the automation pipeline.

* **Transactional Persistence & RBAC Security**  
  Every workflow creation and edit is guarded by `automations.manage` permissions and persisted atomically within database transactions.

---

## 9. Page Blueprints & Wireframes

### Create Automation Layout (`/automations/create`)
```
+====================================================================================+
| [<- Go back]  Create Automation                                                    |
+====================================================================================+
| Automation Name:                                                                   |
| [ Facebook leads -> welcome + nurture                                            ] |
|                                                                                    |
| 1. WHEN (trigger)                                                                  |
|    [ Lead created                                                       v ]        |
|                                                                                    |
| 2. IF (conditions) — optional                                                      |
|    Lead source:                                                                    |
|    [ Facebook Ads                                                       v ]        |
|                                                                                    |
|    Advanced field match — optional:                                                |
|    [ status                    ] [ Equals         v ] [ new                      ] |
|                                                                                    |
| 3. THEN (actions) — Runs in order                                                  |
|    +-----------------------------------------------------------------------------+ |
|    | (1) [ Assign round-robin (balance across team)                            v ] |
|    |     Config: {"maxCapacity": 25}                                             | |
|    +-----------------------------------------------------------------------------+ |
|    | (2) [ Send WhatsApp                                                       v ] |
|    |     Config: {"templateName": "welcome", "variables": ["{{name}}"]}          | |
|    |     (i) Automated WhatsApp needs the WhatsApp Business API.                  | |
|    +-----------------------------------------------------------------------------+ |
|    | (3) [ Schedule follow-up                                                  v ] |
|    |     Config: {"title": "First discovery call", "dueInDays": 1}                | |
|    +-----------------------------------------------------------------------------+ |
|    | (4) [ Enroll in sequence                                                  v ] |
|    |     Sequence: [ 7-Day Product Onboarding Nurture                          v ] |
|    +-----------------------------------------------------------------------------+ |
|    [+ Add action]                                                                  |
|                                                                                    |
| [ Save automation ]                                                                |
+====================================================================================+
```

---

## 10. Technical Reference

### Routes & Page Controllers
* **Create Page:** [`src/app/(dashboard)/automations/create/page.tsx`](file:///Users/naveenadicharla/Documents/ridhzo/src/app/(dashboard)/automations/create/page.tsx)
* **Edit Page:** [`src/app/(dashboard)/automations/[id]/edit/page.tsx`](file:///Users/naveenadicharla/Documents/ridhzo/src/app/(dashboard)/automations/[id]/edit/page.tsx)

### UI Components
* **Canvas Component:** [AutomationBuilder.tsx](file:///Users/naveenadicharla/Documents/ridhzo/src/components/automations/AutomationBuilder.tsx)

### Domain Services & Server Actions
* **Server Actions:** [`src/lib/actions/automations.ts`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/automations.ts) (`createAutomation`, `updateAutomation`, `getAutomation`)
* **Lead Sources Service:** [LeadSourceService.getSources](file:///Users/naveenadicharla/Documents/ridhzo/src/domains/leads/sourceService.ts)
* **Sequences Service:** [SequenceService.list](file:///Users/naveenadicharla/Documents/ridhzo/src/domains/leads/sequenceService.ts)
* **Capacity Assignment Service:** [CapacityAssignmentService.assignLeadWithCapacity](file:///Users/naveenadicharla/Documents/ridhzo/src/domains/leads/capacityAssignmentService.ts)
* **Condition Matcher:** [evaluateConditionGroup](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/leads/conditions.ts)
* **Time Resolution:** [resolveDueAt](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/automation/engine.ts)

### Schemas & Validation
* **Zod Input Schema:** `automationSchema` in [`src/lib/actions/automations.ts`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/automations.ts)
* **Trigger & Action Schemas:** [TriggerConfigSchema](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/automation/schema.ts), [ActionConfigSchema](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/automation/schema.ts)
* **Database Models:** `automations`, `automationTriggers`, `automationConditions`, `automationActions` in [`src/db/schema/automations.ts`](file:///Users/naveenadicharla/Documents/ridhzo/src/db/schema/automations.ts)
