import type { PlatformConsoleProps } from "./types";

export const TABS = ["tenants", "revops", "support", "announcements", "compliance", "users", "escalations", "dlq", "system"] as const;
export type Tab = (typeof TABS)[number];
type Prop = keyof PlatformConsoleProps;

// Single source of truth for what /admin loads per tab: page.tsx fetches a prop only when the open
// tab lists it. A tab that reads a prop missing here renders with it undefined — a form then shows
// defaults and saving overwrites the real value (how the broadcast banner and digest settings broke).
// tabData.test.ts fails if a tab component's props and this list drift apart.
export const TAB_PROPS: Record<Tab, Prop[]> = {
  tenants: ["initial"],
  users: ["initialUsers"],
  escalations: ["escalations"],
  dlq: ["dlq"],
  system: ["initial", "initialUsers", "initialApiKeys", "initialAnomalies", "initialActivity"],
  compliance: ["initial"],
  revops: [
    "initial", "revops", "tenantHealth", "initialBilling", "initialInvoices", "initialCoupons",
    "initialDigestConfig", "initialCapiConfig", "initialCapiLogs", "initialCampaigns",
  ],
  support: ["initialTickets"],
  announcements: ["initial", "initialBroadcast"],
};

// Loaded on every tab (header cards + tab badges read them).
export const ALWAYS_LOADED: Prop[] = ["initialTab", "metrics", "revenueSummary", "initialMaintenance", "initialOpsAlert", "openTicketCount", "activeThreatCount"];

export const tabNeeds = (tab: Tab, prop: Prop) => TAB_PROPS[tab].includes(prop);
