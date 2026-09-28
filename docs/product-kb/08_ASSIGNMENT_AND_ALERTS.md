# Lead Assignment & New-Lead Alerts

## Automatic assignment
The faster the right person calls, the higher the conversion. Ridhzo assigns every new lead automatically.

| Method | How it works | Best for |
|---|---|---|
| **Round-robin** | Leads go to the next rep in turn — fair and even. Race-safe even when many leads arrive together. | Teams with similar reps |
| **Team-based round-robin** | Rotate within a specific team (e.g., "Hyderabad team", "Telugu-speaking counsellors") | Multi-city or multi-language teams |
| **Capacity-based** | Each rep has a maximum number of active leads; new leads go to whoever has the most free capacity | Preventing overload |
| **Per-source assignment** | Leads from a given source go to a chosen person/team | Different teams per product/campaign |
| **Automation rules** | "IF city = Pune THEN assign to Rahul" — any condition | Territory, product, budget based routing |
| **Manual & bulk** | Reassign one lead or hundreds at once | Managers balancing workload |

Only active users receive leads; deactivated users are skipped automatically. Every assignment is logged on the lead timeline and notifies the new owner.

## New-lead alerts (Settings → New-lead alerts)
Send an alert about each new lead to anyone — **inside or outside** your team:
- **Email** — a clean summary of the lead with a link to open it.
- **In-app notification** to chosen team members.
- **WhatsApp** (with the Business API and an approved template).
- **Conditions:** only alert for certain sources, statuses or custom-field values (e.g., "Budget > ₹1 crore → alert the director").
- **Test** a rule before switching it on; see a **delivery log** for each rule.

## Instant alerts to the owner & sales rep
- **Dedicated High-Priority Mobile Push Channels:** On mobile devices, alerts use high-priority notification channels (New Leads, Calls, Reminders) with sound and badge counts, ensuring immediate delivery even in doze mode.
- **Direct Tap Routing:** Tapping a push notification deep-links straight into that lead's profile, so reps can call or message in one tap without finding the lead in a list.
- **Smart Missed-Call Filtering:** When a lead calls a rep and the rep misses the call, the device OS already shows a native missed-call alert. Ridhzo detects this and suppresses redundant duplicate push alerts to that same device, while keeping the activity logged and alerting other team channels if assigned.
- **Redis Device Registration Deduplication:** Device push tokens are deduplicated via Redis, pruning stale tokens and ensuring network reconnects never cause duplicate notifications.
- **In-app bell** with an alert sound for desktop and web sessions.
- Optional email notifications (each user controls their own preferences).

## Real use cases
- **Speed-to-lead:** Facebook lead arrives at 9:02 PM → assigned to the on-shift rep → high-priority push buzzes phone → rep taps notification → WhatsApp sent at 9:03 PM.
- **Smart Call Alert:** Customer misses rep call; Ridhzo logs the attempt without double-alerting the rep's phone, but triggers an automatic WhatsApp "Sorry we missed your call".
- **Channel partner / agency:** A marketing agency forwards every new lead to its client's sales head by email automatically.
- **VIP escalation:** Leads with budget above a threshold alert the owner on WhatsApp as well as the assigned rep.
- **Fairness:** Reps stop fighting over leads — round-robin is automatic and transparent.

## Why it matters
- Leads are contacted in minutes, not hours.
- Work is spread fairly; no rep is overloaded.
- Clean notification hygiene: reps get alerted to what matters without spam or duplicate buzzes.
- Managers and partners stay informed without logging in.
