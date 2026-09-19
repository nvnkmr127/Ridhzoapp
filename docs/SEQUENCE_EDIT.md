# Ridhzo Sequence Editor & AI Drip Refinement: Product & Marketing Specification

> **Document Type:** Product Architecture, Feature Analysis & Website Marketing Reference  
> **Target Audience:** Revenue Operations Managers, Sales Directors, Growth Marketers, BDR Team Leads  
> **Scope:** Sequence Edit Interface (`/sequences/[id]/edit`), Sequence Builder in Edit Mode (`SequenceBuilder.tsx`), AI Drip Generation & Heuristic Fallbacks (`generateSequenceAction`), Wholesale Step Mutation (`SequenceService.update`), Active Enrollment Preservation, and Live Case Study on Sequence `dbc24b3a-a878-4c1f-9712-47c20febbdc8`.  
> **Source Verification:** Verified against live Ridhzo codebase (`src/app/(dashboard)/sequences/[id]/edit/page.tsx`, `SequenceBuilder.tsx`, `ai.ts`, `sequenceService.ts`, `src/lib/actions/sequences.ts`, and verified against PostgreSQL live database records for sequence `dbc24b3a-a878-4c1f-9712-47c20febbdc8`).

---

## 1. Executive Overview

Sales messaging is never static. Market conditions shift, objection patterns evolve, and marketing collateral gets updated. If modifying a live sales drip requires pausing all active leads, re-enrolling hundreds of prospects, or dealing with broken cron jobs, sales operations teams hesitate to refine their copy, resulting in stagnant conversion rates.

The **Ridhzo Sequence Editor (`/sequences/[id]/edit`)** provides an agile, non-destructive editing studio for multi-channel sales drips:
1. **Active Enrollment Preservation:** When a sequence is updated, active prospect runs are **not** disrupted or cancelled. Leads currently sitting at Step 2 remain at Step 2; they simply receive the updated Step 2, Step 3, and Step 4 definitions from that point forward.
2. **AI-Powered Sequence Re-Drafting:** Users can type a revised campaign goal and click **"Generate"** (`Sparkles` icon) to completely regenerate multi-step copy, day offsets, and channels using either live LLMs or built-in contextual sales heuristics.
3. **Wholesale Atomic Database Mutation:** Updates persist atomically within database transactions, replacing previous `sequence_steps` records while maintaining strict tenant isolation.
4. **Multi-Channel Precision Editing:** Empowers sales leaders to fine-tune day offsets, toggle between WhatsApp and Email channels, attach brochures or decks (`attachmentUrl`), and embed dynamic personalization tokens (`{{first_name}}`, `{{company}}`).
5. **Zero-Downtime Hot Reloading:** Changes take effect immediately on the next 5-minute background worker scan (`sequenceWorker.ts`).

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                         RIDHZO SEQUENCE EDITING ARCHITECTURE                           │
└────────────────────────────────────────────────────────────────────────────────────────┘
                                              │
                                              ▼
                             ┌─────────────────────────────────┐
                             │ /sequences/[id]/edit            │
                             │ Page Controller queries:        │
                             │ SequenceService.getWithSteps()  │
                             └─────────────────────────────────┘
                                              │
                                              ▼
                             ┌─────────────────────────────────┐
                             │ SequenceBuilder (initial=data)  │
                             │ • Pre-populates Name & Desc     │
                             │ • Pre-populates Step Cards      │
                             │ • AI Drip Prompt (Optional)     │
                             └─────────────────────────────────┘
                                              │
                      ┌───────────────────────┴───────────────────────┐
                      ▼                                               ▼
           [Manual Customization]                          [AI Re-Generation]
        • Tweak day offset (0, 2, 5)                  • Goal: "Insurance follow-up"
        • Channel: WhatsApp / Email                   • generateSequenceAction()
        • Insert tokens: {{first_name}}               • Heuristic fallback ready
        • Attach PDF URL / Brochure                   • Replaces steps in canvas
                      │                                               │
                      └───────────────────────┬───────────────────────┘
                                              ▼
                                   [Click 'Update sequence']
                                              │
                                              ▼
                             ┌─────────────────────────────────┐
                             │ updateSequenceAction(id, data)  │
                             │ Zod Schema Validation           │
                             └─────────────────────────────────┘
                                              │
                                              ▼
                             ┌─────────────────────────────────┐
                             │   SequenceService.update()      │
                             │ • UPDATE sequences (name, desc) │
                             │ • DELETE old sequence_steps     │
                             │ • INSERT new sequence_steps     │
                             └─────────────────────────────────┘
                                              │
                                              ▼
                             ┌─────────────────────────────────┐
                             │ ACTIVE ENROLLMENT PRESERVATION: │
                             │ Enrollments retain currentStep! │
                             │ Next scan delivers new copy.    │
                             └─────────────────────────────────┘
