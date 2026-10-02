// GA4 Measurement Protocol — server-side conversions (sign_up, purchase) that no browser tag can see
// reliably (signup completes on the app domain, payment arrives by webhook). No-op until both
// GA4_MEASUREMENT_ID (the marketing site's G-… stream) and GA4_API_SECRET (Admin → Data streams →
// Measurement Protocol API secrets) are set. Never throws; callers fire it via keepAlive().
// ponytail: client_id is the workspace id, so these events aren't stitched to the website session
// (that needs the _ga cookie carried across domains); upgrade by capturing it in StoredAttribution.
export async function sendGa4Event(
  orgId: string,
  name: "sign_up" | "purchase",
  params: Record<string, string | number> = {},
): Promise<void> {
  const id = process.env.GA4_MEASUREMENT_ID;
  const secret = process.env.GA4_API_SECRET;
  if (!id || !secret) return;
  try {
    const res = await fetch(
      `https://www.google-analytics.com/mp/collect?measurement_id=${encodeURIComponent(id)}&api_secret=${encodeURIComponent(secret)}`,
      {
        method: "POST",
        body: JSON.stringify({
          client_id: `org.${orgId}`,
          user_id: orgId,
          events: [{ name, params: { engagement_time_msec: 1, ...params } }],
        }),
      },
    );
    if (!res.ok) console.warn("[ga4] measurement protocol rejected", name, res.status);
  } catch (e) {
    console.warn("[ga4] send failed", name, e);
  }
}
