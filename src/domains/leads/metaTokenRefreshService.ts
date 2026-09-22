export interface MetaTokenExchangeResult {
  accessToken: string;
  tokenType: string;
  expiresInSeconds: number;
  expiresAt: Date;
}

export interface MetaPageTokenResult {
  pageId: string;
  pageAccessToken: string;
}

const GRAPH = "https://graph.facebook.com/v20.0";

function appId(): string {
  return process.env.FACEBOOK_APP_ID || "";
}
function appSecret(): string {
  return process.env.FACEBOOK_APP_SECRET || "";
}

// Real Meta credentials present? The old "mock_app_id"/"mock_app_secret" fallbacks are treated
// as unconfigured so the flow fails honestly instead of fabricating tokens.
function isConfigured(): boolean {
  const id = appId();
  const secret = appSecret();
  return Boolean(id && secret && id !== "mock_app_id" && secret !== "mock_app_secret");
}

// Meta rate-limit error codes (app/user/page throttling) plus HTTP 429.
const RATE_LIMIT_CODES = new Set([4, 17, 32, 613]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function graphGet(url: string, attempt = 0): Promise<any> {
  const res = await fetch(url);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const code = json?.error?.code;
    // Transient throttle → back off and retry a few times before giving up, so one 429 doesn't
    // abort a whole historical sync.
    if ((res.status === 429 || RATE_LIMIT_CODES.has(code)) && attempt < 3) {
      await sleep(2000 * Math.pow(2, attempt)); // 2s, 4s, 8s
      return graphGet(url, attempt + 1);
    }
    const msg = json?.error?.message || `Meta Graph API error (${res.status})`;
    const e = new Error(msg) as Error & { metaCode?: number; metaType?: string };
    e.metaCode = code;
    e.metaType = json?.error?.type;
    throw e;
  }
  return json;
}

function toResult(json: { access_token?: string; token_type?: string; expires_in?: number }): MetaTokenExchangeResult {
  if (!json.access_token) throw new Error("Meta did not return an access token");
  const expiresInSeconds = json.expires_in ?? 5184000; // Meta omits expires_in for some long-lived tokens
  return {
    accessToken: json.access_token,
    tokenType: json.token_type || "bearer",
    expiresInSeconds,
    expiresAt: new Date(Date.now() + expiresInSeconds * 1000),
  };
}

export class MetaTokenRefreshService {
  static isConfigured = isConfigured;

  /** Exchanges an OAuth authorization `code` (from the redirect) for a short-lived user token. */
  static async exchangeCodeForToken(code: string, redirectUri: string): Promise<MetaTokenExchangeResult> {
    if (!isConfigured()) throw new Error("Facebook integration is not configured");
    if (!code) throw new Error("Authorization code is required");
    const url =
      `${GRAPH}/oauth/access_token?client_id=${encodeURIComponent(appId())}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&client_secret=${encodeURIComponent(appSecret())}` +
      `&code=${encodeURIComponent(code)}`;
    return toResult(await graphGet(url));
  }

  /** Exchanges a short-lived user token for a long-lived (~60-day) token. */
  static async exchangeShortLivedToken(shortLivedToken: string): Promise<MetaTokenExchangeResult> {
    if (!isConfigured()) throw new Error("Facebook integration is not configured");
    if (!shortLivedToken) throw new Error("Short-lived access token is required");
    const url =
      `${GRAPH}/oauth/access_token?grant_type=fb_exchange_token` +
      `&client_id=${encodeURIComponent(appId())}` +
      `&client_secret=${encodeURIComponent(appSecret())}` +
      `&fb_exchange_token=${encodeURIComponent(shortLivedToken)}`;
    return toResult(await graphGet(url));
  }