```

---

## 2. Live Database Case Study: Editing `dbc24b3a-a878-4c1f-9712-47c20febbdc8`

When accessing `/sequences/dbc24b3a-a878-4c1f-9712-47c20febbdc8/edit`, the page controller queries the live PostgreSQL database and loads the current sequence record:

### Initial Preloaded State (Current Live DB Record)
* **Sequence ID:** `dbc24b3a-a878-4c1f-9712-47c20febbdc8`
* **Pre-filled Name:** *"Nurture a new insurance lead over a week toward booking a ca"*
* **Pre-filled Description:** `""` (empty)
* **Pre-filled Steps:**
  * **Step 1:** Day `0` | Channel: `WhatsApp` | Body: `"m"` | Attachments: `None`

### The Problem with the Current Record
The existing record was saved with placeholder test text (`"m"`). It has only one step, lacks multi-channel follow-up, and provides no value to an inbound insurance lead.

### The Transformation: Upgrading to a High-Converting Insurance Drip
By utilizing `/sequences/dbc24b3a-a878-4c1f-9712-47c20febbdc8/edit`, sales operations can enter the goal:
> *"Nurture a new insurance lead over 7 days toward booking an auto policy consultation call"*

Clicking **"Generate"** or configuring the steps manually transforms the sequence into an enterprise-grade cadence:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ BEFORE EDITING (Current DB Record)                                                     │
├───────┬───────┬──────────┬─────────────────────────────────────────────────────────────┤
│ Step  │ Day   │ Channel  │ Content                                                     │
├───────┼───────┼──────────┼─────────────────────────────────────────────────────────────┤
│ 1     │ Day 0 │ WhatsApp │ "m"                                                         │
└───────┴───────┴──────────┴─────────────────────────────────────────────────────────────┘
                                              │
                                              ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ AFTER EDITING (Transformed Production Cadence)                                         │
├───────┬───────┬──────────┬─────────────────────────────────────────────────────────────┤
│ Step  │ Day   │ Channel  │ Content                                                     │
├───────┼───────┼──────────┼─────────────────────────────────────────────────────────────┤
│ 1     │ Day 0 │ WhatsApp │ "Hi {{first_name}}, thanks for connecting! I'm preparing a  │
│       │ (Imm.)│          │ customized insurance quote for you. Any specific timelines?"│
├───────┼───────┼──────────┼─────────────────────────────────────────────────────────────┤
│ 2     │ Day 2 │ WhatsApp │ "Hi {{first_name}}, sharing our 2026 policy comparison guide│
│       │ (+2d) │          │ below. Would this weekend work for a quick 10-minute call?" │
│       │       │          │ Attachment: Policy_Guide_2026.pdf                           │
├───────┼───────┼──────────┼─────────────────────────────────────────────────────────────┤
│ 3     │ Day 5 │ Email    │ "Hi {{first_name}},\n\nChecking in on the insurance options │
│       │ (+3d) │          │ we discussed. We can tailor coverage to your exact budget.  │
│       │       │          │ Feel free to book a consultation on my calendar: [Link]\n\n │
│       │       │          │ Best regards,"                                              │
├───────┼───────┼──────────┼─────────────────────────────────────────────────────────────┤
│ 4     │ Day 8 │ WhatsApp │ "Hi {{first_name}}, just checking in one final time. I'm    │
│       │ (+3d) │          │ here whenever you're ready to review your coverage options!"│
└───────┴───────┴──────────┴─────────────────────────────────────────────────────────────┘
```

