"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { updateOrganizationAction } from "@/lib/actions/organizations";
import { StatusManagementModal } from "@/components/leads/StatusManagementModal";
import { AiContextDialog } from "@/components/settings/AiContextDialog";
import { Building, Globe, LocateFixed, Lock, Check, Sparkles, Clock, Calendar, Banknote, MessageCircle, BellRing, ListChecks, Tag, Copy, Wand2, UserPlus, CircleCheck, Circle } from "lucide-react";
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
  country?: string | null;
  requiredLeadFields?: string[] | null;
  slaHours?: number | null;
  whatsappMode?: string | null;
  dailySummary?: number | null;
  sequenceWindowStart?: number | null;
  sequenceWindowEnd?: number | null;
  workDays?: number[] | null;
  workStartHour?: number | null;
  workEndHour?: number | null;
  updatedAt?: string | Date | null;
};

const WEEK = [
  { d: 1, label: "Mon" }, { d: 2, label: "Tue" }, { d: 3, label: "Wed" }, { d: 4, label: "Thu" },
  { d: 5, label: "Fri" }, { d: 6, label: "Sat" }, { d: 0, label: "Sun" },
];

const LEAD_FIELDS: { key: string; label: string }[] = [
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "company", label: "Company" },
];

// Suggestions only (free text is still allowed) — the industries Ridhzo's owners are actually in.
const INDUSTRIES = [
  "Real Estate", "Education / Coaching", "Clinic / Healthcare", "Insurance", "Loans / Finance", "Travel & Tours",
  "Interior Design", "Solar", "Automobile", "Gym / Fitness", "Salon / Beauty", "Retail / Shop", "Manufacturing", "Events / Wedding",
];

const COUNTRIES: { code: string; name: string; dial: string }[] = [
  { code: "IN", name: "India", dial: "+91" }, { code: "AE", name: "UAE", dial: "+971" }, { code: "SA", name: "Saudi Arabia", dial: "+966" },
  { code: "QA", name: "Qatar", dial: "+974" }, { code: "KW", name: "Kuwait", dial: "+965" }, { code: "OM", name: "Oman", dial: "+968" },
  { code: "BH", name: "Bahrain", dial: "+973" }, { code: "NP", name: "Nepal", dial: "+977" }, { code: "BD", name: "Bangladesh", dial: "+880" },
  { code: "LK", name: "Sri Lanka", dial: "+94" }, { code: "SG", name: "Singapore", dial: "+65" }, { code: "GB", name: "United Kingdom", dial: "+44" },
  { code: "US", name: "United States", dial: "+1" }, { code: "CA", name: "Canada", dial: "+1" }, { code: "AU", name: "Australia", dial: "+61" },
];

const CURRENCIES: { code: string; name: string; symbol: string }[] = [
  { code: "INR", name: "Indian Rupee", symbol: "₹" },
  { code: "AED", name: "UAE Dirham", symbol: "د.إ" },
  { code: "USD", name: "US Dollar", symbol: "$" },
  { code: "EUR", name: "Euro", symbol: "€" },
  { code: "GBP", name: "British Pound", symbol: "£" },
  { code: "SGD", name: "Singapore Dollar", symbol: "S$" },
  { code: "AUD", name: "Australian Dollar", symbol: "A$" },
  { code: "CAD", name: "Canadian Dollar", symbol: "C$" },
  { code: "JPY", name: "Japanese Yen", symbol: "¥" },
];

// This is number/date *formatting*, not app language — the app UI is English. Listing Hindi/French
// here used to suggest the app would be translated.
const NUMBER_STYLES: { code: string; name: string }[] = [
  { code: "en-IN", name: "Indian — 1,23,456.50" },
  { code: "en", name: "International — 123,456.50" },
];

const INDIA = { timezone: "Asia/Kolkata", country: "IN", currency: "INR", dateFormat: "DD/MM/YYYY", locale: "en-IN" } as const;

const SLA_OPTIONS = [1, 2, 4, 8, 24, 48];

const PLAN_NAMES: Record<string, string> = { free: "Free", starter: "Starter", pro: "Starter", unlimited: "Unlimited", business: "Unlimited" };

// Real IANA timezone list from the runtime; fall back to a curated set on older browsers.
function timezoneList(): string[] {
  try {
    const zones = (Intl as any).supportedValuesOf?.("timeZone");
    if (Array.isArray(zones) && zones.length) return zones;
  } catch { /* fall through */ }
  return ["Asia/Kolkata", "Asia/Dubai", "Asia/Riyadh", "Asia/Singapore", "Europe/London", "America/New_York", "Australia/Sydney", "UTC"];
}

