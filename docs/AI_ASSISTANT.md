# Global AI Assistant & Copilot

## 1. Executive Summary & Architecture

The **Global AI Assistant** is an autonomous, context-aware sales copilot embedded across the entire Ridhzo CRM dashboard. Mounted once in the dashboard layout, it floats as an omnipresent widget in the bottom-right corner, intelligently tracking user navigation to offer zero-click, lead-specific sales intelligence.

The assistant is architected around a strict **Safety Boundary & Human-in-the-Loop Principle**:
- **Autonomous Over Reversible Reads & Internal State:** The agent can freely search leads, inspect full timelines, update lead statuses, add tags, assign owners, and create follow-up reminders.
- **Human Approval for Irreversible Outward Actions:** The agent **never auto-sends** WhatsApp messages or emails to prospects. Instead, outbound messaging tools emit an `AgentProposal` draft, rendering interactive "Send" and "Dismiss" cards directly in the chat feed for one-tap human dispatch.
- **Bounded Autonomous Loop:** Tool calling is capped at a maximum of 6 steps per turn (`stopWhen: stepCountIs(6)`) to prevent runaway costs, with a graceful fallback to conversational generation if the underlying LLM lacks tool support.

---

## 2. File & Component Map

| Purpose | File Path |
| :--- | :--- |
| **Floating Launcher & Drawer** | [`src/components/assistant/FloatingAssistant.tsx`](file:///Users/naveenadicharla/Documents/ridhzo/src/components/assistant/FloatingAssistant.tsx) |
| **Interactive Chat Interface** | [`src/components/assistant/AiAssistant.tsx`](file:///Users/naveenadicharla/Documents/ridhzo/src/components/assistant/AiAssistant.tsx) |
| **Server Action Dispatcher** | [`src/lib/actions/agent.ts`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/agent.ts) |
| **Autonomous Agent Engine & Tools** | [`src/lib/ai/agent.ts`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/ai/agent.ts) |
| **Conversation History & Flattening** | [`src/lib/ai/history.ts`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/ai/history.ts) |
| **Messaging Dispatch Actions** | [`src/lib/actions/messaging.ts`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/actions/messaging.ts) |
| **AI Client & Gateway Config** | [`src/lib/ai/client.ts`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/ai/client.ts) |
| **Business Context Injection** | [`src/lib/ai/leadBrief.ts`](file:///Users/naveenadicharla/Documents/ridhzo/src/lib/ai/leadBrief.ts) |

---

## 3. Client Interface & Context Awareness (`FloatingAssistant.tsx`)

### 3.1 Pinned Launcher & Modal Drawer
- **Omnipresent Trigger:** A circular floating action button (FAB) positioned at `bottom-6 right-6 z-50` with a sparkle icon (`Sparkles`).
- **Smooth Drawer Window:** Opens a `400px` wide, `600px` tall panel (`bottom-24 right-6`) with smooth entry transitions and responsive viewport constraints (`max-w-[calc(100vw-3rem)] max-h-[70vh]`).
- **Persistent State:** Saves open/closed preference in browser `localStorage` under `assistant-open`.

### 3.2 Dynamic Route & Lead Binding
The assistant continuously inspects the active browser pathname:
```typescript
const pathname = usePathname();
const currentLeadId = pathname?.match(
  /^\/leads\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i,
)?.[1];
```
- **Global Context:** When browsing pipelines, analytics, or settings, the assistant offers universal suggestions:
  - *"What should I focus on today?"*
  - *"Show hot leads that have gone cold"*
  - *"Which leads haven't been contacted in 7 days?"*
  - *"Draft a follow-up for my newest lead"*
- **Lead Dossier Context:** When viewing `/leads/[id]`, the assistant injects the lead's identity, phone, email, and score into the prompt, switching to contextual starter chips:
  - *"Draft a follow-up message for this lead"*
  - *"What's the next best action for this lead?"*
  - *"Summarize this lead's activity"*
  - *"Set a reminder to follow up in 3 days"*

---

## 4. Autonomous Agent Architecture & Tool Suite (`agent.ts`)

The agent is powered by Vercel AI SDK tool calling (`generateText` with `tool`) against the tenant's AI Gateway configuration (`AI_MODEL` / `AI_AGENT_MODEL`).

### 4.1 Server-Enforced Tenant Isolation
All tool execution functions derive `organizationId` and `userId` directly from the authenticated session via `requireOrg()`. The model never controls tenant routing; foreign lead IDs are rejected server-side.

### 4.2 Available Tool Capabilities

| Tool Name | Type | Description |
| :--- | :--- | :--- |
| `find_leads` | Read | Queries leads by free-text search (name, email, phone, company) or status filter (`new`, `active`, `won`, `lost`). Returns name, status, owner, phone, email. |
| `get_lead` | Read | Fetches complete dossier for a specific UUID along with the 15 most recent activity timeline events (notes, calls, WhatsApp dispatches, status changes). |
| `change_lead_status` | Write (Reversible) | Updates the pipeline status (e.g., `contacted`, `qualified`, `won`, `lost`) and logs an audit activity with the reason. |
| `add_tag` | Write (Reversible) | Applies a categorical tag to the lead for filtering and smart segmentation. |
| `set_reminder` | Write (Reversible) | Schedules a follow-up task with a target ISO datetime and optional description. |
| `assign_lead` | Write (Reversible) | Reassigns the lead to a specific team member by owner UUID. |
| `propose_message` | **Proposal (Gate)** | Queues an outbound WhatsApp or Email message for human review. **Does not send directly.** |

### 4.3 Human-in-the-Loop Message Approval
When the agent executes `propose_message`, it returns an `AgentProposal`:
```typescript
export interface AgentProposal {
  kind: "message";
  leadId: string;
  leadName: string | null;
  channel: "whatsapp" | "email";
  body: string;
}
```
The UI renders a dedicated card containing:
1. Channel badge (`WhatsApp` in emerald, `Email` in sky).
2. Lead recipient name.
3. Draft message text body.
4. Action buttons:
   - **Send / Approve (`Check`):** Invokes `sendWhatsAppAction` or `sendEmailAction` directly from the user's account.
   - **Dismiss (`X`):** Clears the proposal without sending.

---

## 5. Conversation History & Multi-Session Storage

1. **User-Scoped Local Storage:** Conversations are saved under `assistant-conversations:<userId>` up to a limit of 50 conversations. Switching users on the same machine never leaks another rep's chat drafts or customer data.
2. **Context Pinning:** If a conversation was initiated on a specific lead page, the `leadId` is locked to that conversation object. Reopening that conversation days later continues to reference the original lead, regardless of which page the rep is currently viewing.
3. **History Optimization:** Prior turns are flattened and capped at 20 turns (`capHistory()`). The **first turn is permanently preserved** so that overarching instructions (e.g., *"keep messages formal"*) remain active throughout long sessions.
4. **Re-Entrancy Guard:** A synchronous `sendingRef` lock prevents fast double-Enter keystrokes from dispatching duplicate server actions.

---

## 6. Resilience & Graceful Degradation

If the primary AI model does not support tool calling or if the tool-execution loop fails:
```typescript
catch (e) {
  console.error("[agent] tool loop failed — falling back to a plain answer", e);
  const plain = await simpleGenerate(
    `${businessPreamble(org)}\n\nYou are a concise sales assistant in a WhatsApp-first lead CRM. Answer briefly and helpfully. (Live lead lookups are unavailable right now.)${leadContext}`,
    message,
  );
  return { text: plain ?? "...", proposals, steps: 0, enabled: true };
}
```
The assistant automatically falls back to a standard conversational generation, ensuring the rep receives a grounded answer rather than an application crash.
