"use client";

import * as React from "react";
import { Sparkles, Mail, Copy, RefreshCw, Target, X, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import type { ActionResult } from "@/lib/actions/result";
import type { TenantIntegrationsView as View } from "@/domains/organizations/tenantIntegrationsService";
import {
  updateEnrichmentAction,
  testEnrichmentAction,
  disconnectEnrichmentAction,
  setInboundEmailAction,
  rotateInboundTokenAction,
  updateCapiAction,
  disconnectCapiAction,
  sendTestCapiEventAction,
  updateCapiStageMapAction,
} from "@/lib/actions/tenantIntegrations";

type Status = { key: string; label: string };
type FieldErrors = Record<string, string>;

function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <label className={`relative inline-flex items-center ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}>
      <input
        type="checkbox"
        role="switch"
        aria-label={label}
        className="peer sr-only"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <div className="h-6 w-11 rounded-full bg-muted transition-colors peer-checked:bg-primary peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2" />
      <div className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-background transition-transform peer-checked:translate-x-5" />
    </label>
  );
}

function FieldError({ msg }: { msg?: string }) {
  return msg ? <p className="mt-1 text-xs text-destructive">{msg}</p> : null;
}

export function LeadIntelligenceManager({ initial, webhookBase, statuses }: { initial: View; webhookBase: string; statuses: Status[] }) {
  const { toast } = useToast();
  const [v, setV] = React.useState(initial);

  // Enrichment form
  const [apiUrl, setApiUrl] = React.useState(initial.enrichmentApiUrl ?? "");
  const [authHeader, setAuthHeader] = React.useState(initial.enrichmentAuthHeader ?? "");
  const [authValue, setAuthValue] = React.useState("");
  const [sampleEmail, setSampleEmail] = React.useState("");
  const [enrichErrors, setEnrichErrors] = React.useState<FieldErrors>({});
  const [busyEnrich, setBusyEnrich] = React.useState<null | "save" | "test" | "disconnect">(null);

  // Inbound
  const [busyInbound, setBusyInbound] = React.useState(false);

  // CAPI form
  const [pixelId, setPixelId] = React.useState(initial.capiPixelId ?? "");
  const [accessToken, setAccessToken] = React.useState("");
  const [testEventCode, setTestEventCode] = React.useState(initial.capiTestEventCode ?? "");
  const [capiErrors, setCapiErrors] = React.useState<FieldErrors>({});
  const [busyCapi, setBusyCapi] = React.useState<null | "save" | "test" | "disconnect">(null);

  // Conversion Leads stage map, edited as rows. Until the tenant customises it, hide default rows
  // for statuses this workspace doesn't have — they could never fire.
  const statusKeys = new Set(statuses.map((s) => s.key));
  const [stageRows, setStageRows] = React.useState<Array<{ status: string; event: string }>>(() =>
    Object.entries(initial.capiLeadStageMap ?? {})
      .filter(([status]) => initial.capiLeadStageMapCustom || statusKeys.has(status))
      .map(([status, event]) => ({ status, event })),
  );
  const [savingStageMap, setSavingStageMap] = React.useState(false);

  const webhookUrl = v.inboundEmailToken ? `${webhookBase}?token=${v.inboundEmailToken}` : null;

  const enrichDirty = apiUrl !== (v.enrichmentApiUrl ?? "") || authHeader !== (v.enrichmentAuthHeader ?? "") || authValue !== "";
  const capiDirty = pixelId !== (v.capiPixelId ?? "") || testEventCode !== (v.capiTestEventCode ?? "") || accessToken !== "";

  /** Run an action and toast the outcome. Returns the data on success, null otherwise. */
  async function run<T>(
    call: () => Promise<ActionResult<T>>,
    failTitle: string,
    setErrors?: (e: FieldErrors) => void,
  ): Promise<T | null> {
    setErrors?.({});
    try {
      const res = await call();
      if (!res.ok) {
        setErrors?.(res.fieldErrors ?? {});
        toast({ variant: "destructive", title: failTitle, description: res.message });
        return null;
      }
      return res.data;
    } catch {
      toast({ variant: "destructive", title: failTitle, description: "We couldn't reach the server. Please try again." });
      return null;
    }
  }

  // ─── Enrichment ────────────────────────────────────────────────────────────
  async function saveEnrichment(enabled: boolean) {
    setBusyEnrich("save");
    const data = await run(
      () => updateEnrichmentAction({ apiUrl, authHeader, authValue: authValue || undefined, enabled }),
      "Couldn't save enrichment",
      setEnrichErrors,
    );
    setBusyEnrich(null);
    if (!data) return;
    setV(data);
    setAuthValue("");
    toast({ title: enabled === v.enrichmentEnabled ? "Enrichment settings saved" : enabled ? "Enrichment turned on" : "Enrichment turned off" });
  }

  async function testEnrichment() {
    setBusyEnrich("test");
    const data = await run(
      () => testEnrichmentAction({ apiUrl, authHeader, authValue: authValue || undefined, enabled: false, sampleEmail }),
      "Enrichment test failed",
      setEnrichErrors,
    );
    setBusyEnrich(null);
    if (!data) return;
    toast({
      title: "Provider connected",
      description: data.fields.length
        ? `It returned: ${data.fields.slice(0, 8).join(", ")}${data.fields.length > 8 ? "…" : ""}.`
        : "It answered but had no data for that email.",
    });
  }

  async function disconnectEnrichment() {
    if (!confirm("Remove the enrichment provider and its API key? New leads won't be enriched.")) return;
    setBusyEnrich("disconnect");
    const data = await run(() => disconnectEnrichmentAction(), "Couldn't remove provider");
    setBusyEnrich(null);
    if (!data) return;
    setV(data);
    setApiUrl("");
    setAuthHeader("");
    setAuthValue("");
    toast({ title: "Enrichment provider removed" });
  }

  // ─── Inbound email ─────────────────────────────────────────────────────────
  async function toggleInbound(enabled: boolean) {
    setBusyInbound(true);
    const data = await run(() => setInboundEmailAction(enabled), "Couldn't update inbound email");
    setBusyInbound(false);
    if (!data) return;
    setV(data);
    toast({ title: enabled ? "Inbound email turned on" : "Inbound email turned off" });
  }

  async function rotate() {
    if (!confirm("Generate a new webhook URL? The current URL stops working immediately — update it in your email provider right after.")) return;
    setBusyInbound(true);
    const data = await run(() => rotateInboundTokenAction(), "Couldn't generate a new URL");
    setBusyInbound(false);
    if (!data) return;
    setV(data);
    toast({ title: "New webhook URL generated", description: "Update it in your email provider." });
  }

  async function copyUrl() {
    if (!webhookUrl) return;
    try {
      await navigator.clipboard.writeText(webhookUrl);
      toast({ title: "Webhook URL copied" });
    } catch {
      toast({ variant: "destructive", title: "Couldn't copy", description: "Select the URL and copy it manually." });
    }
  }

  // ─── Meta CAPI ─────────────────────────────────────────────────────────────
  async function saveCapi(enabled: boolean) {
    setBusyCapi("save");
    const data = await run(
      () => updateCapiAction({ pixelId, accessToken: accessToken || undefined, testEventCode, enabled }),
      "Couldn't save Meta Conversions",
      setCapiErrors,
    );
    setBusyCapi(null);
    if (!data) return;
    setV(data);
    setAccessToken("");
    toast({ title: enabled === v.capiEnabled ? "Meta Conversions settings saved" : enabled ? "Meta Conversions turned on" : "Meta Conversions turned off" });
  }

  async function testCapi() {
    setBusyCapi("test");
    const data = await run(
      () => sendTestCapiEventAction({ pixelId, accessToken: accessToken || undefined, testEventCode, enabled: false }),
      "Test event failed",
      setCapiErrors,
    );
    setBusyCapi(null);
    if (data) toast({ title: "Test event sent", description: "Check Meta Events Manager → Test Events." });
  }

  async function disconnectCapi() {
    if (!confirm("Remove the Meta Pixel ID and access token? Conversions stop being sent to Meta.")) return;
    setBusyCapi("disconnect");
    const data = await run(() => disconnectCapiAction(), "Couldn't disconnect Meta");
    setBusyCapi(null);
    if (!data) return;
    setV(data);
    setPixelId("");
    setAccessToken("");
    setTestEventCode("");
    toast({ title: "Meta Conversions disconnected" });
  }

  async function saveStageMap() {
    const map: Record<string, string> = {};
    for (const r of stageRows) {
      const event = r.event.trim();
      if (!r.status || !event) continue;
      if (map[r.status]) {
        toast({ variant: "destructive", title: "Duplicate status", description: `"${r.status}" is mapped twice. Keep one row per status.` });
        return;
      }
      map[r.status] = event;
    }
    setSavingStageMap(true);
    const data = await run(() => updateCapiStageMapAction(map), "Couldn't save stage mapping");
    setSavingStageMap(false);
    if (!data) return;
    setV(data);
    toast({ title: "Conversion Leads mapping saved" });
  }

  const statusLabel = (key: string) => statuses.find((s) => s.key === key)?.label;

  return (
    <div className="space-y-6">
      {/* Enrichment */}
      <div className="rounded-2xl border p-5 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-violet-500" /> Lead enrichment
          </p>
          <Toggle label="Lead enrichment" checked={v.enrichmentEnabled} onChange={saveEnrichment} disabled={busyEnrich !== null} />
        </div>
        <p className="text-xs text-muted-foreground">
          When on, each new lead&apos;s email and company are sent to your data provider. What it finds
          (job title, company size, LinkedIn…) appears on the lead&apos;s score card, and fills the
          company field if it&apos;s empty — it never overwrites what your team entered.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="enrich-url">Provider URL</Label>
            <Input id="enrich-url" value={apiUrl} onChange={(e) => setApiUrl(e.target.value)} placeholder="https://api.provider.com/enrich" autoCapitalize="none" />
            <FieldError msg={enrichErrors.apiUrl} />
            <p className="mt-1 text-xs text-muted-foreground">
              We POST <code>{"{ email, company, name, phone }"}</code> and expect a JSON object back.
            </p>
          </div>
          <div>
            <Label htmlFor="enrich-key">API key</Label>
            <PasswordInput
              id="enrich-key"
              value={authValue}
              onChange={(e) => setAuthValue(e.target.value)}
              placeholder={v.hasEnrichmentAuthValue ? "•••••••• (leave blank to keep)" : "Bearer sk-… or the raw key"}
              autoCapitalize="none"
            />
            <FieldError msg={enrichErrors.authValue} />
          </div>
          <div>
            <Label htmlFor="enrich-header">Sent in header</Label>
            <Input id="enrich-header" value={authHeader} onChange={(e) => setAuthHeader(e.target.value)} placeholder="Authorization" autoCapitalize="none" />
            <FieldError msg={enrichErrors.authHeader} />
            <p className="mt-1 text-xs text-muted-foreground">Blank = Authorization. Some providers use x-api-key.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => saveEnrichment(v.enrichmentEnabled)} disabled={busyEnrich !== null || !enrichDirty}>
            {busyEnrich === "save" ? "Saving…" : "Save"}
          </Button>
          {enrichDirty && <span className="text-xs text-amber-600 dark:text-amber-400">Unsaved changes</span>}
          {(v.enrichmentApiUrl || v.hasEnrichmentAuthValue) && (
            <Button variant="ghost" className="ml-auto text-destructive" onClick={disconnectEnrichment} disabled={busyEnrich !== null}>
              {busyEnrich === "disconnect" ? "Removing…" : "Remove provider"}
            </Button>
          )}
        </div>
        <div className="flex flex-wrap items-start gap-2 border-t pt-4">
          <div className="min-w-0 flex-1">
            <Input
              aria-label="Email to test with"
              value={sampleEmail}
              onChange={(e) => setSampleEmail(e.target.value)}
              placeholder="Email to test with, e.g. someone@company.com"
              autoCapitalize="none"
              type="email"
            />
            <FieldError msg={enrichErrors.sampleEmail} />
          </div>
          <Button variant="outline" onClick={testEnrichment} disabled={busyEnrich !== null}>
            {busyEnrich === "test" ? "Testing…" : "Test connection"}
          </Button>
        </div>
      </div>

      {/* Inbound email */}
      <div className="rounded-2xl border p-5 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium flex items-center gap-2">
            <Mail className="h-4 w-4 text-blue-500" /> Email replies → lead timeline
          </p>
          <Toggle label="Email replies to lead timeline" checked={v.inboundEmailEnabled} onChange={toggleInbound} disabled={busyInbound} />
        </div>
        <p className="text-xs text-muted-foreground">
          When a lead replies to your email, the reply shows on their timeline, any running sequence
          stops, and AI tags the reply&apos;s intent. Set up inbound parsing in Postmark, Mailgun,
          SendGrid or Resend and point it at the URL below.
        </p>
        {v.inboundEmailEnabled && webhookUrl && (
          <div className="space-y-2">
            <Label htmlFor="inbound-url">Webhook URL</Label>
            <div className="flex gap-2">
              <Input id="inbound-url" readOnly value={webhookUrl} className="font-mono text-xs" onFocus={(e) => e.target.select()} />
              <Button variant="outline" size="icon" onClick={copyUrl} title="Copy" aria-label="Copy webhook URL"><Copy className="h-4 w-4" /></Button>
              <Button variant="outline" size="icon" onClick={rotate} disabled={busyInbound} title="Generate new URL" aria-label="Generate new webhook URL"><RefreshCw className="h-4 w-4" /></Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Keep this URL secret — it identifies your workspace. If it leaks, generate a new one.
            </p>
          </div>
        )}
      </div>

      {/* Meta Conversions API */}
      <div className="rounded-2xl border p-5 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium flex items-center gap-2">
            <Target className="h-4 w-4 text-blue-600" /> Meta Conversions API
          </p>
          <Toggle label="Meta Conversions API" checked={v.capiEnabled} onChange={saveCapi} disabled={busyCapi !== null} />
        </div>
        <p className="text-xs text-muted-foreground">
          Tell Meta which leads you got and which ones you won, so your ads find more people like
          them: a <strong>Lead</strong> event when a lead is added and a <strong>Purchase</strong> event
          (with the deal value) when it&apos;s won. Contact details are hashed before sending.
        </p>
        {v.capiTestEventCode && (
          <div className="flex gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>
              A test event code is saved, so <strong>all events go to Meta&apos;s Test Events tab</strong> and
              don&apos;t help your ads. Clear the code and save when you&apos;re done testing.
            </span>
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="capi-pixel">Pixel / Dataset ID</Label>
            <Input id="capi-pixel" value={pixelId} onChange={(e) => setPixelId(e.target.value)} placeholder="1234567890" autoCapitalize="none" inputMode="numeric" />
            <FieldError msg={capiErrors.pixelId} />
          </div>
          <div>
            <Label htmlFor="capi-token">Access token</Label>
            <PasswordInput
              id="capi-token"
              value={accessToken}
              onChange={(e) => setAccessToken(e.target.value)}
              placeholder={v.hasCapiAccessToken ? "•••••••• (leave blank to keep)" : "System-user access token"}
              autoCapitalize="none"
            />
            <FieldError msg={capiErrors.accessToken} />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="capi-test">Test event code <span className="text-muted-foreground">(only while testing)</span></Label>
            <Input id="capi-test" value={testEventCode} onChange={(e) => setTestEventCode(e.target.value)} placeholder="TEST12345" autoCapitalize="none" />
            <FieldError msg={capiErrors.testEventCode} />
            <p className="mt-1 text-xs text-muted-foreground">From Events Manager → Test Events. Needed to send a test event.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => saveCapi(v.capiEnabled)} disabled={busyCapi !== null || !capiDirty}>
            {busyCapi === "save" ? "Saving…" : "Save"}
          </Button>
          <Button variant="outline" onClick={testCapi} disabled={busyCapi !== null || !testEventCode.trim()} className="gap-2" title={testEventCode.trim() ? undefined : "Enter a test event code first"}>
            <Target className="h-4 w-4" /> {busyCapi === "test" ? "Sending…" : "Send test event"}
          </Button>
          {capiDirty && <span className="text-xs text-amber-600 dark:text-amber-400">Unsaved changes</span>}
          {(v.capiPixelId || v.hasCapiAccessToken) && (
            <Button variant="ghost" className="ml-auto text-destructive" onClick={disconnectCapi} disabled={busyCapi !== null}>
              {busyCapi === "disconnect" ? "Disconnecting…" : "Disconnect"}
            </Button>
          )}
        </div>

        {/* Conversion Leads — CRM stage postback by Facebook lead_id */}
        <div className="mt-2 rounded-xl border border-dashed p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium">Facebook lead stages (Conversion Leads)</p>
            <span
              className={`text-xs rounded-full px-2 py-0.5 ${
                v.capiEnabled ? "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300" : "bg-muted text-muted-foreground"
              }`}
            >
              {v.capiEnabled ? "Active" : "Turn on Meta Conversions to activate"}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            For leads from Facebook Lead Ads: when one moves to a status below, Meta is told so it can
            optimise for leads that progress. Use the event names you set up in
            <strong> Events Manager → Conversion Leads</strong>.
          </p>

          <div className="space-y-2">
            {stageRows.length === 0 && <p className="text-xs text-muted-foreground">No stages mapped — no stage updates are sent.</p>}
            {stageRows.map((row, i) => (
              <div key={i} className="flex items-center gap-2">
                <Select
                  value={row.status || undefined}
                  onValueChange={(status) => setStageRows((rows) => rows.map((r, j) => (j === i ? { ...r, status } : r)))}
                >
                  <SelectTrigger className="flex-1" aria-label="CRM status">
                    <SelectValue placeholder="CRM status" />
                  </SelectTrigger>
                  <SelectContent>
                    {statuses.map((s) => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}
                    {row.status && !statusLabel(row.status) && (
                      <SelectItem value={row.status}>{row.status} (status no longer exists)</SelectItem>
                    )}
                  </SelectContent>
                </Select>
                <span className="text-muted-foreground text-sm" aria-hidden>→</span>
                <Input
                  value={row.event}
                  onChange={(e) => setStageRows((rows) => rows.map((r, j) => (j === i ? { ...r, event: e.target.value } : r)))}
                  placeholder="Meta event, e.g. converted"
                  aria-label="Meta event name"
                  autoCapitalize="none"
                  className="flex-1"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setStageRows((rows) => rows.filter((_, j) => j !== i))}
                  aria-label="Remove mapping"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setStageRows((rows) => [...rows, { status: "", event: "" }])}>
              Add stage
            </Button>
            <Button size="sm" onClick={saveStageMap} disabled={savingStageMap}>
              {savingStageMap ? "Saving…" : "Save mapping"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
