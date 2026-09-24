import {
  Users,
  Kanban,
  LayoutDashboard,
  CheckSquare,
  CalendarCheck,
  Settings,
  Activity,
  Zap,
  Network,
  Snowflake,
  TrendingUp,
  GitFork,
  Building2,
  Sliders,
  Shield,
  AlertTriangle,
  Radio,
  Database,
  LifeBuoy,
  type LucideIcon,
} from "lucide-react";

// Shared nav definition used by both the desktop Sidebar and the mobile drawer.
export interface NavRoute {
  label: string;
  icon: LucideIcon;
  href: string;
  group: string;
}

export const navRoutes: NavRoute[] = [
  { label: "Dashboard", icon: LayoutDashboard, href: "/", group: "Analytics" },
  { label: "My Dashboard", icon: Activity, href: "/my-dashboard", group: "Analytics" },
  { label: "Insights", icon: TrendingUp, href: "/insights", group: "Analytics" },
  { label: "Leads", icon: Users, href: "/leads", group: "CRM" },
  { label: "Pipeline Board", icon: Kanban, href: "/leads/kanban", group: "CRM" },
  { label: "Cold Leads", icon: Snowflake, href: "/leads/cold", group: "CRM" },
  { label: "Follow-ups", icon: CheckSquare, href: "/follow-ups", group: "Productivity" },
  { label: "Meetings", icon: CalendarCheck, href: "/meetings", group: "Productivity" },
  { label: "Automations", icon: Zap, href: "/automations", group: "Productivity" },
  { label: "Sequences", icon: GitFork, href: "/sequences", group: "Productivity" },
  { label: "Sources", icon: Network, href: "/settings/sources", group: "Settings" },
  { label: "Settings", icon: Settings, href: "/settings", group: "Settings" },
];

export const navGroups = ["Analytics", "CRM", "Productivity", "Settings"];

export interface SuperAdminRoute {
  label: string;
  tab: string;
  href: string;
  icon: LucideIcon;
}

export const superAdminRoutes: SuperAdminRoute[] = [
  { label: "Organizations & Fleet", tab: "tenants", href: "/admin?tab=tenants", icon: Building2 },
  { label: "RevOps & Invoicing", tab: "revops", href: "/admin?tab=revops", icon: TrendingUp },
  { label: "Support Desk", tab: "support", href: "/admin?tab=support", icon: LifeBuoy },
  { label: "Feature Flags & Canary", tab: "flags", href: "/admin?tab=flags", icon: Sliders },
  { label: "GDPR & Compliance", tab: "compliance", href: "/admin?tab=compliance", icon: Shield },
  { label: "Global Users", tab: "users", href: "/admin?tab=users", icon: Users },
  { label: "SLA Escalations", tab: "escalations", href: "/admin?tab=escalations", icon: AlertTriangle },
  { label: "Webhook DLQ", tab: "dlq", href: "/admin?tab=dlq", icon: Radio },
  { label: "System & Security", tab: "system", href: "/admin?tab=system", icon: Database },
];
