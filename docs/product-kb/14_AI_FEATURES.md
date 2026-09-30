# AI Features

Ridhzo uses AI to eliminate the repetitive friction that slows sales teams down: reading conversation history, typing manual notes, updating CRM fields, and crafting messages. **AI never sends a message to a customer without human approval — reps always retain full control.**

## Unified Lead-Context Engine & Business Profile
All Ridhzo AI features are powered by a single, comprehensive lead-context engine (`leadContext`). Before suggesting or drafting anything, the engine reads:
- **AI Business Profile Context:** Your organization's business description, products/services, target audience, pricing points, and brand tone guidelines.
- Custom statuses, status stage progression, and complete status history.
- Every custom field key and current value (ignoring placeholder values like "N/A" or "TBD").
- Original form submissions and questionnaire answers.
- The complete activity timeline: calls, notes, audio transcripts, emails, and WhatsApp chats.

## 1. 1-Click AI Suggestions & Insights Popover
Instead of forcing reps to manually type updates after every call or conversation, Ridhzo provides actionable suggestions with a single **"Apply"** button:
- **Lead Insights Chip & Popover:** A compact header badge displaying lead intent, budget, sentiment, and AI score, opening a contextual popover for immediate deal comprehension.
- **1-Click Field Auto-fill:** Scans recent calls and conversation notes to detect missing data (e.g. Budget: ₹60 Lakhs, Preferred Location: Hitech City, Timeline: Immediate) and pre-populates fields for 1-click saving.
- **1-Click Status Transitions:** Recommends advancing the lead to the next logical stage (e.g. *New → Contacted* or *Contacted → Qualified*) once conversation milestones are reached.
- **Next Step Recommendations:** Suggests the immediate operational follow-up (e.g., "Schedule site visit for Saturday", "Send brochure via WhatsApp") with 1-click scheduling.

## 2. Pre-Call Brief Generator
Before dialing any lead, reps can click **Pre-Call Brief** on the lead profile:
- Synthesizes the lead's timeline, stated budget, requirements, and prior objections into an executive briefing card.
- Recommends tailored opening lines and key talking tracks based on the lead's current status and your business profile.
- Saves reps from scrolling through dozens of past activities and notes before placing a call.

## 3. Live Next Best Action (NBA)
A real-time recommendation banner on the lead profile that streams the optimal next move for each lead without requiring full-page reloads. Reps know at a glance whether to call, send a specific template, or escalate.

## 4. Status Playbooks
Dynamic stage-specific guidance for sales reps:
- Provides essential qualification questions to ask during the current status stage.
- Common objection-handling scripts tailored to that phase of the conversation.
- Clear milestone exit criteria required to move the deal forward.

## 5. AI Assistant (Copilot)
A conversational assistant available from any screen (floating button) and on its own page (**Assistant**). It understands the exact lead you are viewing.

Ask in plain language, for example:
- "Show me today's new leads from Facebook."
- "What's the status of Ramesh Kumar?"
- "Move Priya to Site Visit Booked and remind me to call her Friday at 5 PM."
- "Assign all of Anil's untouched leads to Sneha."
- "Book a site visit with Asha tomorrow 11 AM at Green Acres."
- "Draft a WhatsApp to Rahul about the price revision."

What it can do:
| Capability | Notes |
|---|---|
| Search leads | By CRN, displayId, name, phone, email, company, or recent |
| Read full lead details & timeline | Powered by unified lead context |
| Change status | Reversible |
| Add tags | Reversible |
| Set follow-up reminders | |
| Assign / reassign leads | |
| Schedule meetings | Online (incl. Google Meet link), site visit, store visit, in person — confirmation is queued as a draft with local timezone formatting |
| Draft messages | Queued for **your approval** — never auto-sent |

Conversations are saved so you can continue later. The assistant only ever sees your own workspace's data.

## 6. AI Reply Drafts & Auto-Tone Selection
On any lead, click **Draft with AI** to write the next WhatsApp or email:
- Deeply contextual: uses the lead's form answers, custom fields, and prior call notes.
- **Auto-Tone Selection:** Automatically detects conversation momentum and recommends an optimal tone (friendly, consultative, urgent, professional, or short).
- **Language:** auto-matches the lead, or choose any language (Hindi, Hinglish, Telugu, Tamil, etc.).
- Ends with a clear call-to-action; never invents prices, offers or dates.

## 7. AI Lead Summary
One click produces a concise executive brief: who the lead is, their requirements, conversation history, and current status. Ideal before dialing a call or during lead handovers.

## 8. AI Sequence Generator
Describe a goal; AI drafts a complete multi-step WhatsApp/email follow-up sequence with timing. See [Sequences](13_SEQUENCES.md).

## 9. Mobile App AI Parity
The Ridhzo mobile app connects directly to the AI suggestions endpoint (`/api/mobile/leads/[id]/ai-suggestions`), letting reps in the field review AI recommendations, apply field updates, and transition statuses with one tap on their smartphone.

## 10. AI Auto-tagging (paid plans)
Incoming replies are automatically classified by intent (interested, price query, not interested, callback request) so teams can prioritize immediate revenue opportunities.

## Smart intelligence — included free
- **Lead score** visible in lead tables and profile.
- **Best time to contact** based on engagement history.
- **Going Cold** alerts and **4-step re-engagement plan**.

## AI credits & model architecture
Powered by high-throughput modern LLMs with fast inference.

| Plan | AI credits / month |
|---|---|
| Free | 15 |
| Starter | 300 |
| Unlimited | 2,000 |

1 credit = 1 generation via `consumeAiCredit` (draft, summary, pre-call brief, assistant turn, sequence, or 1-click field extraction). Credits reset monthly. If an AI call fails, encounters a network timeout, or generates an invalid response, the credit is refunded automatically and a graceful fallback is provided.

## Why it matters
- Eliminates manual typing and note-taking after customer interactions.
- Guides junior reps with proven stage playbooks and next-best actions.
- Empowers reps to reply in seconds in the customer's native language.
- Human-in-the-loop design ensures brand safety and accuracy.
