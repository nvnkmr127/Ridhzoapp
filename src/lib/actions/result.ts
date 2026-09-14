import type { ZodError } from "zod";
import { logError } from "@/lib/log";

// Shared result contract for server actions.
//
// Actions must RETURN these for expected/handled failures rather than `throw`ing a
// user-facing message: Next.js redacts thrown Server Action error messages in
// production, so `throw new Error("Name is required")` reaches the client as a
// generic masked string + digest. Returning a result keeps the message intact and
// carries field-level errors for inline form display.

export type ActionErrorCode =
  | "VALIDATION"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "LIMIT"
  | "RATE_LIMIT"
  | "SERVER";

export type ActionError = {
  ok: false;
  code: ActionErrorCode;
  message: string;
  fieldErrors?: Record<string, string>;
};

export type ActionResult<T> = { ok: true; data: T } | ActionError;

export function ok<T>(data: T): { ok: true; data: T } {
  return { ok: true, data };
}

export function fail(
  code: ActionErrorCode,
  message: string,
  fieldErrors?: Record<string, string>,
): ActionError {
  return { ok: false, code, message, fieldErrors };
}

// First message per field, keyed by dotted path — ready for react-hook-form setError.
export function zodFieldErrors(err: ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = issue.path.join(".") || "_";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

// Map a thrown error into an ActionError. Keeps intentional service-thrown messages
// (duplicate, plan limit, not found, forbidden) intact and genericizes everything else
// so internal/DB text never reaches the client. Re-throws Next's control-flow errors
// (redirect / notFound) — those must NOT be swallowed.
export function actionFail(e: unknown): ActionError {
  const digest = (e as { digest?: unknown })?.digest;
  if (typeof digest === "string" && (digest.startsWith("NEXT_REDIRECT") || digest === "NEXT_NOT_FOUND")) {
    throw e;
  }
  const fieldErrors = (e as { fieldErrors?: Record<string, string> })?.fieldErrors;
  const raw = e instanceof Error ? e.message : "";
  const m = raw.toLowerCase();
  if (m.includes("forbidden")) return fail("FORBIDDEN", "You don't have permission to do this. Contact an admin.", fieldErrors);
  // Intentional guard messages that should reach the user verbatim as validation errors.
  if (m.includes("last active administrator") || m.includes("reserved role name")) return fail("VALIDATION", raw, fieldErrors);
  if (m.includes("duplicate") || m.includes("already exists")) return fail("CONFLICT", raw, fieldErrors);
  if (m.includes("limit") || m.includes("plan")) return fail("LIMIT", raw, fieldErrors);
  if (m.includes("not found")) return fail("NOT_FOUND", raw, fieldErrors);
  if (m.includes("required") || m.includes("must be") || m.includes("invalid")) return fail("VALIDATION", raw, fieldErrors);
  // Unexpected failure: log it server-side with a ref the user can quote to support.
  const ref = logError("action", e);
  return fail("SERVER", `Something went wrong on our end. Please try again. (Ref: ${ref})`, fieldErrors);
}
