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
  return Boolean(process.env.WATXIO_BASE_URL && process.env.WATXIO_API_KEY);
}

function config(): WatxioConfig {
  const baseUrl = process.env.WATXIO_BASE_URL;
  const apiKey = process.env.WATXIO_API_KEY;
  if (!baseUrl || !apiKey) {
    throw new Error("Watxio not configured: set WATXIO_BASE_URL and WATXIO_API_KEY");
  }
  return {
    baseUrl: normalizeBaseUrl(baseUrl),
    apiKey,
    phoneNumberId: process.env.WATXIO_PHONE_NUMBER_ID,
  };
}

async function post(path: string, body: unknown): Promise<any> {
  const { baseUrl, apiKey } = config();
  const url = `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
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

// Picks the message identifier from Watxio's response (supports message_id, messages[0].id, id)
function pickResult(json: any): SendResult {
  const id = json?.message_id ?? json?.messages?.[0]?.id ?? json?.id ?? json?.messageId;
  if (!id) throw new Error(`Watxio: no message id in response ${JSON.stringify(json)}`);
  return { providerMessageId: String(id), status: "sent" };
}

export const WatxioClient = {
  // Standard text message: POST /messages
  async sendText(phone: string, body: string): Promise<SendResult> {
    const json = await post("/messages", {
      to: toRecipient(phone),
      type: "text",
      text: { body },
    });
    return pickResult(json);
  },

  // Approved template (HSM): POST /messages
  async sendTemplate(
    phone: string,
    templateName: string,
    variables: string[] = [],
    languageCode = "en_US",
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
    });
    return pickResult(json);
  },
};