  /** Fetches a (long-lived) Page Access Token using a long-lived user token. */
  static async fetchPageAccessToken(longLivedUserToken: string, pageId: string): Promise<MetaPageTokenResult> {
    if (!isConfigured()) throw new Error("Facebook integration is not configured");
    if (!longLivedUserToken || !pageId) throw new Error("Long-lived token and pageId are required");
    const url = `${GRAPH}/${encodeURIComponent(pageId)}?fields=access_token&access_token=${encodeURIComponent(longLivedUserToken)}`;
    const json = await graphGet(url);
    if (!json.access_token) throw new Error("Meta did not return a Page access token");
    return { pageId, pageAccessToken: json.access_token };
  }

  /**
   * Subscribes the Page to THIS app's `leadgen` webhooks. Without this, Meta never delivers lead
   * webhooks for the Page and live leads never arrive — the most common "leads not importing" cause.
   * Uses the Page access token. Docs: /{page-id}/subscribed_apps.
   */
  static async subscribePageToLeadgen(pageId: string, pageAccessToken: string): Promise<boolean> {
    if (!pageId || !pageAccessToken) throw new Error("pageId and pageAccessToken are required to subscribe the Page");
    const url =
      `${GRAPH}/${encodeURIComponent(pageId)}/subscribed_apps` +
      `?subscribed_fields=leadgen&access_token=${encodeURIComponent(pageAccessToken)}`;
    const res = await fetch(url, { method: "POST" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = json?.error?.message || `Meta subscribe failed (${res.status})`;
      const e = new Error(msg) as Error & { metaCode?: number; metaType?: string };
      e.metaCode = json?.error?.code;
      e.metaType = json?.error?.type;
      throw e;
    }
    return Boolean(json?.success);
  }

  /**
   * Lists the Pages the user manages, each with its own Page access token. This is what turns a
   * user OAuth grant into a connectable lead source — /me/accounts returns id, name and access_token
   * per Page in one call, so no separate fetchPageAccessToken round trip is needed.
   */
  static async listPages(
    longLivedUserToken: string,
  ): Promise<{ pageId: string; name: string; pageAccessToken: string }[]> {
    if (!isConfigured()) throw new Error("Facebook integration is not configured");
    if (!longLivedUserToken) throw new Error("Long-lived token is required");
    const url = `${GRAPH}/me/accounts?fields=id,name,access_token&access_token=${encodeURIComponent(longLivedUserToken)}`;
    const json = await graphGet(url);
    const data: any[] = Array.isArray(json?.data) ? json.data : [];
    return data
      .filter((p) => p?.id && p?.access_token)
      .map((p) => ({ pageId: String(p.id), name: String(p.name ?? p.id), pageAccessToken: String(p.access_token) }));
  }

  /** True when an error from a Graph call means the Page token is dead (revoked/expired/invalid),
   *  i.e. retrying won't help and the source needs a reconnect. */
  static isAuthError(e: any): boolean {
    return (
      e?.metaCode === 190 ||
      e?.metaType === "OAuthException" ||
      /access token|session (has been )?(invalidated|expired)|permission/i.test(String(e?.message ?? ""))
    );
  }

  /** True if the token is within the refresh-warning buffer (e.g. < 7 days remaining). */
  static isTokenExpiringSoon(expiresAt: Date, bufferDays: number = 7): boolean {
    const bufferMs = bufferDays * 24 * 60 * 60 * 1000;
    return expiresAt.getTime() - Date.now() <= bufferMs;
  }

  // Explicit field list for lead (leadgen) nodes. Graph's defaults don't reliably include
  // field_data / campaign info, and the webhook path needs both — so always request them.
  private static readonly LEAD_FIELDS =
    "id,created_time,field_data,form_id,ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,page_id";

  /**
   * Fetches lead details (field_data, campaign info) for a leadgen_id via Meta Graph API using the Page access token.
   */
  static async fetchLeadgenData(leadgenId: string, pageAccessToken: string): Promise<any> {
    if (!leadgenId || !pageAccessToken) {
      throw new Error("leadgenId and pageAccessToken are required to fetch lead details");
    }
    const url = `${GRAPH}/${encodeURIComponent(leadgenId)}?fields=${this.LEAD_FIELDS}&access_token=${encodeURIComponent(pageAccessToken)}`;
    return graphGet(url);
  }

  /**
   * Lists lead forms on a Facebook Page. Archived/deleted forms are dropped so the picker and
   * historical sync only deal with live forms.
   */
  static async listPageLeadForms(
    pageId: string,
    pageAccessToken: string
  ): Promise<Array<{ id: string; name: string; status?: string }>> {
    if (!pageId || !pageAccessToken) {
      throw new Error("pageId and pageAccessToken are required to list lead forms");
    }
    const url = `${GRAPH}/${encodeURIComponent(pageId)}/leadgen_forms?fields=id,name,status&limit=200&access_token=${encodeURIComponent(pageAccessToken)}`;
    const json = await graphGet(url);
    const data: any[] = Array.isArray(json?.data) ? json.data : [];
    const dead = new Set(["DELETED", "ARCHIVED"]);
    return data
      .filter((f) => !dead.has(String(f.status ?? "").toUpperCase()))
      .map((f) => ({ id: String(f.id), name: String(f.name ?? f.id), status: f.status }));
  }

  /**
   * Lists the questions (fields) of one lead form, so the UI can offer them as mapping targets.
   * Meta returns each question's `key` (what appears in a lead's field_data[].name) and `label`.
   */
  static async listFormQuestions(
    formId: string,
    pageAccessToken: string,
  ): Promise<Array<{ key: string; label: string; type?: string }>> {
    if (!formId || !pageAccessToken) {
      throw new Error("formId and pageAccessToken are required to list form questions");
    }
    const url = `${GRAPH}/${encodeURIComponent(formId)}?fields=questions{key,label,type}&access_token=${encodeURIComponent(pageAccessToken)}`;
    const json = await graphGet(url);
    const questions: any[] = Array.isArray(json?.questions?.data)
      ? json.questions.data
      : Array.isArray(json?.questions)
        ? json.questions
        : [];
    return questions
      .map((q) => ({ key: String(q.key ?? q.name ?? ""), label: String(q.label ?? q.key ?? ""), type: q.type }))
      .filter((q) => q.key);
  }

  /**
   * Fetches historical leads submitted to a specific lead form, following Graph API cursor
   * pagination until the form is exhausted or `maxTotal` is reached. `pageSize` is the per-request
   * page; Meta caps it around a few hundred.
   */
  static async fetchFormLeads(
    formId: string,
    pageAccessToken: string,
    pageSize: number = 100,
    maxTotal: number = 1000,
    opts: { since?: number; until?: number } = {}
  ): Promise<any[]> {
    if (!formId || !pageAccessToken) {
      throw new Error("formId and pageAccessToken are required to fetch form leads");
    }
    // Optional time window: Meta filters the leads edge on time_created (unix seconds).
    const filters: Array<{ field: string; operator: string; value: number }> = [];
    if (opts.since) filters.push({ field: "time_created", operator: "GREATER_THAN", value: opts.since });
    if (opts.until) filters.push({ field: "time_created", operator: "LESS_THAN", value: opts.until });
    const filtering = filters.length ? `&filtering=${encodeURIComponent(JSON.stringify(filters))}` : "";

    const out: any[] = [];
    let url: string | null =
      `${GRAPH}/${encodeURIComponent(formId)}/leads?fields=${this.LEAD_FIELDS}` +
      `&limit=${pageSize}${filtering}&access_token=${encodeURIComponent(pageAccessToken)}`;

    let pages = 0;
    while (url && out.length < maxTotal) {
      const json: any = await graphGet(url);
      const batch: any[] = Array.isArray(json?.data) ? json.data : [];
      if (pages === 0) {
        console.log(`[FB_SYNC] GET /${formId}/leads → ${batch.length} in first page (filtered=${filters.length > 0})`);
      }
      out.push(...batch);
      pages++;
      // `paging.next` already carries the cursor + access_token; stop when absent or batch empty.
      url = batch.length > 0 ? (json?.paging?.next ?? null) : null;
    }
    return out.slice(0, maxTotal);
  }
}
