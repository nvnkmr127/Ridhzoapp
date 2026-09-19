# Ridhzo Sequence Detail & Live Funnel Visualizer: Product & Marketing Specification

> **Document Type:** Product Architecture, Feature Analysis & Website Marketing Reference  
> **Target Audience:** Sales Directors, Revenue Operations Managers, Growth Engineers, BDR Team Leads  
> **Scope:** Sequence Detail View (`/sequences/[id]`), Animated Funnel Visualizer (`SequenceFlow.tsx`), Live Instance Inspection (`dbc24b3a-a878-4c1f-9712-47c20febbdc8`), Funnel Aggregation Queries (`SequenceService.getDetail`), and Cross-System Auto-Stop Integration.  
> **Source Verification:** Verified against live Ridhzo codebase (`src/app/(dashboard)/sequences/[id]/page.tsx`, `SequenceFlow.tsx`, `SequenceService.ts`, `LeadSequencesCard.tsx`, and verified against PostgreSQL live database records for sequence `dbc24b3a-a878-4c1f-9712-47c20febbdc8`).

---

## 1. Executive Overview

Most marketing automation platforms represent multi-step email drips as static lists or detached flowchart builders. While creating steps is straightforward, monitoring how leads actually flow through the cadence in real time is notoriously difficult. Revenue leaders are left wondering: *How many leads are stuck on Step 2? Did anyone complete Step 4? Why did prospects stop receiving messages?*

The **Ridhzo Sequence Detail View (`/sequences/[id]`)** provides a transparent, living funnel visualizer for multi-channel sales drips:
1. **Real-Time Funnel Transparency:** Combines step copy, delivery channels, timing offsets, and document attachments with live prospective traffic counts at every stage of the journey.
2. **Animated Glowing-Dot Flow Canvas (`SequenceFlow.tsx`):** A custom CSS-rendered pipeline featuring animated falling glowing dots along vertical rails, visualizing active lead movement between steps.
3. **Per-Step Client Density & Share Bars:** Shows the exact number of active leads waiting on each step alongside proportional distribution bars (e.g., *"12 people here — 43% share"*).
4. **Three-State Funnel Accounting:** Categorizes all historical enrollments into:
   * **Active (`funnel.active`):** Prospects currently moving through the cadence.
   * **Completed (`funnel.completed`):** Prospects who received all scheduled touchpoints.
   * **Removed Early (`funnel.removed`):** Prospects who converted, replied, or were unenrolled before the final step.
5. **Direct Integration with Live Workspace Records:** Every element on this screen is backed by live PostgreSQL aggregations grouped across `sequence_enrollments` and `sequence_steps`.

---

## 2. Live Database Instance: `/sequences/dbc24b3a-a878-4c1f-9712-47c20febbdc8`

To ground this specification in the active Ridhzo workspace, we inspected the live database record for the URL requested by the user:

### Database Record Details
* **Sequence ID:** `dbc24b3a-a878-4c1f-9712-47c20febbdc8`
* **Tenant Organization ID:** `4033e7d7-7238-48b5-b8be-109f2ddceeb8`
* **Sequence Name:** *"Nurture a new insurance lead over a week toward booking a ca"*
* **Status:** `isActive = true` (Live & ready for enrollments)
* **Created At:** September 19, 2026

### Configured Steps in Database
```json
[
  {
    "id": "4a0e1434-6372-4ba7-8eda-176ad42da94c",
    "sequenceId": "dbc24b3a-a878-4c1f-9712-47c20febbdc8",
    "stepIndex": 0,
    "dayOffset": 0,
    "channel": "whatsapp",
    "body": "m",
    "attachmentUrl": null,
    "attachmentName": null
  }
]
```

### Live Funnel State
* **Total Lifespan:** `0 days` ($\max(\text{dayOffset}) = 0$)
* **Total Steps:** `1 step`
* **Active Enrollments:** `0 in sequence`
* **Completed Enrollments:** `0 completed`
* **Removed Early:** `0 removed`

---

## 3. Page Structure & Header Blueprint

When navigating to `/sequences/[id]`, the page controller executes [getSequenceDetailAction](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/sequences.ts), calculating header metrics and rendering the visual flow:

```
+====================================================================================+
| [<- Back]  Nurture a new insurance lead over a week...     [Active]  [Pencil Edit] |
| 1 step over 0 days                                                                 |
+====================================================================================+
```

