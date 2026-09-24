"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { updateOrganizationAction } from "@/lib/actions/organizations";
import { StatusManagementModal } from "@/components/leads/StatusManagementModal";
import { AiContextDialog } from "@/components/settings/AiContextDialog";
import { Sliders, Building, Tag, Users, MessageSquare, Database, Globe, LocateFixed, Lock, Check, Sparkles, Clock, Calendar, DollarSign } from "lucide-react";
import Link from "next/link";

type Org = {
  id: string;
  name: string;
  slug: string;
  plan: string;
  timezone?: string | null;
  locale?: string | null;
  currency?: string | null;
  dateFormat?: string | null;
  industry?: string | null;
  aiContext?: string | null;
  phone?: string | null;
  website?: string | null;
  addressLine1?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
  requiredLeadFields?: string[] | null;
  slaHours?: number | null;
  whatsappMode?: string | null;
  dailySummary?: number | null;
  sequenceWindowStart?: number | null;
  sequenceWindowEnd?: number | null;
  updatedAt?: string | Date | null;
};

const LEAD_FIELDS: { key: string; label: string }[] = [
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "company", label: "Company" },
];

const CURRENCIES: { code: string; name: string; symbol: string }[] = [
  { code: "USD", name: "US Dollar", symbol: "$" },
  { code: "EUR", name: "Euro", symbol: "€" },
  { code: "GBP", name: "British Pound", symbol: "£" },
  { code: "INR", name: "Indian Rupee", symbol: "₹" },
  { code: "AUD", name: "Australian Dollar", symbol: "A$" },
  { code: "CAD", name: "Canadian Dollar", symbol: "C$" },
  { code: "SGD", name: "Singapore Dollar", symbol: "S$" },
  { code: "AED", name: "UAE Dirham", symbol: "د.إ" },
  { code: "JPY", name: "Japanese Yen", symbol: "¥" },
];

const DATE_FORMATS = ["MM/DD/YYYY", "DD/MM/YYYY", "YYYY-MM-DD", "DD-MMM-YYYY"];

const LOCALES: { code: string; name: string }[] = [
  { code: "en", name: "English (US)" },
  { code: "en-GB", name: "English (UK)" },
  { code: "es", name: "Español" },
  { code: "fr", name: "Français" },
  { code: "de", name: "Deutsch" },
  { code: "pt", name: "Português" },
  { code: "hi", name: "हिन्दी (Hindi)" },
  { code: "ar", name: "العربية (Arabic)" },
  { code: "zh", name: "中文 (Chinese)" },
];

// Real IANA timezone list from the runtime; fall back to a curated set on older browsers.
function timezoneList(): string[] {
  try {
    const zones = (Intl as any).supportedValuesOf?.("timeZone");
    if (Array.isArray(zones) && zones.length) return zones;
  } catch { /* fall through */ }
  return ["UTC", "America/New_York", "America/Chicago", "America/Los_Angeles", "Europe/London", "Europe/Berlin", "Asia/Kolkata", "Asia/Singapore", "Asia/Dubai", "Australia/Sydney"];
}

// Renders a Date per the chosen MM/DD/YYYY-style token string.
function formatDate(d: Date, fmt: string): string {
  const MMM = d.toLocaleString("en-US", { month: "short" });
  const map: Record<string, string> = {
    YYYY: String(d.getFullYear()),
    MM: String(d.getMonth() + 1).padStart(2, "0"),
    DD: String(d.getDate()).padStart(2, "0"),
    MMM,
  };
  return fmt.replace(/YYYY|MMM|MM|DD/g, (t) => map[t] ?? t);
}

// A native <select> — no dependency, correct on edge cases, themable via the same classes as Input.
function NativeSelect(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
    />
  );
}

