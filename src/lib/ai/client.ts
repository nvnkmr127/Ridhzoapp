import "server-only";
import { generateText as gatewayGenerate } from "ai";

// AI is optional infrastructure, like the mailer: real generation needs AI_GATEWAY_API_KEY
// (Vercel AI Gateway), otherwise callers fall back gracefully. Never throws for a missing key.
export const AI_TIMEOUT_MS = 30_000;

export function aiEnabled(): boolean {
  const key = process.env.AI_GATEWAY_API_KEY?.trim();
  return Boolean(key && !key.includes("REPLACE_") && !key.includes("your-key") && key.length > 10);
}

/**
 * Generates text from a system + user prompt via the Vercel AI Gateway. A bare
 * "provider/model" string is auto-routed through the gateway using AI_GATEWAY_API_KEY.
 * Defaults to a $0 "-free" gateway model; override with AI_MODEL. Returns null when AI is
 * unavailable (no key) or on error, so callers can fall back rather than break the flow.
 */
export async function generateText(system: string, prompt: string, maxTokens = 1000): Promise<string | null> {
  if (!aiEnabled()) return null;
  try {
    const { text } = await gatewayGenerate({
      model: process.env.AI_MODEL || "inclusionai/ling-3.1-flash",
      system,
      prompt,
      maxOutputTokens: maxTokens,
      abortSignal: AbortSignal.timeout(AI_TIMEOUT_MS), // a stuck gateway can't hold a request (and a credit) open
    });
    return text.trim() || null;
  } catch (e) {
    console.error("[ai] generateText failed", e);
    return null;
  }
}
