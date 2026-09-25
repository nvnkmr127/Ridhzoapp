import { getOrganizationAction } from "@/lib/actions/organizations";
import { GeneralSettingsForm } from "@/components/settings/GeneralSettingsForm";
import { isConfigured as whatsappApiConfigured } from "@/lib/messaging/whatsapp/client";
import { requireOrg, hasPermission } from "@/lib/rbac";
import type { PermissionKey } from "@/lib/permissions";
import { LeadSourceService } from "@/domains/leads/sourceService";
import { PlanService } from "@/domains/billing/planService";
import Link from "next/link";
import { Sliders, Database, MessageSquare, Users, ListPlus, KeyRound, ScrollText, CreditCard, Plug, Webhook, Mail, Sparkles, Share2, Store } from "lucide-react";

// Grouped by what an owner is trying to do; developer/technical pages sit under "Advanced".
// `perm` mirrors each page's own gate, so nobody is shown a link that just redirects them away.
const NAV: { group: string; items: { href: string; label: string; icon: React.ElementType; perm?: PermissionKey }[] }[] = [
  {
    group: "Business",
    items: [
      { href: "/settings", label: "General", icon: Sliders },
      { href: "/settings/billing", label: "Plan & billing", icon: CreditCard, perm: "billing.manage" },
    ],
  },
  {
    group: "Leads",
    items: [
      { href: "/settings/sources", label: "Where leads come from", icon: Database, perm: "sources.manage" },
      { href: "/settings/distribution", label: "New-lead alerts", icon: Share2, perm: "api.manage" },
      { href: "/settings/custom-fields", label: "Custom fields", icon: ListPlus, perm: "settings.manage" },
    ],
  },
  {
    group: "Messages & team",
    items: [
      { href: "/settings/templates", label: "Message templates", icon: MessageSquare },
      { href: "/settings/users", label: "Team members", icon: Users, perm: "users.manage" },
      { href: "/settings/meetings", label: "Meetings & booking", icon: Store, perm: "settings.manage" },
      { href: "/settings/email", label: "Email sending", icon: Mail, perm: "settings.manage" },
    ],
  },
  {
    group: "Advanced",
    items: [
      { href: "/settings/integrations", label: "Integrations", icon: Plug },
      { href: "/settings/lead-intelligence", label: "Lead Intelligence", icon: Sparkles, perm: "settings.manage" },
      { href: "/settings/api", label: "API keys", icon: KeyRound, perm: "api.manage" },
      { href: "/settings/webhooks", label: "Webhooks", icon: Webhook, perm: "api.manage" },
      { href: "/settings/audit", label: "Activity log", icon: ScrollText, perm: "audit.view" },
    ],
  },
];

export default async function SettingsPage() {
  const { organizationId } = await requireOrg();
  const perms = [...new Set(NAV.flatMap((g) => g.items.flatMap((i) => (i.perm ? [i.perm] : []))))];
  const [organization, sources, usage, granted] = await Promise.all([
    getOrganizationAction(),
    LeadSourceService.getSources(organizationId),
    PlanService.getUsageStats(organizationId),
    Promise.all(perms.map(async (p) => [p, await hasPermission(p)] as const)).then((e) => new Map(e)),
  ]);
  const nav = NAV.map((g) => ({ ...g, items: g.items.filter((i) => !i.perm || granted.get(i.perm)) })).filter((g) => g.items.length);

  return (
    <div className="flex-1 space-y-6 p-4 pt-4 sm:p-8 sm:pt-6 max-w-7xl mx-auto">
      <div className="border-b border-border pb-4">
        <h2 className="text-3xl font-bold tracking-tight text-foreground">Settings</h2>
        <p className="text-sm text-muted-foreground mt-1">Your business details, how messages are sent, and alerts for your team.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        <nav aria-label="Settings" className="lg:col-span-1 space-y-4 bg-card dark:bg-secondary p-4 rounded-2xl border border-border h-fit">
          {nav.map(({ group, items }) => (
            <div key={group} className="space-y-1">
              <div className="px-3 pb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{group}</div>
              {items.map(({ href, label, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  aria-current={href === "/settings" ? "page" : undefined}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium ${
                    href === "/settings" ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-accent"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </Link>
              ))}
            </div>
          ))}
        </nav>

        <main className="lg:col-span-3">
          <GeneralSettingsForm
            organization={organization}
            whatsappApiReady={whatsappApiConfigured()}
            hasLeadSource={sources.some((s) => s.isActive)}
            seats={usage.seats}
          />
        </main>
      </div>
    </div>
  );
}
