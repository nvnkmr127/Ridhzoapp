// No static `crypto` import: this module is reachable from instrumentation.ts, whose graph is
// also compiled for the edge runtime where the node `crypto` builtin can't be bundled. We use the
// global Web Crypto for the UUID and lazy-load node crypto for HMAC (same pattern as the webhook routes).

// Payload schema version. Bump when the envelope/data shape changes so receivers can branch.
export const WEBHOOK_PAYLOAD_VERSION = "1";

export interface WebhookEventPayload {
  version: string;
  eventId: string;
  event: import("@/domains/integrations/webhookEndpointService").WebhookEventType | "lead.hot_threshold" | "lead.stagnant_alert";
  timestamp: string;
  organizationId: string;
  data: Record<string, any>;
}

export class LeadWebhookEventService {
  /**
   * Constructs standardized Webhook JSON event payload.
   */
  static constructPayload(
    organizationId: string,
    event: WebhookEventPayload["event"],
    data: Record<string, any>
  ): WebhookEventPayload {
    return {
      version: WEBHOOK_PAYLOAD_VERSION,
      eventId: `evt_${globalThis.crypto.randomUUID().replace(/-/g, "")}`,
      event,
      timestamp: new Date().toISOString(),
      organizationId,
      data,
    };
  }

  /**
   * Generates HMAC-SHA256 signature header value for payload verification.
   */
  static async generateSignature(payloadString: string, webhookSecret: string): Promise<string> {
    const { createHmac } = await import("crypto");
    return createHmac("sha256", webhookSecret).update(payloadString).digest("hex");
  }

  /**
   * POSTs the signed webhook to the endpoint. Returns the HTTP status; the caller (worker) decides
   * retry/DLQ. A network error or timeout surfaces as success:false with statusCode 0.
   */
  static async dispatchWebhook(
    endpointUrl: string,
    webhookSecret: string,
    payload: WebhookEventPayload
  ): Promise<{ success: boolean; statusCode: number; payload: WebhookEventPayload; signature: string; errorReason?: string; permanent?: boolean }> {
    const body = JSON.stringify(payload);
    const signature = await this.generateSignature(body, webhookSecret);

    // SSRF: pinnedPost resolves the host, refuses private/loopback/link-local/metadata addresses and then
    // connects to THAT validated address (no second DNS lookup, so a rebinding host can't swap in an
    // internal IP), never follows redirects and caps the response. A blocked URL is a permanent failure
    // (retrying can't fix it).
    try {
      const { pinnedPost } = await import("@/lib/webhooks/ssrf");
      let res: { status: number };
      try {
        res = await pinnedPost(endpointUrl, {
          headers: {
            "Content-Type": "application/json",
            "X-Ridhzo-Signature": signature,
            "X-Ridhzo-Event": payload.event,
            "X-Privyr-Signature": signature,
            "X-Privyr-Event": payload.event,
          },
          body,
          timeoutMs: 10_000,
          maxBytes: 64 * 1024,
        });
      } catch (e) {
        const msg = (e as Error)?.message ?? "";
        if (/private|reserved|resolve|Invalid/i.test(msg)) {
          return { success: false, statusCode: 0, payload, signature, permanent: true, errorReason: msg };
        }
        throw e;
      }
      const ok = res.status >= 200 && res.status < 300;
      // Permanent (don't retry): 3xx (we don't follow) and 4xx except 408/429. Retry 408/429/5xx/0.
      const permanent = (res.status >= 300 && res.status < 400) || (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429);
      return {
        success: ok,
        statusCode: res.status,
        payload,
        signature,
        permanent: ok ? false : permanent,
        errorReason: ok ? undefined : `Endpoint returned status ${res.status}`,
      };
    } catch (e) {
      // Network error / timeout / DNS — transient, retry.
      return { success: false, statusCode: 0, payload, signature, errorReason: (e as Error)?.message || "Network error or timeout" };
    }
  }
}
