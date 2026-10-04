/**
 * Compose jumps that survive a page load.
 *
 * The in-page `leadEvents` bus is the fast path when you're already on the lead. But a draft can
 * start anywhere — the assistant, a notification, mobile — so it needs a URL too: a link lands on
 * the right tab with the text in the box whether the page has rendered yet or not.
 */
export type ComposeChannel = "whatsapp" | "email";

export function composeHref(leadId: string, channel: ComposeChannel, text?: string): string {
  const params = new URLSearchParams({ compose: channel });
  if (text) params.set("text", text);
  return `/leads/${leadId}?${params.toString()}`;
}

/** The `?compose=` values we accept. Anything else is a typo, not an instruction, and is ignored. */
export function parseCompose(raw: string | null): ComposeChannel | null {
  return raw === "whatsapp" || raw === "email" ? raw : null;
}