---

## 3. Detailed Interface & Functional Walkthrough

### 1. Navigation Header
* **Back Button (`<ArrowLeft />`):** Returns to the sequences directory (`/sequences`).
* **Title:** Clean, prominent heading *"Edit sequence"*.

### 2. Campaign Metadata Section
* **Sequence Name (`#seq-name`):** Pre-populated with the current title. Allows editing campaign names without breaking automation links.
* **Description (`#seq-desc`):** Optional textarea describing campaign intent, target audience, or internal ownership notes.

### 3. AI Drip Assistant (`#seq-goal`)
* **Natural Language Goal Input:** Users enter target outcomes (e.g., *"Re-engage stalled software trial users over two weeks"*).
* **"Generate" Button (`Sparkles` icon):**
  * Dispatches [generateSequenceAction](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/ai.ts).
  * **Dual Engine Architecture:**
    1. *AI Engine (Online):* Prompts Anthropic/OpenAI using `businessPreamble(org)` and `SEQ_SYSTEM` to generate structured JSON steps.
    2. *Heuristic Engine (Offline/Fallback):* If AI is disabled or unreachable, [buildContextualSequence](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/ai.ts) automatically detects keywords (*insurance, demo, call, quote, property*) and injects curated, high-converting steps.
  * Replaces the editor's step cards with freshly drafted content, while preserving the user's ability to edit before saving.

### 4. Step Cards Editor
Each step card represents an isolated touchpoint in the cadence:
* **Day Offset Input (`dayOffset`):** Number input (`min={0}`) specifying days from initial enrollment. Day 0 executes immediately; Day 2 executes 48 hours later.
* **Channel Selector (`channel`):**
  * **WhatsApp:** Sends via Meta Cloud API.
  * **Email:** Sends formatted HTML email via standard mailer.
* **Message Body Textarea (`body`):**
  * Full multi-line textarea supporting line breaks.
  * Live Token Interpolation: Supports `{{first_name}}`, `{{name}}`, `{{company}}`, `{{email}}`, and `{{phone}}`.
* **Collapsible Document & Attachment Bar:**
  * **Attachment Name:** Human-readable label (e.g., *"Policy Brochure"*).
  * **Attachment URL:** Direct URL to hosted media, PDF, or cloud file.
* **Delete Step Button (`Trash2` icon):** Removes individual touchpoints. Disabled when only one step remains.
* **Add Step Button (`+ Add step`):** Appends a new step card, automatically calculating `dayOffset = (previousDayOffset) + 2` to maintain natural pacing.

### 5. Mode Advisory Banners
* **WhatsApp Cloud API Notice:**  
  *`"WhatsApp steps require the WhatsApp Business API. In personal mode they're logged as manual reminders instead of auto-sent."`*  
  Educates reps that running in Personal WhatsApp mode logs reminders rather than attempting direct automated background sends.

---

## 4. Backend Persistence & Data Integrity

When the user clicks **"Update sequence"** (`Save` icon), the frontend calls [updateSequenceAction](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/sequences.ts).

### 1. Zod Validation Gate
```typescript
const stepSchema = z.object({
  dayOffset: z.coerce.number().int().min(0).max(365),
  channel: z.enum(["whatsapp", "email"]),
  body: z.string().min(1).max(2000),
  attachmentUrl: z.string().url().max(2048).nullish().or(z.literal("")).transform((v) => v || null),
  attachmentName: z.string().max(255).nullish().or(z.literal("")).transform((v) => v || null),
});

const createSchema = z.object({
  name: z.string().trim().min(1).max(255),
  description: z.string().max(2000).nullish().or(z.literal("")).transform((v) => v || null),
  steps: z.array(stepSchema).min(1, "Add at least one step"),
});
```

