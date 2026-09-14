// Pure conversation-history helpers shared by the assistant UI (building the history it sends) and
// the agent action (capping it). No react, no server-only — so it is unit-testable in isolation.

export type ChatRole = "user" | "assistant";
export interface ChatMessage {
  role: ChatRole;
  content: string;
}
export interface DraftLike {
  channel: string;
  leadName: string | null;
  body: string;
}

/**
 * Flatten one turn into the {role, content} the model sees. Drafted message bodies live in a turn's
 * `proposals`, NOT in its text — so they are folded into the content here. Without this, a follow-up
 * such as "make it shorter" reaches the model with no copy of the draft it just wrote.
 */
export function flattenTurn(role: ChatRole, content: string, proposals: DraftLike[] = []): ChatMessage {
  if (role === "assistant" && proposals.length) {
    const drafts = proposals.map((p) => `\n\n[Draft ${p.channel} → ${p.leadName ?? "lead"}]:\n${p.body}`).join("");
    return { role, content: `${content}${drafts}` };
  }
  return { role, content };
}

/**
 * Keep the first turn plus the most recent (max-1) turns. The pinned head preserves early constraints
 * ("audience is investors", "keep it formal") that set the tone for the whole thread and would
 * otherwise fall out of a plain tail window in a long conversation.
 */
export function capHistory<T>(history: T[], max: number): T[] {
  if (max <= 0) return [];
  if (history.length <= max) return history;
  if (max === 1) return [history[0]];
  return [history[0], ...history.slice(history.length - (max - 1))];
}
