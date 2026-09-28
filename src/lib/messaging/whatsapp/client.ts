// Watxio (WhatsApp Business API BSP) client — official docs: https://flow.watxio.com/developer/docs
// Base endpoint: https://flow.watxio.com/api/v1
// Messages endpoint: POST /messages

export interface SendResult {
  providerMessageId: string;
  status: "sent" | "queued";
}

interface WatxioConfig {
  baseUrl: string;
  apiKey: string;
  phoneNumberId?: string;
  tenantId?: string;
}

// Normalize base URL to ensure it ends in /api/v1
function normalizeBaseUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, "");
  if (trimmed.endsWith("/api/v1")) return trimmed;
  if (trimmed.endsWith("/api")) return `${trimmed}/v1`;
  return `${trimmed}/api/v1`;
}

// True when the WhatsApp Business API (Watxio BSP) env is set.
export function isConfigured(): boolean {
  return Boolean(process.env.WATXIO_BASE_URL?.trim() && process.env.WATXIO_API_KEY?.trim());
}

function config(): WatxioConfig {
  const baseUrl = process.env.WATXIO_BASE_URL?.trim();
  const rawApiKey = process.env.WATXIO_API_KEY?.trim();
  if (!baseUrl || !rawApiKey) {
    throw new Error("Watxio not configured: set WATXIO_BASE_URL and WATXIO_API_KEY");
  }
  // Strip accidental enclosing quotes from .env definitions
  const apiKey = rawApiKey.replace(/^["']|["']$/g, "").trim();

  return {
    baseUrl: normalizeBaseUrl(baseUrl),
    apiKey,
    phoneNumberId: process.env.WATXIO_PHONE_NUMBER_ID?.trim(),
    tenantId: process.env.WATXIO_TENANT_ID?.trim(),
  };
}

// idempotencyKey → X-Idempotency-Key: a retried send with the same key isn't delivered twice.
async function post(path: string, body: unknown, idempotencyKey?: string): Promise<any> {
  const { baseUrl, apiKey, tenantId } = config();
  const url = `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(tenantId ? { "X-Tenant-ID": tenantId } : {}),
      ...(idempotencyKey ? { "X-Idempotency-Key": idempotencyKey } : {}),
    },
    body: JSON.stringify(body),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) {
      throw new Error(`Watxio 401 (Unauthenticated): check WATXIO_API_KEY token validity or expiration. ${JSON.stringify(json)}`);
    }
    throw new Error(`Watxio ${res.status}: ${JSON.stringify(json)}`);
  }
  return json;
}

// Formats phone number with leading '+' for Watxio API
function toRecipient(phone: string): string {
  const clean = phone.trim();
  if (clean.startsWith("+")) return clean;
  return `+${clean.replace(/^0+/, "")}`;
}

// Picks the message identifier from Watxio's response (supports data.message_id, message_id, messages[0].id, etc.)
function pickResult(json: any): SendResult {
  const id =
    json?.data?.message_id ??
    json?.message_id ??
    json?.data?.id ??
    json?.messages?.[0]?.id ??
    json?.id ??
    json?.messageId ??
    (json?.success ? String(Date.now()) : undefined);

  if (!id) throw new Error(`Watxio: no message id in response ${JSON.stringify(json)}`);
  // Watxio answers 202 { status: "queued", message_id }; delivery receipts advance it later.
  const status = (json?.status ?? json?.data?.status) === "queued" ? "queued" : "sent";
  return { providerMessageId: String(id), status };
}

export const WatxioClient = {
  // Standard text message: POST /messages
  async sendText(phone: string, body: string, idempotencyKey?: string): Promise<SendResult> {
    const json = await post("/messages", {
      to: toRecipient(phone),
      type: "text",
      text: { body },
    }, idempotencyKey);
    return pickResult(json);
  },

  // Approved template (HSM): POST /messages
  async sendTemplate(
    phone: string,
    templateName: string,
    variables: string[] = [],
    languageCode = "en_US",
    idempotencyKey?: string,
  ): Promise<SendResult> {
    const json = await post("/messages", {
      to: toRecipient(phone),
      type: "template",
      template: {
        name: templateName,
        language: { code: languageCode },
        components: variables.length
          ? [{ type: "body", parameters: variables.map((v) => ({ type: "text", text: v })) }]
          : [],
      },
    }, idempotencyKey);
    return pickResult(json);
  },
};