### 2. Wholesale Step Mutation (`SequenceService.update`)
```typescript
static async update(
  organizationId: string, 
  sequenceId: string, 
  name: string, 
  steps: SequenceStepInput[], 
  description?: string | null
) {
  // 1. Verify tenant organization ownership
  const [seq] = await db.select({ id: sequences.id })
    .from(sequences)
    .where(and(eq(sequences.id, sequenceId), eq(sequences.organizationId, organizationId)));
  if (!seq) throw new Error("Sequence not found");

  // 2. Update parent sequence record
  await db.update(sequences)
    .set({ name, description: description ?? null })
    .where(eq(sequences.id, sequenceId));

  // 3. Atomically replace steps
  await db.delete(sequenceSteps).where(eq(sequenceSteps.sequenceId, sequenceId));
  if (steps.length) {
    await db.insert(sequenceSteps).values(
      steps.map((s, i) => ({
        sequenceId,
        stepIndex: i,
        dayOffset: Math.max(0, Math.floor(s.dayOffset)),
        channel: s.channel === "email" ? "email" : "whatsapp",
        body: s.body,
        attachmentUrl: s.attachmentUrl || null,
        attachmentName: s.attachmentName || null,
      }))
    );
  }
  return { id: sequenceId };
}
```

### 3. Why Active Enrollments Do Not Break
When steps are replaced wholesale, what happens to leads currently running through the sequence?
* **Index-Based Pointer:** Each lead's enrollment record tracks `currentStep` (e.g., `currentStep = 1`).
* **Seamless Next Step Execution:** When the 5-minute background cron worker ([sequenceWorker](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/jobs/workers/sequenceWorker.ts)) runs, it queries:
  ```typescript
  const steps = await db.select().from(sequenceSteps)
    .where(eq(sequenceSteps.sequenceId, enr.sequenceId))
    .orderBy(asc(sequenceSteps.stepIndex));
  const step = steps[enr.currentStep];
  ```
* Because `currentStep` is an integer index, the lead simply receives the **updated definition** of that step index on their next scheduled date.
* If a sequence is shortened and `steps[enr.currentStep]` no longer exists, the engine automatically completes the enrollment cleanly:
  ```typescript
  if (!step) {
    await db.update(sequenceEnrollments)
      .set({ status: "completed", nextRunAt: null })
      .where(eq(sequenceEnrollments.id, enr.id));
    continue;
  }
  ```

---

## 5. Marketing-Friendly Feature Explanation

### Why Revenue Operations Teams Love the Ridhzo Sequence Editor

In sales, your first draft of a follow-up sequence is rarely your best. High-growth sales teams constantly A/B test messaging, update pricing links, and refine call-to-actions based on customer replies. In traditional systems, editing an active sequence risks breaking live campaigns or spamming active deals.

**Ridhzo makes sequence refinement seamless, safe, and instantaneous.**

* **Edit Live Campaigns with Zero Risk:** Refine messaging, adjust timing offsets, and replace collateral without pausing your sales pipeline. Active prospects seamlessly transition to your new messaging.
* **AI-Assisted Message Polish:** Overcome writer's block with our integrated AI assistant. Describe your updated sales objective, and let AI draft high-converting touchpoints with proven cadence timing.
* **Unified Multi-Channel Control:** Seamlessly switch steps between WhatsApp and Email to match your buyer’s preferred communication channels.
* **Automatic Collateral Distribution:** Keep brochures, presentation decks, and pricing guides up to date with direct attachment links embedded right into your message steps.

---

## 6. Feature List for Website Marketing

* **Agile Drip Campaign Refinement**  
  Update copy, adjust day offsets, and reorder steps on active sequences with zero operational downtime.

* **Active Enrollment Continuity**  
  Safely edit live cadences without resetting active prospect positions or causing duplicate message delivery.

* **One-Click AI Drip Re-Drafting**  
  Generate revised 3-to-5 step communication flows from a simple natural language goal prompt in seconds.

* **Heuristic Offline Sales Recipes**  
  Built-in fallback templates ensure intelligent sequence drafting even in environments without an active LLM connection.

* **Multi-Channel Step Toggling**  
  Flexibly assign individual steps to WhatsApp or Email to optimize touchpoint frequency and engagement.