export function GeneralSettingsForm({ organization }: { organization?: Org | null }) {
  const { toast } = useToast();
  const [saving, setSaving] = React.useState(false);
  const [statusModalOpen, setStatusModalOpen] = React.useState(false);
  const [requiredFields, setRequiredFields] = React.useState<string[]>(
    organization?.requiredLeadFields ?? ["name"],
  );
  // Version the form loaded with — sent back on save so a concurrent edit is caught, not clobbered.
  const [expectedUpdatedAt, setExpectedUpdatedAt] = React.useState<string | null>(
    organization?.updatedAt ? new Date(organization.updatedAt).toISOString() : null,
  );
  const [f, setF] = React.useState({
    name: organization?.name ?? "",
    timezone: organization?.timezone ?? "UTC",
    locale: organization?.locale ?? "en",
    currency: organization?.currency ?? "USD",
    dateFormat: organization?.dateFormat ?? "MM/DD/YYYY",
    industry: organization?.industry ?? "",
    aiContext: organization?.aiContext ?? "",
    phone: organization?.phone ?? "",
    website: organization?.website ?? "",
    addressLine1: organization?.addressLine1 ?? "",
    city: organization?.city ?? "",
    state: organization?.state ?? "",
    postalCode: organization?.postalCode ?? "",
    country: organization?.country ?? "",
    slaHours: organization?.slaHours != null ? String(organization.slaHours) : "",
    whatsappMode: organization?.whatsappMode ?? "personal",
    dailySummary: organization?.dailySummary === 0 ? "0" : "1",
    sequenceWindowStart: organization?.sequenceWindowStart != null ? String(organization.sequenceWindowStart) : "",
    sequenceWindowEnd: organization?.sequenceWindowEnd != null ? String(organization.sequenceWindowEnd) : "",
  });

  // Prompt user before leaving with unsaved changes
  const [dirty, setDirty] = React.useState(false);
  const set = (k: keyof typeof f, v: string) => {
    setDirty(true);
    setF((s) => ({ ...s, [k]: v }));
  };

  const tzList = React.useMemo(() => timezoneList(), []);
  const [now, setNow] = React.useState<Date | null>(null);
  React.useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const preview = React.useMemo(() => {
    const ref = now ?? new Date();
    let tzTime = "";
    try {
      tzTime = now
        ? new Intl.DateTimeFormat(f.locale || "en", { hour: "2-digit", minute: "2-digit", timeZone: f.timezone || "UTC" }).format(now)
        : "—:—";
    } catch { tzTime = "—:—"; }
    const date = formatDate(ref, f.dateFormat || "MM/DD/YYYY");
    let money = "";
    try {
      money = new Intl.NumberFormat(f.locale || "en", { style: "currency", currency: f.currency || "USD" }).format(1234.5);
    } catch { money = `${f.currency} 1,234.50`; }
    return { tzTime, date, money };
  }, [now, f.locale, f.timezone, f.dateFormat, f.currency]);

  React.useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [dirty]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!f.name.trim()) return;

    if (f.website.trim()) {
      let url = f.website.trim();
      if (!/^https?:\/\//i.test(url)) {
        url = `https://${url}`;
      }
      try {
        new URL(url);
      } catch {
        toast({ variant: "destructive", title: "Invalid Website URL", description: "Please enter a valid website address (e.g., https://example.com)." });
        return;
      }
    }

    if (f.slaHours && (isNaN(Number(f.slaHours)) || Number(f.slaHours) < 0)) {
      toast({ variant: "destructive", title: "Invalid response deadline", description: "Response deadline (hours) must be a positive number." });
      return;
    }

    setSaving(true);
    try {
      const res = await updateOrganizationAction({
        ...f,
        name: f.name.trim(),
        whatsappMode: f.whatsappMode === "bsp" ? "bsp" : "personal",
        dailySummary: f.dailySummary === "0" ? 0 : 1,
        slaHours: f.slaHours === "" ? null : Number(f.slaHours),
        sequenceWindowStart: f.sequenceWindowStart === "" ? null : Number(f.sequenceWindowStart),
        sequenceWindowEnd: f.sequenceWindowEnd === "" ? null : Number(f.sequenceWindowEnd),
        requiredLeadFields: requiredFields as ("name" | "email" | "phone" | "company")[],
        expectedUpdatedAt: expectedUpdatedAt ?? "",
      });
      if (!res.ok) {
        toast({
          variant: "destructive",
          title: res.code === "CONFLICT" ? "Settings changed elsewhere" : "Failed to save settings",
          description: res.message,
        });
        return;
      }
      // Advance our version to what was just written so the next save isn't a false conflict.
      const savedAt = (res.data as { updatedAt?: string | Date } | undefined)?.updatedAt;
      if (savedAt) setExpectedUpdatedAt(new Date(savedAt).toISOString());
      setDirty(false);
      toast({ title: "Settings saved", description: "Organization settings updated successfully." });
    } catch {
      toast({ variant: "destructive", title: "Failed to save settings", description: "We couldn't reach the server. Please try again." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <StatusManagementModal open={statusModalOpen} onOpenChange={setStatusModalOpen} />

      <form onSubmit={handleSave} className="space-y-6">
        {/* Company information */}
        <div className="bg-card dark:bg-secondary rounded-2xl border border-border dark:border-border p-6 space-y-6">
          <div className="flex items-center gap-3 border-b border-border dark:border-border pb-4">
            <Building className="h-5 w-5 text-muted-foreground" />
            <div>
              <h3 className="text-lg font-semibold text-foreground dark:text-foreground">Company Information</h3>
              <p className="text-xs text-muted-foreground">Your organization identity and contact details.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="org-name">Business Name *</Label>
              <Input id="org-name" value={f.name} onChange={(e) => set("name", e.target.value)}
                placeholder="e.g. Acme Realty" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="industry">Industry</Label>
              <Input id="industry" value={f.industry} onChange={(e) => set("industry", e.target.value)}
                placeholder="e.g. Real Estate" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" value={f.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+1 555 123 4567" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="website">Website</Label>
              <Input id="website" value={f.website} onChange={(e) => set("website", e.target.value)} placeholder="https://example.com" />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>What your business does (for AI)</Label>
              <div className="flex items-start gap-3 rounded-md border border-input bg-background p-3">
                <p className={`flex-1 text-sm whitespace-pre-wrap line-clamp-3 ${f.aiContext.trim() ? "text-foreground/90" : "text-muted-foreground"}`}>
                  {f.aiContext.trim() || "Not set — AI stays generic and guesses from the lead. Add your business context so it speaks as you."}
                </p>
                <AiContextDialog initial={f.aiContext} onSaved={(t) => set("aiContext", t)}>
                  <Button type="button" variant="outline" size="sm" className="gap-2 shrink-0">
                    <Sparkles className="h-4 w-4" /> {f.aiContext.trim() ? "Edit" : "Add"} / improve
                  </Button>
                </AiContextDialog>
              </div>
              <p className="text-xs text-muted-foreground">
                Upload a doc, paste text, or start from a sample — then let AI tidy it up. Saved instantly from the popup; used by AI drafts, recaps, and sequences.
              </p>
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="address">Address</Label>
              <Input id="address" value={f.addressLine1} onChange={(e) => set("addressLine1", e.target.value)}
                placeholder="Street address" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="city">City</Label>
              <Input id="city" value={f.city} onChange={(e) => set("city", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="state">State / Province</Label>
              <Input id="state" value={f.state} onChange={(e) => set("state", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="postal">Postal Code</Label>
              <Input id="postal" value={f.postalCode} onChange={(e) => set("postalCode", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="country">Country (2-letter)</Label>
              <Input id="country" value={f.country} onChange={(e) => set("country", e.target.value.toUpperCase())}
                maxLength={2} placeholder="US" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 pt-2 border-t border-border dark:border-border">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Workspace Slug</Label>
              <div className="text-sm font-mono bg-muted dark:bg-secondary px-3 py-2 rounded-md text-muted-foreground dark:text-foreground">
                {organization?.slug ?? "org-default"}
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Subscription Plan</Label>
              <div className="text-sm font-medium capitalize bg-muted dark:bg-secondary text-muted-foreground dark:text-foreground px-3 py-2 rounded-md">
                {organization?.plan ?? "free"} Plan
              </div>
            </div>
          </div>
        </div>

        {/* Localisation */}
        <div className="bg-card dark:bg-secondary rounded-2xl border border-border dark:border-border p-6 space-y-6">
          <div className="flex items-center gap-3 border-b border-border dark:border-border pb-4">
            <Globe className="h-5 w-5 text-muted-foreground" />
            <div>
              <h3 className="text-lg font-semibold text-foreground dark:text-foreground">Localisation</h3>
              <p className="text-xs text-muted-foreground">Timezone, language, currency, and date formatting for your workspace.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="timezone">Timezone</Label>
              <div className="flex gap-2">
                <Input id="timezone" list="tz-list" value={f.timezone} onChange={(e) => set("timezone", e.target.value)}
                  placeholder="Search e.g. America/New_York" className="flex-1" />
                <Button type="button" variant="outline" size="icon" title="Detect my timezone"
                  onClick={() => { try { set("timezone", Intl.DateTimeFormat().resolvedOptions().timeZone); } catch {} }}>
                  <LocateFixed className="h-4 w-4" />
                </Button>
              </div>
              <datalist id="tz-list">{tzList.map((z) => <option key={z} value={z} />)}</datalist>
            </div>
            <div className="space-y-2">
              <Label htmlFor="locale">Language / Locale</Label>
              <NativeSelect id="locale" value={f.locale} onChange={(e) => set("locale", e.target.value)}>
                {LOCALES.map((l) => <option key={l.code} value={l.code}>{l.name} — {l.code}</option>)}
              </NativeSelect>
            </div>
            <div className="space-y-2">
              <Label htmlFor="currency">Currency</Label>
              <NativeSelect id="currency" value={f.currency} onChange={(e) => set("currency", e.target.value)}>
                {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.code} — {c.name} ({c.symbol})</option>)}
              </NativeSelect>
            </div>
            <div className="space-y-2">
              <Label htmlFor="dateFormat">Date Format</Label>
              <NativeSelect id="dateFormat" value={f.dateFormat} onChange={(e) => set("dateFormat", e.target.value)}>
                {DATE_FORMATS.map((d) => <option key={d} value={d}>{d} — {formatDate(new Date(), d)}</option>)}
              </NativeSelect>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-6 gap-y-1 rounded-xl bg-muted/50 px-4 py-3 text-sm">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Preview</span>
            <span className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5 text-muted-foreground" /> {preview.tzTime}</span>
            <span className="flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5 text-muted-foreground" /> {preview.date}</span>
            <span className="flex items-center gap-1.5"><DollarSign className="h-3.5 w-3.5 text-muted-foreground" /> {preview.money}</span>
          </div>
        </div>

        {/* Required lead information */}
        <div className="bg-card dark:bg-secondary rounded-2xl border border-border dark:border-border p-6 space-y-4">
          <div className="flex items-center gap-3 border-b border-border dark:border-border pb-4">
            <Sliders className="h-5 w-5 text-muted-foreground" />
            <div>
              <h3 className="text-lg font-semibold text-foreground dark:text-foreground">Lead Capture &amp; Workflow</h3>
              <p className="text-xs text-muted-foreground">Which fields are required on new leads, plus response deadline and messaging defaults.</p>
            </div>
          </div>
          <div className="space-y-2 max-w-xs">
            <Label htmlFor="slaHours">Response deadline (hours)</Label>
            <Input id="slaHours" type="number" min={0} value={f.slaHours}
              onChange={(e) => set("slaHours", e.target.value)} placeholder="e.g. 24 — blank to disable" />
            <p className="text-xs text-muted-foreground">A new lead unactioned this long alerts its owner. Blank = off.</p>
          </div>
          <div className="space-y-2 max-w-md">
            <Label>Sequence send window (quiet hours)</Label>
            <div className="flex items-center gap-2">
              <Input aria-label="Send from hour" type="number" min={0} max={23} value={f.sequenceWindowStart}
                onChange={(e) => set("sequenceWindowStart", e.target.value)} placeholder="from (0–23)" className="w-28" />
              <span className="text-sm text-muted-foreground">to</span>
              <Input aria-label="Send until hour" type="number" min={1} max={24} value={f.sequenceWindowEnd}
                onChange={(e) => set("sequenceWindowEnd", e.target.value)} placeholder="to (1–24)" className="w-28" />
            </div>
            <p className="text-xs text-muted-foreground">Drip steps only send between these hours ({f.timezone || "UTC"}); steps due outside defer to the next window. Blank = send any time.</p>
          </div>
          <div className="space-y-2 max-w-xs">
            <Label htmlFor="whatsappMode">WhatsApp sending</Label>
            <NativeSelect id="whatsappMode" value={f.whatsappMode} onChange={(e) => set("whatsappMode", e.target.value)}>
              <option value="personal">Personal number (one-tap, opens WhatsApp)</option>
              <option value="bsp">Business API (send in-app)</option>
            </NativeSelect>
            <p className="text-xs text-muted-foreground">
              Personal opens WhatsApp with the message ready to send from your own number. Business API sends directly and needs BSP setup.
            </p>
          </div>
          <div className="space-y-2 max-w-xs">
            <Label htmlFor="dailySummary">Morning team summary</Label>
            <NativeSelect id="dailySummary" value={f.dailySummary} onChange={(e) => set("dailySummary", e.target.value)}>
              <option value="1">On — email admins at 8 AM</option>
              <option value="0">Off</option>
            </NativeSelect>
            <p className="text-xs text-muted-foreground">
              Overdue follow-ups, meetings without an outcome, today&apos;s meetings and new or unassigned leads — sent around 8 AM ({f.timezone || "UTC"}) on days there&apos;s something to act on.
            </p>
          </div>
          <div className="space-y-2 pt-2 border-t border-border dark:border-border">
            <Label className="text-sm">Required fields on new leads</Label>
            <div className="flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-3 py-1.5 text-sm text-muted-foreground">
                <Lock className="h-3.5 w-3.5" /> Name
              </span>
              {LEAD_FIELDS.map(({ key, label }) => {
                const on = requiredFields.includes(key);
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setRequiredFields((prev) => (on ? prev.filter((k) => k !== key) : [...prev, key]))}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors ${
                      on ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:border-foreground/30"
                    }`}
                  >
                    {on ? <Check className="h-3.5 w-3.5 text-primary" /> : <span className="h-3.5 w-3.5" />}
                    {label}
                    <span className="text-xs opacity-70">{on ? "required" : "optional"}</span>
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">
              Name is always required. Need more? Mark any field required in{" "}
              <Link href="/settings/custom-fields" className="underline underline-offset-2">Custom Fields</Link>.
            </p>
          </div>
        </div>

        <div className="flex justify-end">
          <Button type="submit" disabled={saving || !f.name.trim()}>
            {saving ? "Saving..." : "Save Settings"}
          </Button>
        </div>
      </form>

      {/* Core Lead & Workflow Configuration Card */}
      <div className="bg-card dark:bg-secondary rounded-2xl border border-border dark:border-border p-6 space-y-4">
        <div className="flex items-center gap-3 border-b border-border dark:border-border pb-4">
          <Sliders className="h-5 w-5 text-muted-foreground" />
          <div>
            <h3 className="text-lg font-semibold text-foreground dark:text-foreground">Lead & Pipeline Management</h3>
            <p className="text-xs text-muted-foreground">Configure status taxonomies, sources, team roles, and message templates.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <button
            type="button"
            onClick={() => setStatusModalOpen(true)}
            className="flex items-start gap-3 p-4 rounded-lg border border-border dark:border-border hover:border-border dark:hover:border-border bg-muted dark:bg-secondary text-left transition-all group"
          >
            <Tag className="h-5 w-5 text-muted-foreground mt-0.5" />
            <div>
              <div className="font-semibold text-sm group-hover:text-muted-foreground text-foreground dark:text-foreground">
                Lead Status Schema & Analytics
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                Custom status badges, category workflows, and stage duration metrics.
              </div>
            </div>
          </button>

          <Link
            href="/settings/sources"
            className="flex items-start gap-3 p-4 rounded-lg border border-border dark:border-border hover:border-border dark:hover:border-border bg-muted dark:bg-secondary text-left transition-all group"
          >
            <Database className="h-5 w-5 text-muted-foreground mt-0.5" />
            <div>
              <div className="font-semibold text-sm group-hover:text-muted-foreground text-foreground dark:text-foreground">
                Lead Sources & Webhooks
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                Manage Meta Lead Ads, custom webforms, and integration API secrets.
              </div>
            </div>
          </Link>

          <Link
            href="/settings/templates"
            className="flex items-start gap-3 p-4 rounded-lg border border-border dark:border-border hover:border-border dark:hover:border-border bg-muted dark:bg-secondary text-left transition-all group"
          >
            <MessageSquare className="h-5 w-5 text-muted-foreground mt-0.5" />
            <div>
              <div className="font-semibold text-sm group-hover:text-muted-foreground text-foreground dark:text-foreground">
                WhatsApp Message Templates
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                Define pre-approved outreach message templates and auto-replies.
              </div>
            </div>
          </Link>

          <Link
            href="/settings/users"
            className="flex items-start gap-3 p-4 rounded-lg border border-border dark:border-border hover:border-border dark:hover:border-border bg-muted dark:bg-secondary text-left transition-all group"
          >
            <Users className="h-5 w-5 text-muted-foreground mt-0.5" />
            <div>
              <div className="font-semibold text-sm group-hover:text-muted-foreground text-foreground dark:text-foreground">
                Users, Roles & Teams
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                Invite team members, assign RBAC roles, and set sales capacity limits.
              </div>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}
