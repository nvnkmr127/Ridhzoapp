"use client";

import * as React from "react";
import { Sparkles, Mail, Copy, RefreshCw, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  updateEnrichmentAction,
  setInboundEmailAction,
  rotateInboundTokenAction,
  updateCapiAction,
  sendTestCapiEventAction,
  updateCapiStageMapAction,
} from "@/lib/actions/tenantIntegrations";

type View = {
  enrichmentEnabled: boolean;
  enrichmentApiUrl: string | null;
  enrichmentAuthHeader: string | null;
  hasEnrichmentAuthValue: boolean;
  enrichmentTimeoutMs: number | null;
  inboundEmailEnabled: boolean;
  inboundEmailToken: string | null;
  capiEnabled: boolean;
  capiPixelId: string | null;
  hasCapiAccessToken: boolean;
  capiTestEventCode: string | null;
  capiLeadStageMap: Record<string, string>;
};

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="relative inline-flex cursor-pointer items-center">
      <input type="checkbox" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <div className="h-6 w-11 rounded-full bg-muted peer-checked:bg-primary transition-colors" />
      <div className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-background transition-transform peer-checked:translate-x-5" />
    </label>
  );
}

export function LeadIntelligenceManager({ initial }: { initial: View }) {
  const { toast } = useToast();
  const [v, setV] = React.useState(initial);
  const [apiUrl, setApiUrl] = React.useState(initial.enrichmentApiUrl ?? "");
  const [authHeader, setAuthHeader] = React.useState(initial.enrichmentAuthHeader ?? "");
  const [authValue, setAuthValue] = React.useState("");
  const [timeoutMs, setTimeoutMs] = React.useState(initial.enrichmentTimeoutMs ? String(initial.enrichmentTimeoutMs) : "");
  const [enrichEnabled, setEnrichEnabled] = React.useState(initial.enrichmentEnabled);
  const [savingEnrich, setSavingEnrich] = React.useState(false);
  const [busyInbound, setBusyInbound] = React.useState(false);
  const [pixelId, setPixelId] = React.useState(initial.capiPixelId ?? "");
  const [accessToken, setAccessToken] = React.useState("");
  const [testEventCode, setTestEventCode] = React.useState(initial.capiTestEventCode ?? "");
  const [capiEnabled, setCapiEnabled] = React.useState(initial.capiEnabled);
  const [savingCapi, setSavingCapi] = React.useState(false);
  const [testingCapi, setTestingCapi] = React.useState(false);
  // Conversion Leads stage map, edited as rows so a tenant can rename/add/remove stages.
  const [stageRows, setStageRows] = React.useState<Array<{ status: string; event: string }>>(
    Object.entries(initial.capiLeadStageMap ?? {}).map(([status, event]) => ({ status, event })),
  );
  const [savingStageMap, setSavingStageMap] = React.useState(false);

  const webhookUrl =
    v.inboundEmailToken && typeof window !== "undefined"
      ? `${window.location.origin}/api/webhooks/email?token=${v.inboundEmailToken}`
      : null;

  async function saveEnrichment() {
    setSavingEnrich(true);
    try {
      const res = await updateEnrichmentAction({
        apiUrl,
        authHeader: authHeader || undefined,
        authValue: authValue || undefined,
        timeoutMs: timeoutMs ? Number(timeoutMs) : undefined,
        enabled: enrichEnabled,
      });
      if (!res.ok) {
        toast({ variant: "destructive", title: "Couldn't save", description: res.message });
        return;
      }
      setV((s) => ({ ...s, ...res.data }));
      setAuthValue("");
      toast({ title: "Lead insight settings saved" });
    } catch {
      toast({ variant: "destructive", title: "Couldn't save", description: "We couldn't reach the server." });
    } finally {
      setSavingEnrich(false);
    }
  }

  async function toggleInbound(enabled: boolean) {
    setBusyInbound(true);
    try {
      const res = await setInboundEmailAction(enabled);
      if (!res.ok) {
        toast({ variant: "destructive", title: "Couldn't update", description: res.message });
        return;
      }
      setV(res.data);
      toast({ title: enabled ? "Inbound email enabled" : "Inbound email disabled" });
    } finally {
      setBusyInbound(false);
    }
  }

  async function rotate() {
    setBusyInbound(true);
    try {
      const res = await rotateInboundTokenAction();
      if (!res.ok) {
        toast({ variant: "destructive", title: "Couldn't rotate", description: res.message });
        return;
      }
      setV(res.data);
      toast({ title: "New webhook URL generated", description: "Update it in your email provider." });
    } finally {
      setBusyInbound(false);
    }
  }

  async function saveCapi() {
    setSavingCapi(true);
    try {
      const res = await updateCapiAction({
        pixelId,
        accessToken: accessToken || undefined,
        testEventCode,
        enabled: capiEnabled,
      });
      if (!res.ok) {
        toast({ variant: "destructive", title: "Couldn't save", description: res.message });
        return;
      }
      setV((s) => ({ ...s, ...res.data }));
      setAccessToken("");
      toast({ title: "Meta Conversions settings saved" });
    } catch {
      toast({ variant: "destructive", title: "Couldn't save", description: "We couldn't reach the server." });
    } finally {
      setSavingCapi(false);
    }
  }

  async function saveStageMap() {
    setSavingStageMap(true);
    try {
      const map: Record<string, string> = {};
      for (const r of stageRows) {
        const status = r.status.trim().toLowerCase();
        const event = r.event.trim();
        if (status && event) map[status] = event;
      }
      const res = await updateCapiStageMapAction(map);
      if (!res.ok) {
        toast({ variant: "destructive", title: "Couldn't save stage mapping", description: res.message });
        return;
      }
      setV((prev) => ({ ...prev, capiLeadStageMap: (res.data as View).capiLeadStageMap }));
      toast({ title: "Conversion Leads mapping saved" });
    } catch {
      toast({ variant: "destructive", title: "Couldn't save stage mapping", description: "Please try again." });
    } finally {
      setSavingStageMap(false);
    }
  }

  async function testCapi() {
    setTestingCapi(true);
    try {
      const res = await sendTestCapiEventAction();
      if (!res.ok) {
        toast({ variant: "destructive", title: "Test event failed", description: res.message });
        return;
      }
      toast({ title: "Test event sent", description: "Check Meta Events Manager → Test Events." });
    } catch {
      toast({ variant: "destructive", title: "Test event failed", description: "We couldn't reach the server." });
    } finally {
      setTestingCapi(false);
    }
  }

  function copyUrl() {
    if (webhookUrl) {
      navigator.clipboard.writeText(webhookUrl);
      toast({ title: "Copied webhook URL" });
    }
  }

  return (
    <div className="space-y-6">
      {/* Enrichment */}
      <div className="rounded-2xl border p-5 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-violet-500" /> Lead enrichment
          </p>
          <Toggle checked={enrichEnabled} onChange={setEnrichEnabled} />
        </div>
        <p className="text-xs text-muted-foreground">
          When on, new leads are looked up against your data provider and observed facts (company,
          title, socials) are attached as evidence. Nothing is assumed about the provider — set the
          endpoint, the auth header, and the timeout to match yours.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label>Provider URL</Label>
            <Input value={apiUrl} onChange={(e) => setApiUrl(e.target.value)} placeholder="https://api.provider.com/enrich" autoCapitalize="none" />
          </div>
          <div>
            <Label>Auth header name</Label>
            <Input value={authHeader} onChange={(e) => setAuthHeader(e.target.value)} placeholder="Authorization" autoCapitalize="none" />
            <p className="mt-1 text-xs text-muted-foreground">Blank = Authorization. Or e.g. x-api-key.</p>
          </div>
          <div>
            <Label>Auth header value</Label>
            <PasswordInput
              value={authValue}
              onChange={(e) => setAuthValue(e.target.value)}
              placeholder={v.hasEnrichmentAuthValue ? "•••••••• (leave blank to keep)" : "Bearer sk-… or the raw key"}
              autoCapitalize="none"
            />
          </div>
          <div>
            <Label>Timeout (ms)</Label>
            <Input value={timeoutMs} onChange={(e) => setTimeoutMs(e.target.value)} placeholder="10000" inputMode="numeric" />
            <p className="mt-1 text-xs text-muted-foreground">Blank = 10000. Range 1000–60000.</p>
          </div>
        </div>
        <Button onClick={saveEnrichment} disabled={savingEnrich}>{savingEnrich ? "Saving…" : "Save"}</Button>
      </div>

      {/* Inbound email */}
      <div className="rounded-2xl border p-5 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium flex items-center gap-2">
            <Mail className="h-4 w-4 text-blue-500" /> Inbound email → timeline
          </p>
          <Toggle checked={v.inboundEmailEnabled} onChange={toggleInbound} />
        </div>
        <p className="text-xs text-muted-foreground">
          Forward parsed inbound email from your provider (Postmark, Mailgun, Resend, SendGrid) to
          the URL below. Replies land on the matching lead&apos;s timeline. Keep this URL secret.
        </p>
        {v.inboundEmailEnabled && webhookUrl && (
          <div className="space-y-2">
            <Label>Webhook URL</Label>
            <div className="flex gap-2">
              <Input readOnly value={webhookUrl} className="font-mono text-xs" onFocus={(e) => e.target.select()} />
              <Button variant="outline" size="icon" onClick={copyUrl} title="Copy"><Copy className="h-4 w-4" /></Button>
              <Button variant="outline" size="icon" onClick={rotate} disabled={busyInbound} title="Rotate"><RefreshCw className="h-4 w-4" /></Button>
            </div>
            <p className="text-xs text-muted-foreground">Rotating generates a new URL and invalidates the old one.</p>
          </div>
        )}
      </div>

      {/* Meta Conversions API */}
      <div className="rounded-2xl border p-5 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium flex items-center gap-2">
            <Target className="h-4 w-4 text-blue-600" /> Meta Conversions API
          </p>
          <Toggle checked={capiEnabled} onChange={setCapiEnabled} />
        </div>
        <p className="text-xs text-muted-foreground">
          Send server-side conversion events to Meta so ad campaigns optimise: a <strong>Lead</strong>
          {" "}event when a lead is captured and a <strong>Purchase</strong> event when it&apos;s won.
          Contact details are SHA-256 hashed before sending. Uses a Pixel/Dataset ID and a system-user
          access token.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>Pixel / Dataset ID</Label>
            <Input value={pixelId} onChange={(e) => setPixelId(e.target.value)} placeholder="1234567890" autoCapitalize="none" />
          </div>
          <div>
            <Label>Access token</Label>
            <PasswordInput
              value={accessToken}
              onChange={(e) => setAccessToken(e.target.value)}
              placeholder={v.hasCapiAccessToken ? "•••••••• (leave blank to keep)" : "System-user access token"}
              autoCapitalize="none"
            />
          </div>
          <div>
            <Label>Test event code <span className="text-muted-foreground">(optional)</span></Label>
            <Input value={testEventCode} onChange={(e) => setTestEventCode(e.target.value)} placeholder="TEST12345" autoCapitalize="none" />
            <p className="mt-1 text-xs text-muted-foreground">Routes events to Meta&apos;s Test Events tab while you verify.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={saveCapi} disabled={savingCapi}>{savingCapi ? "Saving…" : "Save"}</Button>
          <Button variant="outline" onClick={testCapi} disabled={testingCapi} className="gap-2">
            <Target className="h-4 w-4" /> {testingCapi ? "Sending…" : "Send test event"}
          </Button>
        </div>

        {/* Conversion Leads — CRM stage postback by Facebook lead_id */}
        <div className="mt-2 rounded-xl border border-dashed p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium">Conversion Leads (CRM postback)</p>
            <span
              className={`text-xs rounded-full px-2 py-0.5 ${
                v.capiEnabled ? "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300" : "bg-muted text-muted-foreground"
              }`}
            >
              {v.capiEnabled ? "Active" : "Enable Conversions above to activate"}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            When a Facebook-sourced lead changes status, its progress is reported back to Meta by
            lead ID so delivery optimises toward leads that convert. Map each CRM status to the Meta
            event name you configured under <strong>Events Manager → Conversion Leads</strong>.
          </p>

          <div className="space-y-2">
            {stageRows.map((row, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  value={row.status}
                  onChange={(e) => setStageRows((rows) => rows.map((r, j) => (j === i ? { ...r, status: e.target.value } : r)))}
                  placeholder="CRM status (e.g. qualified)"
                  autoCapitalize="none"
                  className="flex-1"
                />
                <span className="text-muted-foreground text-sm">→</span>
                <Input
                  value={row.event}
                  onChange={(e) => setStageRows((rows) => rows.map((r, j) => (j === i ? { ...r, event: e.target.value } : r)))}
                  placeholder="Meta event (e.g. converted)"
                  autoCapitalize="none"
                  className="flex-1"
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setStageRows((rows) => rows.filter((_, j) => j !== i))}
                  aria-label="Remove mapping"
                >
                  ✕
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
