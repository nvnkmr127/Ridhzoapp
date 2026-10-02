# Outbound webhooks — events & payloads

Settings → Webhooks sends a signed `POST` to your HTTPS URL when something happens in the workspace.

## Delivery
- `POST` JSON, `Content-Type: application/json`, **10 s timeout**, up to 64 KB of response read. **Redirects are not followed.**
- URLs must be public: private/loopback/link-local/metadata addresses are refused (and re-checked at connect time).
- Success = any `2xx`. `408`, `429`, `5xx` and network errors are **retried** with backoff; other `4xx` and `3xx` are permanent failures.
- After the retries are exhausted a delivery lands in **Failed deliveries** (Settings → Webhooks) where you can retry or discard it.
- Each delivery has a unique `eventId`; **dedupe on it** — a retry re-sends the same event.

## Headers
| Header | Value |
|---|---|
| `X-Ridhzo-Event` | the event name, e.g. `lead.created` |
| `X-Ridhzo-Signature` | hex HMAC-SHA256 of the **raw request body** keyed with the endpoint's signing secret |
| `X-Privyr-Event`, `X-Privyr-Signature` | same values, for tools already built against that format |

Verify the signature before trusting the body (compare in constant time):

```js
const expected = crypto.createHmac("sha256", SECRET).update(rawBody).digest("hex");
if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(req.headers["x-ridhzo-signature"]))) return res.sendStatus(401);
```

## Envelope
```json
{
  "version": "1",
  "eventId": "evt_3f9c…",
  "event": "lead.created",
  "timestamp": "2026-10-02T09:15:00.000Z",
  "organizationId": "…uuid…",
  "data": { }
}
```
`version` is bumped when the envelope or `data` shapes change incompatibly.

## Events and `data`
Lead events share a base: `id, name, email, phone, company, status`.

| Event | Extra `data` fields |
|---|---|
| `lead.created` | — |
| `lead.status_changed` | `oldStatus`, `newStatus` |
| `lead.assigned` | `ownerId` (null = unassigned), `ownerName` |
| `meeting.scheduled` · `meeting.rescheduled` · `meeting.completed` · `meeting.no_show` · `meeting.cancelled` | `meeting`: `{ id, mode, title, status, startAt, durationMinutes, locationName, address, mapUrl, meetingUrl, assigneeId, outcome }` (ISO timestamps) |

Limits: endpoints per workspace are capped by plan (Free 1, Starter 5, Unlimited unlimited). Webhook management needs `api.manage`.