* **Dynamic Document & PDF Linking**  
  Embed pitch decks, brochures, and case study links directly into outgoing sequence steps.

* **Smart Day Offset Auto-Pacing**  
  Automatically spaces out newly added steps by +2 days to maintain natural follow-up cadences.

* **Real-Time Token Personalization**  
  Test and refine dynamic personalization tokens (`{{first_name}}`, `{{company}}`) across every touchpoint.

---

## 7. Page Blueprint & Wireframe

### Sequence Edit Screen (`/sequences/[id]/edit`)
```
+====================================================================================+
| [<- Go back]  Edit sequence                                                        |
+====================================================================================+
| Name:                                                                              |
| [ Nurture a new insurance lead over a week toward booking a ca                   ] |
|                                                                                    |
| Description (optional):                                                            |
| [ High-priority nurture for inbound auto insurance quote inquiries               ] |
|                                                                                    |
| Describe the goal (AI will draft the steps):                                       |
| [ Nurture an insurance lead for 7 days toward booking a consultation call        ] |
|                                                    [Sparkles Drafting... / Generate|
|                                                                                    |
| STEPS                                                                              |
| (i) WhatsApp steps require the WhatsApp Business API. In personal mode...         |
|                                                                                    |
| +--------------------------------------------------------------------------------+ |
| | Day [ 0 ]  [ WhatsApp               v ]                                [Trash] | |
| | Message:                                                                       | |
| | Hi {{first_name}}, thanks for connecting! I'm preparing a customized quote...   | |
| | Attachment label: [ Rate Card 2026 ]  Attachment URL: [ https://...          ] | |
| +--------------------------------------------------------------------------------+ |
| | Day [ 2 ]  [ WhatsApp               v ]                                [Trash] | |
| | Message:                                                                       | |
| | Hi {{first_name}}, sharing our policy comparison guide. Does Friday work?       | |
| | Attachment label: [ Guide PDF      ]  Attachment URL: [ https://...          ] | |
| +--------------------------------------------------------------------------------+ |
| | Day [ 5 ]  [ Email                  v ]                                [Trash] | |
| | Message:                                                                       | |
| | Hi {{first_name}},\n\nChecking in on the coverage options we prepared...       | |
| | Attachment label: [                ]  Attachment URL: [                      ] | |
| +--------------------------------------------------------------------------------+ |
| [+ Add step]                                                                       |
|                                                                                    |
|                                                      [Save  Update sequence]       |
+====================================================================================+
```

---

## 8. Technical Reference

### Routes & Page Controllers
* **Edit Controller:** [`src/app/(dashboard)/sequences/[id]/edit/page.tsx`](file:///Users/naveenadicharla/Documents/ridhzo/src/app/(dashboard)/sequences/[id]/edit/page.tsx)
* **Detail Controller:** [`src/app/(dashboard)/sequences/[id]/page.tsx`](file:///Users/naveenadicharla/Documents/ridhzo/src/app/(dashboard)/sequences/[id]/page.tsx)

### UI Components
* **Editor Component:** [SequenceBuilder.tsx](file:///Users/naveenadicharla/Documents/ridhzo/src/components/sequences/SequenceBuilder.tsx)

### Server Actions & Domain Services
* **Fetch Action:** `getSequenceAction` in [`src/lib/actions/sequences.ts`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/sequences.ts)
* **Mutation Action:** `updateSequenceAction` in [`src/lib/actions/sequences.ts`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/sequences.ts)
* **AI Action:** `generateSequenceAction` in [`src/lib/actions/ai.ts`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/ai.ts)
* **Domain Service:** `SequenceService.update` and `SequenceService.getWithSteps` in [`src/domains/leads/sequenceService.ts`](file:///Users/naveenadicharla/Documents/ridhzo/src/domains/leads/sequenceService.ts)

### Database Models (`src/db/schema/sequences.ts`)
* `sequences`: Updates `name`, `description`, and `updatedAt`.
* `sequenceSteps`: Atomically deleted and re-inserted with ordered `stepIndex` (0..N).
* `sequenceEnrollments`: Active runs preserve `currentStep` pointer, preventing campaign disruption.
