// Boot-time environment validation. Called once from instrumentation.register() so a
// misconfigured deployment fails fast with a clear message instead of surfacing a cryptic
// runtime crash at the first DB query or JWT sign.
//
// REQUIRED = the app cannot function without it. OPTIONAL feature vars only disable the
// feature that uses them (billing, WhatsApp, AI, push, Google, email) — we warn, never crash.

const REQUIRED = ["DATABASE_URL", "NEXTAUTH_SECRET"] as const;

// Feature vars grouped by the capability they unlock. Missing = that feature is off.
const OPTIONAL_FEATURES: Record<string, string[]> = {
  "Redis (rate limiting + background jobs)": ["REDIS_URL"],
  "Billing (Razorpay)": ["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET"],
  "WhatsApp (Watxio)": ["WATXIO_API_KEY", "WATXIO_BASE_URL", "WATXIO_PHONE_NUMBER_ID"],
  "AI (Vercel AI Gateway)": ["AI_GATEWAY_API_KEY"],
  "Web push": ["NEXT_PUBLIC_VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY"],
  "Mobile push (Firebase/FCM)": ["FIREBASE_PROJECT_ID", "FIREBASE_CLIENT_EMAIL", "FIREBASE_PRIVATE_KEY"],
  "Google Calendar": ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
  "Facebook Lead Ads": ["FACEBOOK_APP_ID", "FACEBOOK_APP_SECRET"],
  "Email (Resend)": ["RESEND_API_KEY"],
  // Note: lead enrichment and inbound email are configured PER TENANT in the app
  // (Settings → Lead Intelligence), not via env — see tenantIntegrationsService.
};

let validated = false;

export function validateEnv(): void {
  if (validated) return;
  validated = true;

  const missing = REQUIRED.filter((k) => !process.env[k]?.trim());
  if (missing.length) {
    // Fail fast and loud — do not print the values, only the names.
    throw new Error(
      `Missing required environment variable(s): ${missing.join(", ")}. ` +
        `Set them before starting the server (see .env.example).`,
    );
  }

  warnInsecureTransport();
  if (process.env.NODE_ENV === "production" && process.env.NEXTAUTH_URL && !/^https:\/\//i.test(process.env.NEXTAUTH_URL)) {
    console.error("[env] SECURITY: NEXTAUTH_URL is not https:// — session cookies won't be marked Secure and OAuth callbacks may break.");
  }
  if (process.env.AI_GATEWAY_API_KEY && !process.env.AI_AGENT_MODEL?.trim()) {
    console.warn("[env] AI_AGENT_MODEL is not set — the assistant's tool-calling falls back to AI_MODEL / a built-in default. Pick a tool-capable model, and confirm the AI Gateway's data-retention / DPA terms: lead names, notes and messages are sent to it.");
  }
  if (process.env.NODE_ENV === "production" && !process.env.EMAIL_SECRET_KEY?.trim()) {
    console.error("[env] SECURITY: EMAIL_SECRET_KEY is not set — stored secrets (SMTP, Meta tokens, webhook secrets) are encrypted with NEXTAUTH_SECRET, so rotating the session secret would destroy them. Set a separate EMAIL_SECRET_KEY.");
  }

  for (const [feature, keys] of Object.entries(OPTIONAL_FEATURES)) {
    // FCM is also satisfied by a single FIREBASE_SERVICE_ACCOUNT JSON (see fcm.ts) — don't warn then.
    if (feature.startsWith("Mobile push") && process.env.FIREBASE_SERVICE_ACCOUNT?.trim()) continue;
    const absent = keys.filter((k) => !process.env[k]?.trim());
    if (absent.length) {
      console.warn(`[env] ${feature} disabled — missing: ${absent.join(", ")}`);
    }
  }
}

// Production traffic to a REMOTE database/queue must be encrypted. Warn loudly (not crash — a warning is
// recoverable, a boot loop is an outage) when a non-local DATABASE_URL disables TLS or REDIS_URL is plain redis://.
function warnInsecureTransport(): void {
  if (process.env.NODE_ENV !== "production") return;
  const local = (u: string) => /@?(localhost|127\.0\.0\.1|\[::1\]|postgres|redis|[\w.-]+\.internal)(:|\/|$)/.test(u.replace(/^[a-z]+:\/\//, "").replace(/^[^@]*@/, ""));
  const db = process.env.DATABASE_URL ?? "";
  if (db && !local(db) && /[?&]sslmode=disable/.test(db)) console.error("[env] SECURITY: DATABASE_URL points at a remote host with sslmode=disable — database traffic is unencrypted.");
  const redis = process.env.REDIS_URL ?? "";
  if (redis.startsWith("redis://") && !local(redis)) console.error("[env] SECURITY: REDIS_URL is plain redis:// to a remote host — use rediss:// (TLS) or a private network.");
}
