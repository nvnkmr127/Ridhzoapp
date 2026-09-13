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
  "AI drafting (Anthropic)": ["ANTHROPIC_API_KEY"],
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

  for (const [feature, keys] of Object.entries(OPTIONAL_FEATURES)) {
    // FCM is also satisfied by a single FIREBASE_SERVICE_ACCOUNT JSON (see fcm.ts) — don't warn then.
    if (feature.startsWith("Mobile push") && process.env.FIREBASE_SERVICE_ACCOUNT?.trim()) continue;
    const absent = keys.filter((k) => !process.env[k]?.trim());
    if (absent.length) {
      console.warn(`[env] ${feature} disabled — missing: ${absent.join(", ")}`);
    }
  }
}
