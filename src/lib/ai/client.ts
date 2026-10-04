import "server-only";
import { generateObject as gatewayGenerateObject, generateText as gatewayGenerate } from "ai";
import type { z } from "zod";

// AI is optional infrastructure, like the mailer: real generation needs AI_GATEWAY_API_KEY
// (Vercel AI Gateway), otherwise callers fall back gracefully. Never throws for a missing key.
export const AI_TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS) || 45_000;

export function aiEnabled(): boolean {
  const key = process.env.AI_GATEWAY_API_KEY?.trim();
  return Boolean(key && !key.includes("REPLACE_") && !key.includes("your-key") && key.length > 10);
}

/**
 * Sampling temperature, per kind of job. Left unset the gateway applies its provider default,
 * which is usually ~1.0 — far too loose for the structured work this app does.
 */
export const AI_TEMPERATURE = {
  /** Picking one label out of a fixed set. There is a right answer; sample narrowly. */
  classify: 0,
  /** Pulling facts out of a conversation into named fields, or choosing which action to propose. */
  extract: 0.2,
  /** Tightening text the user supplied. */
  edit: 0.4,
  /** Writing a message a person will read. Some variety is the point. */
  write: 0.7,
} as const;

/** Overridable for anyone who needs to pin a model without changing code. */
export function aiModel(): string {
  return process.env.AI_MODEL || "inclusionai/ling-3.1-flash";
}

/**
 * Generates text from a system + user prompt via the Vercel AI Gateway. A bare
 * "provider/model" string is auto-routed through the gateway using AI_GATEWAY_API_KEY.
 * Defaults to a $0 "-free" gateway model; override with AI_MODEL. Returns null when AI is
 * unavailable (no key) or on error, so callers can fall back rather than break the flow.
 *
 * `temperature` defaults to the extraction setting on purpose: in a CRM a slightly dull message
 * costs far less than a hallucinated field, so the safe direction is the default and the writing
 * call sites opt up to AI_TEMPERATURE.write explicitly.
 */
export async function generateText(
  system: string,
  prompt: string,
  maxTokens = 1000,
  temperature: number = AI_TEMPERATURE.extract,
): Promise<string | null> {
  if (!aiEnabled()) return null;
  try {
    const { text } = await gatewayGenerate({
      model: aiModel(),
      system,
      prompt,
      maxOutputTokens: maxTokens,
      temperature,
      maxRetries: 1,
      abortSignal: AbortSignal.timeout(AI_TIMEOUT_MS),
    });
    return text.trim() || null;
  } catch (e: any) {
    if (e?.name === "AbortError" || e?.name === "TimeoutError") {
      console.warn(`[ai] generateText timed out after ${AI_TIMEOUT_MS}ms`);
    } else {
      console.error("[ai] generateText failed", e);
    }
    return null;
  }
}

/**
 * Generates an object that already matches `schema`, via the same gateway.
 *
 * This is the structured path: the SDK constrains generation to the schema and retries on its own
 * when the model's output doesn't validate, which is strictly better than asking for JSON in the
 * prompt and extracting it with a regex. It is not a replacement for validating against the
 * workspace's own definitions — a schema can't know which custom fields this tenant defined — so
 * callers still run the result through their own validator.
 *
 * Returns null when AI is unavailable, times out, or the model can't be made to satisfy the
 * schema, so callers can fall back to plain text rather than break.
 */
export async function generateObject<SCHEMA extends z.ZodType>(opts: {
  schema: SCHEMA;
  system: string;
  prompt: string;
  /** Some providers use these to steer the model; harmless elsewhere. */
  schemaName?: string;
  schemaDescription?: string;
  maxTokens?: number;
  temperature?: number;
}): Promise<z.infer<SCHEMA> | null> {
  if (!aiEnabled()) return null;
  try {
    const { object } = await gatewayGenerateObject({
      model: aiModel(),
      schema: opts.schema,
      schemaName: opts.schemaName,
      schemaDescription: opts.schemaDescription,
      system: opts.system,
      prompt: opts.prompt,
      maxOutputTokens: opts.maxTokens ?? 1500,
      temperature: opts.temperature ?? AI_TEMPERATURE.extract,
      maxRetries: 2,
      abortSignal: AbortSignal.timeout(AI_TIMEOUT_MS),
    });
    // The SDK infers its return as a conditional on InferSchema<SCHEMA>, which TypeScript can't
    // reduce while SCHEMA is still a bare `z.ZodType`. The cast is safe rather than a shortcut:
    // the SDK has already validated `object` against `schema` by the time it gets here.
    return object as z.infer<SCHEMA>;
  } catch (e: any) {
    if (e?.name === "AbortError" || e?.name === "TimeoutError") {
      console.warn(`[ai] generateObject timed out after ${AI_TIMEOUT_MS}ms`);
    } else {
      console.error("[ai] generateObject failed", e);
    }
    return null;
  }
}