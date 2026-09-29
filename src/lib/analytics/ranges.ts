// Dashboard date range used when the URL has no ?range=. "Last 30 days", not all-time: an all-time
// total never moves, so it can't show whether things are getting better. Shared by the page (server)
// and the filter buttons (client), so it lives outside both.
export const DEFAULT_DASHBOARD_RANGE = "30d";
