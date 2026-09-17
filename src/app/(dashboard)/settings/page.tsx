import { getOrganizationAction } from "@/lib/actions/organizations";
import { GeneralSettingsForm } from "@/components/settings/GeneralSettingsForm";
import Link from "next/link";
import { Sliders, Database, MessageSquare, Users, ListPlus, KeyRound, ScrollText, CreditCard, Plug, Webhook, Mail, Sparkles, Share2 } from "lucide-react";

export default async function SettingsPage() {
  const organization = await getOrganizationAction();

  return (
    <div className="flex-1 space-y-6 p-4 pt-4 sm:p-8 sm:pt-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between border-b border-border dark:border-border pb-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight text-foreground dark:text-foreground">Settings</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Manage your Ridhzo lead management platform configuration, status schemas, and team preferences.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        <aside className="lg:col-span-1 space-y-1 bg-card dark:bg-secondary p-4 rounded-2xl border border-border dark:border-border h-fit">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-3 py-2">
            Navigation
          </div>
          <Link
            href="/settings"
            className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium bg-muted dark:bg-secondary text-muted-foreground dark:text-foreground"
          >
            <Sliders className="h-4 w-4" />
            General & Statuses
          </Link>
          <Link
            href="/settings/sources"
            className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium text-muted-foreground dark:text-muted-foreground hover:bg-accent dark:hover:bg-accent"
          >
            <Database className="h-4 w-4" />
            Lead Sources
          </Link>
          <Link
            href="/settings/templates"
            className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium text-muted-foreground dark:text-muted-foreground hover:bg-accent dark:hover:bg-accent"
          >
            <MessageSquare className="h-4 w-4" />
            Message Templates
          </Link>
          <Link
            href="/settings/users"
            className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium text-muted-foreground dark:text-muted-foreground hover:bg-accent dark:hover:bg-accent"
          >
            <Users className="h-4 w-4" />
            Users & Roles
          </Link>
          <Link
            href="/settings/custom-fields"
            className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium text-muted-foreground dark:text-muted-foreground hover:bg-accent dark:hover:bg-accent"
          >
            <ListPlus className="h-4 w-4" />
            Custom Fields
          </Link>
          <Link
            href="/settings/api"
            className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium text-muted-foreground dark:text-muted-foreground hover:bg-accent dark:hover:bg-accent"
          >
            <KeyRound className="h-4 w-4" />
            API Access
          </Link>
          <Link
            href="/settings/email"
            className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium text-muted-foreground dark:text-muted-foreground hover:bg-accent dark:hover:bg-accent"
          >
            <Mail className="h-4 w-4" />
            Email (SMTP)
          </Link>
          <Link
            href="/settings/lead-intelligence"
            className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium text-muted-foreground dark:text-muted-foreground hover:bg-accent dark:hover:bg-accent"
          >
            <Sparkles className="h-4 w-4" />
            Lead Intelligence
          </Link>
          <Link
            href="/settings/webhooks"
            className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium text-muted-foreground dark:text-muted-foreground hover:bg-accent dark:hover:bg-accent"
          >
            <Webhook className="h-4 w-4" />
            Webhooks
          </Link>
          <Link
            href="/settings/distribution"
            className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium text-muted-foreground dark:text-muted-foreground hover:bg-accent dark:hover:bg-accent"
          >
            <Share2 className="h-4 w-4" />
            Lead Distribution
          </Link>
          <Link
            href="/settings/audit"
            className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium text-muted-foreground dark:text-muted-foreground hover:bg-accent dark:hover:bg-accent"
          >
            <ScrollText className="h-4 w-4" />
            Audit Log
          </Link>
          <Link
            href="/settings/billing"
            className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium text-muted-foreground dark:text-muted-foreground hover:bg-accent dark:hover:bg-accent"
          >
            <CreditCard className="h-4 w-4" />
            Billing & Plan
          </Link>
          <Link
            href="/settings/integrations"
            className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium text-muted-foreground dark:text-muted-foreground hover:bg-accent dark:hover:bg-accent"
          >
            <Plug className="h-4 w-4" />
            Integrations
          </Link>
        </aside>

        <main className="lg:col-span-3">
          <GeneralSettingsForm organization={organization} />
        </main>
      </div>
    </div>
  );
}