// 0 → "12 AM", 13 → "1 PM", 24 → "12 AM (midnight)"
function hourLabel(h: number): string {
  if (h === 24) return "12 AM (midnight)";
  const suffix = h < 12 ? "AM" : "PM";
  return `${h % 12 === 0 ? 12 : h % 12} ${suffix}`;
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

function Section({ icon: Icon, title, desc, children, action, id }: {
  icon: React.ElementType; title: string; desc: string; children: React.ReactNode; action?: React.ReactNode; id?: string;
}) {
  return (
    <section id={id} className="scroll-mt-24 bg-card dark:bg-secondary rounded-2xl border border-border p-6 space-y-5">
      <div className="flex items-start justify-between gap-3 border-b border-border pb-4">
        <div className="flex items-center gap-3">
          <Icon className="h-5 w-5 text-muted-foreground" />
          <div>
            <h3 className="text-lg font-semibold text-foreground">{title}</h3>
            <p className="text-xs text-muted-foreground">{desc}</p>
          </div>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

const Hint = ({ children }: { children: React.ReactNode }) => <p className="text-xs text-muted-foreground">{children}</p>;

// Keeps a saved value selectable even when it isn't one of the curated options (e.g. an old "fr" locale).
const withCurrent = <T extends { code: string }>(list: T[], current: string, make: (c: string) => T) =>
  current && !list.some((o) => o.code === current) ? [...list, make(current)] : list;

export function GeneralSettingsForm({
  organization,
  whatsappApiReady = false,
  hasLeadSource = false,
  seats,
}: {
  organization?: Org | null;
  whatsappApiReady?: boolean;
  hasLeadSource?: boolean;
  seats?: { current: number; max: number };
}) {
  const { toast } = useToast();
  const [saving, setSaving] = React.useState(false);
  const [statusModalOpen, setStatusModalOpen] = React.useState(false);
  const [requiredFields, setRequiredFields] = React.useState<string[]>(
    organization?.requiredLeadFields ?? ["name"],
  );
  const [workDays, setWorkDays] = React.useState<number[]>(organization?.workDays ?? [1, 2, 3, 4, 5, 6]);
  // Version the form loaded with — sent back on save so a concurrent edit is caught, not clobbered.
  const [expectedUpdatedAt, setExpectedUpdatedAt] = React.useState<string | null>(
    organization?.updatedAt ? new Date(organization.updatedAt).toISOString() : null,
  );
  const [f, setF] = React.useState({
    name: organization?.name ?? "",
    timezone: organization?.timezone ?? INDIA.timezone,
    locale: organization?.locale ?? INDIA.locale,
    currency: organization?.currency ?? INDIA.currency,
    dateFormat: organization?.dateFormat ?? INDIA.dateFormat,
    industry: organization?.industry ?? "",
    aiContext: organization?.aiContext ?? "",
    phone: organization?.phone ?? "",
    website: organization?.website ?? "",
    addressLine1: organization?.addressLine1 ?? "",
    city: organization?.city ?? "",
    country: organization?.country ?? "",
    slaHours: organization?.slaHours != null ? String(organization.slaHours) : "",
    whatsappMode: organization?.whatsappMode ?? "personal",
    dailySummary: organization?.dailySummary === 0 ? "0" : "1",
    sequenceWindowStart: organization?.sequenceWindowStart != null ? String(organization.sequenceWindowStart) : "",
    sequenceWindowEnd: organization?.sequenceWindowEnd != null ? String(organization.sequenceWindowEnd) : "",
    workStartHour: String(organization?.workStartHour ?? 9),
    workEndHour: String(organization?.workEndHour ?? 20),
  });

  // Prompt user before leaving with unsaved changes
  const [dirty, setDirty] = React.useState(false);
  const set = (k: keyof typeof f, v: string) => {
    setDirty(true);
    setF((s) => ({ ...s, [k]: v }));
  };

  const tzList = React.useMemo(() => timezoneList(), []);
  const [now, setNow] = React.useState<Date | null>(null);
  const [origin, setOrigin] = React.useState("");
  React.useEffect(() => {
    setNow(new Date());
    setOrigin(window.location.origin);
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const preview = React.useMemo(() => {
    // Same Intl calls the app uses (lib/format.ts), so this preview is exactly what dates look like.
    let tzTime = "—:—";
    let date = "";
    try {
      if (now) {
        tzTime = new Intl.DateTimeFormat(f.locale || "en", { hour: "2-digit", minute: "2-digit", timeZone: f.timezone || "UTC" }).format(now);
        date = new Intl.DateTimeFormat(f.locale || "en", { dateStyle: "medium", timeZone: f.timezone || "UTC" }).format(now);
      }
    } catch { /* invalid timezone while typing */ }
    let money = "";
    try {
      money = new Intl.NumberFormat(f.locale || "en", { style: "currency", currency: f.currency || "INR" }).format(123456.5);
    } catch { money = `${f.currency} 123,456.50`; }
    return { tzTime, date, money };
  }, [now, f.locale, f.timezone, f.currency]);

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

  const isIndiaSetup = (Object.keys(INDIA) as (keyof typeof INDIA)[]).every((k) => f[k] === INDIA[k]);
  const applyIndia = () => {
    setDirty(true);
    setF((s) => ({ ...s, ...INDIA }));
  };

  const bookingUrl = organization?.slug && origin ? `${origin}/book/${organization.slug}` : "";
  const copyBooking = () =>
    navigator.clipboard?.writeText(bookingUrl).then(
      () => toast({ title: "Booking link copied", description: "Share it on WhatsApp so customers can pick a time." }),
      () => toast({ variant: "destructive", title: "Copy failed" }),
    );

  const countries = withCurrent(COUNTRIES, f.country, (c) => ({ code: c, name: c, dial: "" }));
  const currencies = withCurrent(CURRENCIES, f.currency, (c) => ({ code: c, name: c, symbol: "" }));
  const numberStyles = withCurrent(NUMBER_STYLES, f.locale, (c) => ({ code: c, name: c }));
  const slaOptions = f.slaHours && !SLA_OPTIONS.includes(Number(f.slaHours)) ? [...SLA_OPTIONS, Number(f.slaHours)] : SLA_OPTIONS;
  const plan = organization?.plan ?? "free";

  // Setup score: the few things that make Ridhzo actually work for this business. Uses the live form
  // values, so ticking happens as they type (saved or not — the Save bar covers that).
  const setup = [
    { done: !!f.name.trim() && !/'s Workspace$/.test(f.name.trim()), label: "Add your business name", href: "#org-name" },
    { done: !!f.industry.trim(), label: "Choose your type of business", href: "#industry" },
    { done: !!f.aiContext.trim(), label: "Tell AI about your business", href: "#ai-context" },
    { done: !!f.phone.trim(), label: "Add your business phone", href: "#phone" },
    { done: !!f.country, label: "Set your country (for +91 on numbers)", href: "#country" },
    { done: hasLeadSource, label: "Connect where your leads come from", href: "/settings/sources" },
  ];
  const setupDone = setup.filter((s) => s.done).length;

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

    const start = f.sequenceWindowStart, end = f.sequenceWindowEnd;
    if ((start === "") !== (end === "")) {
      toast({ variant: "destructive", title: "Pick both message hours", description: "Choose a start and an end time, or set both to Any time." });
      return;
    }

    if (workDays.length === 0) {
      toast({ variant: "destructive", title: "Pick at least one working day" });
      return;
    }
    if (Number(f.workStartHour) >= Number(f.workEndHour)) {
      toast({ variant: "destructive", title: "Check your business hours", description: "Closing time must be after opening time." });
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
        sequenceWindowStart: start === "" ? null : Number(start),
        sequenceWindowEnd: end === "" ? null : Number(end),
        requiredLeadFields: requiredFields as ("name" | "email" | "phone" | "company")[],
        workDays,
        workStartHour: Number(f.workStartHour),
        workEndHour: Number(f.workEndHour),
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
      toast({ title: "Settings saved" });
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
        {setupDone < setup.length && (
          <section className="rounded-2xl border border-primary/20 bg-primary/5 p-5 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <p className="font-medium">Setup: {setupDone} of {setup.length} done</p>
              <span className="text-xs text-muted-foreground">Finish these so AI, reminders and WhatsApp work properly</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
              <div className="h-full bg-primary transition-all" style={{ width: `${(setupDone / setup.length) * 100}%` }} />
            </div>
            <ul className="grid gap-1.5 sm:grid-cols-2">
              {setup.map((s) => (
                <li key={s.label}>
                  <a href={s.href} className={`flex items-center gap-2 text-sm ${s.done ? "text-muted-foreground line-through" : "hover:underline underline-offset-2"}`}>
                    {s.done ? <CircleCheck className="h-4 w-4 text-emerald-600" /> : <Circle className="h-4 w-4 text-muted-foreground" />}
                    {s.label}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* 1. The business */}
        <Section
          icon={Building}
          title="Your business"
          desc="Shown to customers on your booking page and used by AI when it writes messages."
          action={
            <Link href="/settings/billing" className="shrink-0 rounded-full border border-border px-3 py-1 text-xs text-muted-foreground hover:text-foreground">
              {PLAN_NAMES[plan] ?? plan} plan · Manage
            </Link>
          }
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="org-name">Business name *</Label>
              <Input id="org-name" value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Sai Properties" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="industry">Type of business</Label>
              <Input id="industry" list="industry-list" value={f.industry} onChange={(e) => set("industry", e.target.value)} placeholder="Pick or type, e.g. Real Estate" />
              <datalist id="industry-list">{INDUSTRIES.map((i) => <option key={i} value={i} />)}</datalist>
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Business phone</Label>
              <Input id="phone" type="tel" value={f.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+91 98765 43210" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="website">Website <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Input id="website" value={f.website} onChange={(e) => set("website", e.target.value)} placeholder="www.yourbusiness.in" />
            </div>
            <div id="ai-context" className="space-y-2 md:col-span-2 scroll-mt-24">
              <Label>Tell AI about your business</Label>
              <div className="flex items-start gap-3 rounded-md border border-input bg-background p-3">
                <p className={`flex-1 text-sm whitespace-pre-wrap line-clamp-3 ${f.aiContext.trim() ? "text-foreground/90" : "text-muted-foreground"}`}>
                  {f.aiContext.trim() || "Not added yet — AI replies will sound generic. Add what you sell, your prices and your service areas."}
                </p>
                <AiContextDialog
                  initial={f.aiContext}
                  onSaved={(t, at) => {
                    setF((s) => ({ ...s, aiContext: t }));
                    if (at) setExpectedUpdatedAt(at);
                  }}
                >
                  <Button type="button" variant="outline" size="sm" className="gap-2 shrink-0">
                    <Sparkles className="h-4 w-4" /> {f.aiContext.trim() ? "Edit" : "Add"}
                  </Button>
                </AiContextDialog>
              </div>
              <Hint>Upload a brochure or type a few lines. AI uses this for reply drafts, lead summaries and follow-up messages. Saves on its own.</Hint>
            </div>
            <div className="space-y-2">
              <Label htmlFor="address">Shop / office address</Label>
              <Input id="address" value={f.addressLine1} onChange={(e) => set("addressLine1", e.target.value)} placeholder="Shop no., street, area" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="city">City</Label>
              <Input id="city" value={f.city} onChange={(e) => set("city", e.target.value)} placeholder="e.g. Vijayawada" />
            </div>
            <div className="md:col-span-2">
              <Hint>The address is shown to customers who book an in-person visit.</Hint>
            </div>
          </div>

          {seats && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border p-3">
              <div className="text-sm">
                <span className="font-medium">Your team</span>
                <span className="text-muted-foreground">
                  {" "}· {seats.current} {seats.current === 1 ? "person" : "people"}
                  {seats.max !== Infinity && ` of ${seats.max} allowed on your plan`}
                </span>
              </div>
              <Button asChild type="button" variant="outline" size="sm" className="gap-1.5">
                <Link href={seats.max !== Infinity && seats.current >= seats.max ? "/settings/billing" : "/settings/users"}>
                  <UserPlus className="h-3.5 w-3.5" />
                  {seats.max !== Infinity && seats.current >= seats.max ? "Upgrade to add people" : "Invite a teammate"}
                </Link>
              </Button>
            </div>
          )}

          {bookingUrl && (
            <div className="rounded-xl border border-border bg-muted/40 p-3 space-y-1">
              <Label className="text-xs text-muted-foreground">Your booking page — share it so customers can book a call or visit</Label>
              <div className="flex items-center gap-2">
                <code className="flex-1 truncate text-sm">{bookingUrl}</code>
                <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={copyBooking}>
                  <Copy className="h-3.5 w-3.5" /> Copy
                </Button>
              </div>
            </div>
          )}
        </Section>

        {/* 2. Region & formats */}
        <Section
          icon={Globe}
          title="Country, time & money"
          desc="Sets your time zone, the phone code added to numbers, and how prices and dates look."
          action={
            !isIndiaSetup && (
              <Button type="button" variant="outline" size="sm" className="shrink-0 gap-1.5" onClick={applyIndia}>
                <Wand2 className="h-3.5 w-3.5" /> Use India settings
              </Button>
            )
          }
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="country">Country</Label>
              <NativeSelect id="country" value={f.country} onChange={(e) => set("country", e.target.value)}>
                <option value="">Not set</option>
                {countries.map((c) => <option key={c.code} value={c.code}>{c.name}{c.dial ? ` (${c.dial})` : ""}</option>)}
              </NativeSelect>
              <Hint>Numbers saved without a code (like 98765 43210) get this code, so WhatsApp and call buttons work.</Hint>
            </div>
            <div className="space-y-2">
              <Label htmlFor="timezone">Time zone</Label>
              <div className="flex gap-2">
                <Input id="timezone" list="tz-list" value={f.timezone} onChange={(e) => set("timezone", e.target.value)}
                  placeholder="e.g. Asia/Kolkata" className="flex-1" />
                <Button type="button" variant="outline" size="icon" title="Use my device's time zone"
                  onClick={() => { try { set("timezone", Intl.DateTimeFormat().resolvedOptions().timeZone); } catch {} }}>
                  <LocateFixed className="h-4 w-4" />
                </Button>
              </div>
              <datalist id="tz-list">{tzList.map((z) => <option key={z} value={z} />)}</datalist>
              <Hint>Reminders, the morning summary and message hours follow this time.</Hint>
            </div>
            <div className="space-y-2">
              <Label htmlFor="currency">Currency</Label>
              <NativeSelect id="currency" value={f.currency} onChange={(e) => set("currency", e.target.value)}>
                {currencies.map((c) => <option key={c.code} value={c.code}>{c.symbol ? `${c.symbol} ` : ""}{c.name}</option>)}
              </NativeSelect>
            </div>
            <div className="space-y-2">
              <Label htmlFor="locale">Number &amp; date style</Label>
              <NativeSelect id="locale" value={f.locale} onChange={(e) => set("locale", e.target.value)}>
                {numberStyles.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}
              </NativeSelect>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-6 gap-y-1 rounded-xl bg-muted/50 px-4 py-3 text-sm">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Looks like</span>
            <span className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5 text-muted-foreground" /> {preview.tzTime}</span>
            <span className="flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5 text-muted-foreground" /> {preview.date}</span>
            <span className="flex items-center gap-1.5"><Banknote className="h-3.5 w-3.5 text-muted-foreground" /> {preview.money}</span>
          </div>
        </Section>

        {/* 3. Messaging */}
        <Section icon={MessageCircle} title="WhatsApp & messages" desc="How messages to your leads are sent.">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="whatsappMode">Send WhatsApp from</Label>
              <NativeSelect id="whatsappMode" value={f.whatsappMode} onChange={(e) => set("whatsappMode", e.target.value)}>
                <option value="personal">My own WhatsApp (recommended)</option>
                {/* Keep "bsp" selectable if it's already saved, so the form shows the truth. */}
                <option value="bsp" disabled={!whatsappApiReady && f.whatsappMode !== "bsp"}>
                  WhatsApp Business API (sends automatically){whatsappApiReady ? "" : " — not set up"}
                </option>
              </NativeSelect>
              <Hint>
                {f.whatsappMode === "bsp" && !whatsappApiReady
                  ? "⚠️ Business API isn't connected yet, so messages won't send. Switch to your own WhatsApp, or ask Ridhzo support to connect it."
                  : f.whatsappMode === "bsp"
                    ? "Messages and auto-replies go out without you tapping send."
                    : "Tap send and WhatsApp opens with the message ready, from your own number. Nothing to set up. Auto-replies need the Business API."}
              </Hint>
            </div>
            <div className="space-y-2">
              <Label>Automatic follow-ups only between</Label>
              <div className="flex items-center gap-2">
                <NativeSelect aria-label="From" value={f.sequenceWindowStart} onChange={(e) => set("sequenceWindowStart", e.target.value)}>
                  <option value="">Any time</option>
                  {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{hourLabel(h)}</option>)}
                </NativeSelect>
                <span className="text-sm text-muted-foreground">and</span>
                <NativeSelect aria-label="Until" value={f.sequenceWindowEnd} onChange={(e) => set("sequenceWindowEnd", e.target.value)}>
                  <option value="">Any time</option>
                  {Array.from({ length: 24 }, (_, i) => i + 1).map((h) => <option key={h} value={h}>{hourLabel(h)}</option>)}
                </NativeSelect>
              </div>
              <Hint>Follow-up messages due at night wait until the morning, so customers aren&apos;t disturbed. Tip: 9 AM to 8 PM.</Hint>
            </div>
          </div>
        </Section>

        {/* 4. Alerts */}
        <Section id="business-hours" icon={BellRing} title="Business hours & alerts" desc="When you're open, and how Ridhzo reminds you so no lead is forgotten.">
          <div className="space-y-2">
            <Label>Open on</Label>
            <div className="flex flex-wrap gap-2">
              {WEEK.map(({ d, label }) => {
                const on = workDays.includes(d);
                return (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={on}
                    onClick={() => { setDirty(true); setWorkDays((prev) => (on ? prev.filter((x) => x !== d) : [...prev, d])); }}
                    className={`min-w-12 rounded-full border px-3 py-1.5 text-sm transition-colors ${
                      on ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:border-foreground/30"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            <div className="flex max-w-md items-center gap-2">
              <NativeSelect aria-label="Opens at" value={f.workStartHour} onChange={(e) => set("workStartHour", e.target.value)}>
                {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{hourLabel(h)}</option>)}
              </NativeSelect>
              <span className="text-sm text-muted-foreground">to</span>
              <NativeSelect aria-label="Closes at" value={f.workEndHour} onChange={(e) => set("workEndHour", e.target.value)}>
                {Array.from({ length: 24 }, (_, i) => i + 1).map((h) => <option key={h} value={h}>{hourLabel(h)}</option>)}
              </NativeSelect>
            </div>
            <Hint>No morning summary on days you&apos;re closed, and &quot;not contacted&quot; alerts wait until you open — no pings at night.</Hint>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-border pt-4">
            <div className="space-y-2">
              <Label htmlFor="slaHours">Alert me if a new lead isn&apos;t contacted within</Label>
              <NativeSelect id="slaHours" value={f.slaHours} onChange={(e) => set("slaHours", e.target.value)}>
                <option value="">Don&apos;t alert</option>
                {slaOptions.map((h) => <option key={h} value={h}>{h} hour{h === 1 ? "" : "s"}</option>)}
              </NativeSelect>
              <Hint>The lead&apos;s owner gets an alert. Leads contacted fast are far more likely to buy.</Hint>
            </div>
            <div className="space-y-2">
              <Label htmlFor="dailySummary">Morning summary (8 AM)</Label>
              <NativeSelect id="dailySummary" value={f.dailySummary} onChange={(e) => set("dailySummary", e.target.value)}>
                <option value="1">On for everyone</option>
                <option value="0">Off for the whole team</option>
              </NativeSelect>
              <Hint>Each person gets a phone notification with today&apos;s follow-ups and new leads. Anyone can turn off their own copy in Profile.</Hint>
            </div>
          </div>
        </Section>

        {/* 5. New lead rules */}
        <Section icon={ListChecks} title="Details needed for a new lead" desc="What must be filled in before a lead can be saved.">
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
                  onClick={() => { setDirty(true); setRequiredFields((prev) => (on ? prev.filter((k) => k !== key) : [...prev, key])); }}
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
          <Hint>
            Applies when your team adds a lead by hand. Leads from ads and forms are always saved — if something is missing they&apos;re tagged
            <b> missing-info</b> so you can ask for it. Need your own fields (budget, location…)? Add them in{" "}
            <Link href="/settings/custom-fields" className="underline underline-offset-2">Custom fields</Link>.
          </Hint>
        </Section>

        <div className="sticky bottom-0 z-10 -mx-1 flex items-center justify-end gap-3 rounded-xl border border-border bg-background/95 px-4 py-3 backdrop-blur">
          {dirty && <span className="text-sm text-muted-foreground">You have unsaved changes</span>}
          <Button type="submit" disabled={saving || !f.name.trim() || !dirty}>
            {saving ? "Saving..." : "Save changes"}
          </Button>
        </div>
      </form>

      {/* Lead stages live in their own modal (saved there, not by the form above). */}
      <Section
        icon={Tag}
        title="Lead stages"
        desc="The steps a lead moves through — e.g. New → Interested → Site visit → Won. Rename or add stages to match how you sell."
        action={<Button type="button" variant="outline" size="sm" className="shrink-0" onClick={() => setStatusModalOpen(true)}>Edit stages</Button>}
      >
        <Hint>Stages appear on every lead, in the pipeline board, and in reports. Changes save as soon as you make them.</Hint>
      </Section>
    </div>
  );
}
