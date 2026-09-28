# Automations (WHEN → IF → THEN)

## What it is
Automations do the repetitive work for your team, 24/7. You build a rule in plain language: **WHEN** something happens, **IF** conditions match, **THEN** do one or more actions. No coding.

## Triggers (WHEN)
| Trigger | Fires when |
|---|---|
| Lead created | A new lead arrives from any source (ads, forms, API, import, manual, missed calls) |
| Lead assigned | A lead's owner changes |
| Lead status changed | Status is updated (you can target a specific status) |
| Stage changed | Lead moves on the pipeline board |
| Tag added | A tag is added to a lead |
| Call logged (`call.logged`) | An incoming, outgoing, or missed call is recorded or synced from an Android phone |
| Follow-up scheduled | A follow-up is created |
| Follow-up completed | A follow-up is marked done (manually or auto-completed via call) |
| Follow-up overdue | A follow-up passes its due time |
| Task completed | A task is finished |

## Conditions (IF)
Match on any lead field — source, status, owner, tags, city, budget, any custom field — using equals, contains, is empty, greater than, before/after, etc. Combine with **AND / OR**.

## Actions (THEN)
| Action | What it does |
|---|---|
| Assign lead | Assign to a specific person |
| Round-robin (capacity-aware) | Assign to the rep with the most free capacity |
| Change status | Update the lead's status |
| Schedule follow-up | Create a follow-up X days later |
| Create task | Create an internal task X hours later |
| Add note | Write a note on the timeline |
| Send WhatsApp | Send a WhatsApp template (Business API mode) |
| Enroll in sequence | Start a multi-step drip sequence |

One automation can run several actions in order.

## Ready-made templates
Start from proven recipes instead of a blank screen, for example:
- **Speed-to-lead:** New Facebook lead → round-robin assign → send WhatsApp welcome → follow-up in 1 hour.
- **Missed Call Recovery:** Call logged (missed) → send instant WhatsApp "Sorry we missed your call" → schedule high-priority callback task.
- **High-value escalation:** New lead with budget > X → assign to senior rep → add note "VIP".
- **Nurture on status:** Status = "Interested" → enroll in "7-day nurture" sequence.
- **Overdue rescue:** Follow-up overdue → reassign or create task for the manager.

## Safety & reliability
- **Serverless Resilience:** Background execution queues and job handlers survive serverless cold starts and restarts without dropping events.
- **Idempotency & Loop protection:** Each automation step is strictly idempotent and prevents endless cascading loops.
- **Live UI Refresh:** Web and mobile sessions reflect state updates in real time as automations execute.
- **Partial failure tolerance:** If one action fails, the others still run and the failure is logged.
- **Pause / resume:** Any automation can be toggled on/off instantly with a switch.

## Real use cases
- **Call-driven follow-up:** Rep finishes an answered call synced via Android → automation moves status to "Contacted" and schedules a nurture task.
- **Real-estate developer:** Leads from "Project A" form go to the Project A team; leads from "Project B" go to Project B; all get a WhatsApp brochure instantly.
- **Coaching institute:** When a lead is tagged "Demo attended", status changes to "Hot" and a fee-reminder sequence starts.
- **Insurance advisor (solo):** Every new lead automatically gets a follow-up for tomorrow 10 AM, so none are forgotten.

## Plan limits
Free: 2 automations · Starter: 15 · Unlimited: unlimited. On downgrade, the oldest automations keep running; extra ones pause.

## Why it matters
- Every lead gets the same fast, professional treatment — even at night or on holidays.
- Saves each rep hours per week of manual assigning, tagging and scheduling.
- Your best sales process runs automatically, not just when your best rep remembers.