### 1. Navigation & Actions
* **Back Button (`<ArrowLeft />`):** Seamless one-click return to the main Sequences hub (`/sequences`).
* **Sequence Title:** High-contrast typography displaying the full campaign name.
* **Duration & Step Summary:** Dynamically computes total lifespan in days:
  ```typescript
  const days = seq.steps.reduce((m, s) => Math.max(m, s.dayOffset), 0);
  // Displays: "X steps over Y days"
  ```
* **Status Badge:** Renders `Active` (primary solid badge) or `Inactive` (muted secondary badge).
* **Edit Action Button:** Direct deep-link to `/sequences/[id]/edit`, opening the visual builder to modify copy, adjust day offsets, or add steps.

---

## 4. Deep Dive: The `SequenceFlow` Visual Canvas

The core component of this page is [SequenceFlow.tsx](file:///Users/naveenadicharla/Documents/ridhzo/src/components/sequences/SequenceFlow.tsx), an interactive timeline visualizer:

```
┌────────────────────────────────────────────────────────┐
│ [UserPlus] New leads enter here                        │
│ Enrolled manually or by an automation     [ 28 active] │
└────────────────────────────────────────────────────────┘
                            │
              : (animated falling dots) :
                            │
┌────────────────────────────────────────────────────────┐
│ [1] [WhatsApp]  [Clock Day 0]                          │
│ "Hi {{first_name}}, thanks for reaching out! Here..."  │
│ [Paperclip Brochure]                     [ 12 people ] │
│ [=========================             ] 43% share     │
└────────────────────────────────────────────────────────┘
                            │
              : (animated falling dots) :
                            │
┌────────────────────────────────────────────────────────┐
│ [2] [Email]  [Clock Day 3]                             │
│ "Wanted to share our latest coverage comparison..."    │
│                                          [  9 people ] │
│ [===================                   ] 32% share     │
└────────────────────────────────────────────────────────┘
                            │
              : (animated falling dots) :
                            │
┌────────────────────────────────────────────────────────┐
│ [CheckCircle2] Finished the sequence                   │
│ 14 removed early (replied / converted)   [ 142 done ]  │
└────────────────────────────────────────────────────────┘
```

### A. The Entry Node (`UserPlus`)
* **Visual Anchor:** Clean rounded card with primary icon badge (`bg-primary/10 text-primary`).
* **Title & Guidance:** *"New leads enter here"* with subtext *"Enrolled manually or by an automation"*.
* **Live Counter:** Large tabular numeric indicator displaying total leads currently in the sequence (`funnel.active`).

### B. Animated Glowing Connector Rails (`seqflow-connector`)
* **Vertical Rail:** A 2px gradient rail linking steps (`linear-gradient(to bottom, hsl(var(--border)), hsl(var(--border) / .35))`).
* **Falling Glowing Dots:** CSS-animated glowing pulses (`seqflow-fall`) that fall smoothly top-to-bottom:
  ```css
  .seqflow-dot {
    position: absolute;
    left: -3px;
    width: 8px;
    height: 8px;
    border-radius: 9999px;
    background: hsl(var(--primary));
    box-shadow: 0 0 10px 1px hsl(var(--primary) / .8);
    animation: seqflow-fall 1.8s cubic-bezier(.5,0,.5,1) infinite;
  }
  ```
* **Traffic Flow Label:** If active leads are progressing between steps, a numerical indicator displays the flow count directly on the rail.
* **Accessibility:** Automatically honors `prefers-reduced-motion` media queries by freezing animations.

### C. Step Cards & Channel Styling
Each step card renders with theme-aware channel styling:

| Channel | Icon | Chip Styling | Border Highlight | Progress Bar Color |
| :--- | :--- | :--- | :--- | :--- |
| **WhatsApp** | `MessageSquare` | `bg-green-500/15 text-green-700 dark:text-green-400` | `border-green-500/40` | `bg-green-500` |
| **Email** | `Mail` | `bg-sky-500/15 text-sky-700 dark:text-sky-400` | `border-sky-500/40` | `bg-sky-500` |

* **Step Number Pill:** High-contrast circular badge (`1`, `2`, `3`...).
* **Day Offset Indicator:** Shows execution day (`Clock` icon with `day 0`, `day 2`, `day 5`).
* **Message Body Preview:** Truncated preview supporting line breaks and token interpolation (`{{first_name}}`, `{{name}}`).
* **Document Attachments:** Clickable pill (`Paperclip` icon) with attachment name linking directly to `attachmentUrl`.
* **Current Lead Counter:** Right-aligned counter showing exact number of clients currently sitting on this step (`clients: perStep.get(stepIndex)`).
* **Share Distribution Bar:** Dynamic percentage bar showing what proportion of active leads are waiting on this step:
  $$\text{share} = \text{round}\left(\frac{\text{clients}}{\max(\text{funnel.active}, 1)} \times 100\right)\%$$

### D. The Exit Node (`CheckCircle2`)
* **Visual Anchor:** Emerald celebratory node (`bg-green-500/12 text-green-600`).
* **Completion Counter:** Displays total leads who successfully received all scheduled steps (`funnel.completed`).
* **Early Removal Accounting:** Explicitly lists leads removed early (`funnel.removed`), representing leads who converted, replied, or were manually stopped before the sequence ended.

---

## 5. Backend Funnel Query Engine

The metrics driving this screen are calculated in [SequenceService.getDetail](file:///Users/naveenadicharla/Documents/ridhzo/src/domains/leads/sequenceService.ts):

### 1. Funnel Accounting Aggregation
```sql
SELECT status, count(*)::int AS n
FROM sequence_enrollments
WHERE sequence_id = :sequenceId
GROUP BY status;
```
Populates the funnel object:
* `active`: Leads currently in progress.
* `completed`: Leads that finished the final step.
* `stopped`: Leads stopped early due to replies or status updates.

### 2. Per-Step Client Density Aggregation
```sql
SELECT current_step, count(*)::int AS n
FROM sequence_enrollments
WHERE sequence_id = :sequenceId AND status = 'active'
GROUP BY current_step;
```
Maps the active lead count directly to each step's `stepIndex`, feeding both the *"X people here"* label and the proportional share progress bar.

---

## 6. How Leads Enter and Exit This View

### Inbound Paths (How Leads Enter)
1. **Automated Inbound Routing (`/automations`):**  
   The **Automations Engine** triggers the `enroll_in_sequence` action upon form submission or Meta Lead Ad capture, instantly injecting leads into Step 1.
2. **Manual Profile Enrollment (`/leads/[id]`):**  
   Sales reps click **"+ Add to Sequence"** on the customer dossier ([LeadSequencesCard](file:///Users/naveenadicharla/Documents/ridhzo/src/components/leads/LeadSequencesCard.tsx)) to enroll individual deals.

### Outbound Paths (How Leads Exit)
1. **Natural Completion:**  
   The lead receives the final scheduled step, and the background worker marks the enrollment as `status = 'completed'`.
2. **WhatsApp Reply Trigger:**  
   The customer sends an inbound WhatsApp message. The webhook listener executes `SequenceService.stopForLead(leadId, "lead replied on WhatsApp")`, immediately removing the lead from the active funnel and logging a timeline note.
3. **Email Reply Trigger:**  
   The prospect responds to a sequence email. The inbound email parser calls `SequenceService.stopForLead(leadId, "lead replied by email")`.
4. **Deal Conversion / Resolution:**  
   A sales rep marks the deal as `won`, `lost`, or `unqualified`. The event bus triggers auto-stop to prevent unwanted messaging to closed clients.
5. **Manual Rep Intervention:**  
   A rep clicks **"Stop"** directly on `/leads/[id]`.

---

## 7. Recommendations for Expanding Sequence `dbc24b3a...`

The current live sequence `dbc24b3a-a878-4c1f-9712-47c20febbdc8` currently contains only a single test step (`"m"`). To convert this into an enterprise-grade insurance drip campaign, the following 4-step sequence structure is recommended:

```
┌────────────────────────────────────────────────────────────────────────┐
│ RECOMMENDED PRODUCTION STRUCTURE FOR SEQUENCE dbc24b3a...              │
├─────────┬──────────┬──────────┬────────────────────────────────────────┤
│ Step    │ Timing   │ Channel  │ Content & Strategic Objective          │
├─────────┼──────────┼──────────┼────────────────────────────────────────┤
│ Step 1  │ Day 0    │ WhatsApp │ Instant Welcome & Policy Overview      │
│         │ (Imm.)   │          │ Attachment: 2026 Insurance Guide (PDF) │
├─────────┼──────────┼──────────┼────────────────────────────────────────┤
│ Step 2  │ Day 2    │ Email    │ Coverage Comparison & Customer Reviews │
│         │ (+2d)    │          │ Highlight: How Client A saved 25%      │
├─────────┼──────────┼──────────┼────────────────────────────────────────┤
│ Step 3  │ Day 5    │ WhatsApp │ Direct Consultation Call Invite        │
│         │ (+3d)    │          │ "Hi {{first_name}}, quick 10-min call?"│
├─────────┼──────────┼──────────┼────────────────────────────────────────┤
│ Step 4  │ Day 9    │ Email    │ Break-up Email & Resource Center Link  │
│         │ (+4d)    │          │ "Closing out your file — feel free to  │
│         │          │          │ reach out whenever you're ready."      │
└─────────┴──────────┴──────────┴────────────────────────────────────────┘
```

Revenue leaders can implement this upgrade by clicking **"Edit"** on `/sequences/dbc24b3a-a878-4c1f-9712-47c20febbdc8/edit` and using the AI Drip Drafter to populate the copy.

---

## 8. Marketing-Friendly Feature Explanation

### Why Revenue Leaders Rely on Ridhzo’s Sequence Flow Canvas

Setting up a multi-step drip campaign is only half the battle. If you can’t see where your prospective clients are, you have no idea whether your messaging is working or where deals are dropping off.

**Ridhzo’s Sequence Flow Canvas gives you total visibility into your automated revenue engine.**

* **Real-Time Visual Journey:** See your entire customer journey on a single dynamic canvas. Animated connector rails show active traffic moving step-by-step through your nurture process.
* **Spot Bottlenecks Instantly:** Identify exactly which steps hold the highest percentage of leads. If 60% of your prospects are waiting on Step 3, you know exactly where to optimize your messaging.
* **Full Attribution Transparency:** Track exactly how many leads completed the entire curriculum versus how many were removed early because they replied or converted into won customers.
* **Seamless Multi-Channel Harmony:** View WhatsApp messages and formal email follow-ups side-by-side with clear timing indicators and document attachments.

---

## 9. Feature List for Website Marketing

* **Live Interactive Funnel Canvas**  
  An animated visual timeline displaying step-by-step customer density, message copy, and conversion distribution.

* **Dynamic Traffic Share Indicators**  
  Visual progress bars showing the exact percentage of active enrolled leads currently positioned on each sequence step.

* **Three-State Funnel Accounting**  
  Comprehensive tracking distinguishing between active prospects, completed campaigns, and leads removed early due to replies or conversions.

* **Animated Connector Rails**  
  CSS-powered vertical glowing rails indicating live lead progression between multi-day touchpoints.

* **Multi-Channel Step Highlighting**  
  Distinct visual styling distinguishing green WhatsApp messages from sky-blue email communications.

* **Embedded Document Previews**  
  Displays attached product brochures, pricing sheets, and decks with clickable links directly on each step card.

* **Dynamic Duration Calculation**  
  Automatically computes and displays total campaign lifespan in days based on configured step timing offsets.

* **One-Click Campaign Editing**  
  Instant access to the sequence builder to adjust copy, add steps, or pause outbound messaging with zero downtime.

---

## 10. Technical Reference

### Routes & Page Controllers
* **Sequence Detail Route:** [`src/app/(dashboard)/sequences/[id]/page.tsx`](file:///Users/naveenadicharla/Documents/ridhzo/src/app/(dashboard)/sequences/[id]/page.tsx)
* **Sequence Edit Route:** [`src/app/(dashboard)/sequences/[id]/edit/page.tsx`](file:///Users/naveenadicharla/Documents/ridhzo/src/app/(dashboard)/sequences/[id]/edit/page.tsx)

### UI Components
* **Funnel Flow Canvas:** [SequenceFlow.tsx](file:///Users/naveenadicharla/Documents/ridhzo/src/components/sequences/SequenceFlow.tsx)
* **Lead Dossier Card:** [LeadSequencesCard.tsx](file:///Users/naveenadicharla/Documents/ridhzo/src/components/leads/LeadSequencesCard.tsx)

### Backend Services & Server Actions
* **Detail Aggregator:** `SequenceService.getDetail` in [`src/domains/leads/sequenceService.ts`](file:///Users/naveenadicharla/Documents/ridhzo/src/domains/leads/sequenceService.ts)
* **Server Action:** `getSequenceDetailAction` in [`src/lib/actions/sequences.ts`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/sequences.ts)
* **Auto-Stop Hook:** `SequenceService.stopForLead` in [`src/domains/leads/sequenceService.ts`](file:///Users/naveenadicharla/Documents/ridhzo/src/domains/leads/sequenceService.ts)

### Database Models (`src/db/schema/sequences.ts`)
* `sequences`: Stores sequence name, active status, and tenant organization ID.
* `sequenceSteps`: Stores ordered steps with `dayOffset`, `channel`, `body`, and attachments.
* `sequenceEnrollments`: Tracks individual lead runs with `currentStep`, `status`, and `nextRunAt`.
