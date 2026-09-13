"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  createSourceAction,
  toggleSourceAction,
  renameSourceAction,
  deleteSourceAction,
  connectFacebookPagesAction,
  updateSourceFormFilterAction,
  listFacebookFormsAction,
  syncPastFacebookLeadsAction,
} from "@/lib/actions/sources";
import {
  Copy,
  Globe,
  MessageSquare,
  ExternalLink,
  CheckCircle2,
  Sparkles,
  ShieldCheck,
  Pencil,
  Trash2,
  FileText,
  Plus,
  SlidersHorizontal,
  Filter,
  DownloadCloud,
  Loader2,
} from "lucide-react";
import { FormFieldsEditor } from "./FormFieldsEditor";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

function FacebookIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
    </svg>
  );
}

function LinkedInIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z" />
      <rect x="2" y="9" width="4" height="12" />
      <circle cx="4" cy="4" r="2" />
    </svg>
  );
}

type Source = {
  id: string;
  name: string;
  type: string | null;
  isActive: number;
  webhookSecret: string | null;
  config?: unknown;
};

interface IntegrationPlatformCard {
  id: string;
  name: string;
  typeKey: string;
  description: string;
  icon: React.ElementType;
  badge: string;
  brandColor: string;
  buttonText: string;
  buttonBg: string;
  docsUrl: string;
  available?: boolean; // false = not implemented yet; show "Coming soon" instead of a broken connect
}

const PLATFORMS: IntegrationPlatformCard[] = [
  {
    id: "facebook",
    name: "Facebook & Instagram Lead Ads",
    typeKey: "facebook_lead_ads",
    description: "Instant lead pulling from Meta Graph API with automatic form field mapping & Page OAuth refresh.",
    icon: FacebookIcon,
    badge: "Official Meta API",
    brandColor: "bg-muted border-border text-muted-foreground",
    buttonText: "Connect Facebook Lead Ads",
    buttonBg: "bg-secondary hover:bg-accent text-foreground",
    docsUrl: "https://developers.facebook.com/docs/marketing-api/guides/lead-ads",
  },
  {
    id: "google",
    name: "Google Lead Form Ads",
    typeKey: "google_lead_ads",
    description: "Real-time webhook ingestion for Google Ads campaign forms with keyword & column normalization.",
    icon: Globe,
    badge: "Google Ads Webhook",
    brandColor: "bg-muted border-border text-foreground",
    buttonText: "Connect Google Lead Ads",
    buttonBg: "bg-destructive hover:bg-accent text-foreground",
    docsUrl: "https://support.google.com/google-ads/answer/9360341",
  },
  {
    id: "linkedin",
    name: "LinkedIn Lead Gen Forms",
    typeKey: "linkedin_lead_gen",
    available: false,
    description: "Inbound B2B lead sync for LinkedIn sponsored content & lead generation campaigns.",
    icon: LinkedInIcon,
    badge: "B2B Lead Sync",
    brandColor: "bg-muted border-border text-muted-foreground",
    buttonText: "Connect LinkedIn Lead Gen",
    buttonBg: "bg-secondary hover:bg-accent text-foreground",
    docsUrl: "https://www.linkedin.com/help/linkedin/answer/a420556",
  },
  {
    id: "whatsapp",
    name: "WhatsApp Direct Inbound",
    typeKey: "whatsapp_inbound",
    available: false,
    description: "Capture inbound messages as leads with automated instant reply & round-robin assignment.",
    icon: MessageSquare,
    badge: "WhatsApp Cloud API",
    brandColor: "bg-muted border-border text-muted-foreground",
    buttonText: "Connect WhatsApp Business",
    buttonBg: "bg-secondary hover:bg-accent text-foreground",
    docsUrl: "https://developers.facebook.com/docs/whatsapp/cloud-api",
  },
  {
    id: "webhook",
    name: "Website Custom Webhook",
    typeKey: "generic_webhook",
    description: "Connect WordPress, Elementor, Webflow, or custom HTML forms using signed REST Webhooks.",
    icon: Sparkles,
    badge: "Universal REST Webhook",
    brandColor: "bg-muted border-border text-muted-foreground",
    buttonText: "Generate Webhook Endpoint",
    buttonBg: "bg-secondary hover:bg-accent text-foreground",
    docsUrl: "/docs/webhooks",
  },
];

// One connected-source row. Memoized so a state change to ONE source (toggle/rename/delete, or
// opening the field editor) only re-renders that row, not all N cards. The parent's setSources
// updaters preserve object identity for untouched rows, so React.memo's shallow compare skips them.
// Every handler prop must be stable (useCallback) or memoization is defeated.
type SourceCardProps = {
  s: Source;
  origin: string;
  isEditing: boolean;
  onToggle: (s: Source) => void;
  onRename: (s: Source) => void;
  onRemove: (s: Source) => void;
  onCopy: (text: string, what: string) => void;
  onToggleEdit: (id: string) => void;
  onSyncPastLeads?: (s: Source) => void;
  isSyncing?: boolean;
  onOpenFilter?: (s: Source) => void;
  leadCount?: { total: number; new: number; deleted: number };
};

const SourceCard = React.memo(function SourceCard({
  s,
  origin,
  isEditing,
  onToggle,
  onRename,
  onRemove,
  onCopy,
  onToggleEdit,
  onSyncPastLeads,
  isSyncing,
  onOpenFilter,
  leadCount,
}: SourceCardProps) {
  const webhookUrl = `${origin}/api/webhooks/${s.type}?sourceId=${s.id}`;
  const formFilter = (s.config as any)?.formFilter;
  const hasFormFilter = Array.isArray(formFilter) && formFilter.length > 0;
  const formFilterNames = ((s.config as any)?.formFilterNames ?? {}) as Record<string, string>;
  const needsReconnect = Boolean((s.config as any)?.needsReconnect);
  const lastSync = (s.config as any)?.lastSync as
    | { ok?: boolean; importedCount?: number; deduplicatedCount?: number; skippedNoContact?: number; error?: string; finishedAt?: string; message?: string }
    | undefined;
  // Only the in-flight local state disables the button — never a stale config.syncStatus, or a
  // source stuck "running" from an old queued attempt could never be re-synced.
  const syncRunning = Boolean(isSyncing);

  return (
    <div className="border rounded-2xl p-5 bg-card space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="font-bold text-foreground">{s.name}</span>
          <Badge variant="secondary" className="capitalize">
            {s.type?.replace(/_/g, " ")}
          </Badge>
          <Badge variant={s.isActive ? "default" : "secondary"}>
            {s.isActive ? "Active" : "Inactive"}
          </Badge>
          {leadCount && (
            <>
              <Badge variant="outline" className="text-xs">
                {leadCount.total.toLocaleString()} lead{leadCount.total === 1 ? "" : "s"}
              </Badge>
              {leadCount.new > 0 && (
                <Badge variant="outline" className="text-xs text-primary border-primary/30">
                  {leadCount.new.toLocaleString()} new
                </Badge>
              )}
              {leadCount.deleted > 0 && (
                <Badge variant="outline" className="text-xs text-muted-foreground">
                  {leadCount.deleted.toLocaleString()} in recycle bin
                </Badge>
              )}
            </>
          )}
          {s.type === "facebook_lead_ads" && hasFormFilter && (
            <Badge variant="outline" className="text-xs text-primary border-primary/30">
              {formFilter.length} form{formFilter.length === 1 ? "" : "s"} selected
            </Badge>
          )}
          {s.type === "facebook_lead_ads" && needsReconnect && (
            <Badge variant="destructive" className="text-xs">
              Needs reconnect
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {s.type === "facebook_lead_ads" && (
            <>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 rounded-2xl text-xs"
                onClick={() => onOpenFilter?.(s)}
                title="Choose which lead forms to capture"
              >
                <Filter className="h-3.5 w-3.5" />
                Select Forms
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 rounded-2xl text-xs text-primary font-medium"
                onClick={() => onSyncPastLeads?.(s)}
                disabled={syncRunning}
                title="Fetch past leads from Meta Graph API for this page"
              >
                {syncRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <DownloadCloud className="h-3.5 w-3.5" />}
                {syncRunning ? "Syncing..." : "Sync Past Leads"}
              </Button>
            </>
          )}
          <Button variant="outline" size="sm" onClick={() => onToggle(s)} className="rounded-2xl">
            {s.isActive ? "Deactivate" : "Activate"}
          </Button>
          <Button variant="ghost" size="icon" onClick={() => onRename(s)} title="Rename">
            <Pencil className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => onRemove(s)} title="Delete" className="text-destructive hover:text-destructive">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="space-y-2 text-sm pt-1">
        <div>
          <span className="text-xs font-semibold text-muted-foreground block mb-1">Instant Webhook Endpoint URL</span>
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate bg-muted border rounded-2xl px-3 py-2 text-xs font-mono text-foreground">
              {webhookUrl}
            </code>
            <Button variant="ghost" size="icon" aria-label="Copy webhook URL" onClick={() => onCopy(webhookUrl, "Webhook URL")}>
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        </div>
        {s.webhookSecret && (
          <div>
            <span className="text-xs font-semibold text-muted-foreground block mb-1">
              HMAC SHA-256 Signing Secret (Header <code>x-hub-signature-256</code>)
            </span>
            <div className="flex items-center gap-2">
              <code className="flex-1 truncate bg-muted border rounded-2xl px-3 py-2 text-xs font-mono text-foreground">
                {s.webhookSecret}
              </code>
              <Button variant="ghost" size="icon" aria-label="Copy secret" onClick={() => onCopy(s.webhookSecret!, "Secret")}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {(s.type === "generic_webhook" || s.type === "webform") && (
          <div>
            <span className="text-xs font-semibold text-muted-foreground block mb-1">Hosted form &amp; embed code</span>
            <div className="flex items-center gap-2">
              <code className="flex-1 truncate bg-muted border rounded-2xl px-3 py-2 text-xs font-mono text-foreground">
                {origin}/f/{s.id}
              </code>
              <Button variant="ghost" size="icon" title="Open form" onClick={() => window.open(`${origin}/f/${s.id}`, "_blank", "noopener")}>
                <ExternalLink className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Copy embed code"
                onClick={() => onCopy(`<iframe src="${origin}/f/${s.id}" style="border:0;width:100%;max-width:480px;height:520px" title="Lead form"></iframe>`, "Embed code")}
              >
                <Copy className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-1 rounded-2xl"
                onClick={() => onToggleEdit(s.id)}
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                {isEditing ? "Close" : "Customize fields"}
              </Button>
            </div>
            {isEditing && <FormFieldsEditor sourceId={s.id} initialConfig={s.config} />}
          </div>
        )}

        {s.type === "facebook_lead_ads" && needsReconnect && (
          <div className="text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-xl px-3 py-2">
            Facebook access for this Page has expired or was revoked, so leads have stopped arriving. Click <strong>Connect Facebook Lead Ads</strong> above and re-select this Page to restore it.
          </div>
        )}

        {s.type === "facebook_lead_ads" && (
          <div className="pt-1 border-t border-border/50">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-semibold text-muted-foreground">Lead forms:</span>
              {hasFormFilter ? (
                <div className="flex flex-wrap gap-1">
                  {formFilter.map((id: string) => (
                    <Badge key={id} variant="secondary" className="text-xs font-normal">
                      {formFilterNames[id] || id}
                    </Badge>
                  ))}
                </div>
              ) : (
                <span className="text-xs text-muted-foreground italic">
                  Capturing from all forms on this Page (no selection set)
                </span>
              )}
            </div>
            {syncRunning ? (
              <p className="mt-1.5 text-xs text-muted-foreground flex items-center gap-1.5">
                <Loader2 className="h-3 w-3 animate-spin" /> Syncing past leads…
              </p>
            ) : lastSync ? (
              <p className="mt-1.5 text-xs text-muted-foreground">
                {lastSync.ok === false
                  ? `Last sync failed: ${lastSync.error ?? "unknown error"}`
                  : lastSync.message
                  ? `Last sync: ${lastSync.message}`
                  : `Last sync: ${lastSync.importedCount ?? 0} imported, ${lastSync.deduplicatedCount ?? 0} updated${
                      lastSync.skippedNoContact ? `, ${lastSync.skippedNoContact} skipped` : ""
                    }.`}
              </p>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
});

export function SourcesManager({
  initialSources,
  leadCounts = {},
}: {
  initialSources: Source[];
  leadCounts?: Record<string, { total: number; new: number; deleted: number }>;
}) {
  const { toast } = useToast();
  const [sources, setSources] = React.useState<Source[]>(initialSources);
  const [connectingId, setConnectingId] = React.useState<string | null>(null);
  const [creatingForm, setCreatingForm] = React.useState(false);
  const [editingFormId, setEditingFormId] = React.useState<string | null>(null);
  const [origin, setOrigin] = React.useState("");

  // Facebook Page Selection modal state
  const [pageSelectorOpen, setPageSelectorOpen] = React.useState(false);
  const [discoveredPages, setDiscoveredPages] = React.useState<Array<{ pageId: string; name: string }>>([]);
  const [selectedPageIds, setSelectedPageIds] = React.useState<string[]>([]);
  const [isSubmittingPages, setIsSubmittingPages] = React.useState(false);

  React.useEffect(() => setOrigin(window.location.origin), []);

  // Handshake listener for OAuth popup window postMessage callbacks
  React.useEffect(() => {
    // Human-readable reasons for the error codes the OAuth callback can post back.
    const FB_ERROR: Record<string, string> = {
      oauth_denied: "You cancelled or denied the Facebook permission request.",
      missing_code: "Facebook didn't return an authorization code. Please try again.",
      facebook_not_configured: "Facebook isn't fully configured on the server (FACEBOOK_APP_ID / FACEBOOK_APP_SECRET).",
      server_error: "Something went wrong completing the connection. Please try again.",
      no_pages: "No Facebook Pages found on your account. Create or get admin access to a Page, then reconnect.",
      csrf: "This connection request couldn't be verified. Please start the connection again from this page.",
    };

    function handleOAuthMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type !== "OAUTH_RESPONSE") return;

      setConnectingId(null);

      if (event.data.status === "error") {
        toast({
          variant: "destructive",
          title: "Facebook connection failed",
          description: FB_ERROR[event.data.reason as string] ?? "The connection didn't complete. Please try again.",
        });
        return;
      }

      if (event.data.status === "pages_ready") {
        const pages: Array<{ pageId: string; name: string }> = event.data.pages || [];
        if (pages.length === 0) {
          toast({
            variant: "destructive",
            title: "No Facebook Pages found",
            description: FB_ERROR.no_pages,
          });
          return;
        }
        setDiscoveredPages(pages);
        // Default select first page
        setSelectedPageIds([pages[0].pageId]);
        setPageSelectorOpen(true);
        return;
      }

      if (event.data.status === "success") {
        const providerName = event.data.provider === "facebook" ? "Facebook Lead Ads" : event.data.provider;
        toast({
          title: `${providerName} Connected Successfully`,
          description: `Page ID: ${event.data.data?.pageId || "Connected"}. Lead pulling active.`,
        });

        // Add newly connected source to local state
        const newSource: Source = {
          id: `src_oauth_${Date.now()}`,
          name: `${providerName} Connection`,
          type: event.data.provider === "facebook" ? "facebook_lead_ads" : `${event.data.provider}_lead_gen`,
          isActive: 1,
          webhookSecret: `sec_${Date.now()}`,
        };

        setSources((prev) => [...prev, newSource]);
      }
    }

    window.addEventListener("message", handleOAuthMessage);
    return () => window.removeEventListener("message", handleOAuthMessage);
  }, [toast]);

  const handleConfirmConnectPages = async () => {
    if (selectedPageIds.length === 0) {
      toast({
        variant: "destructive",
        title: "No page selected",
        description: "Please select at least one Facebook Page to connect.",
      });
      return;
    }

    setIsSubmittingPages(true);
    try {
      const res = await connectFacebookPagesAction(selectedPageIds);
      if (!res.ok) {
        toast({
          variant: "destructive",
          title: "Connection failed",
          description: res.message,
        });
        return;
      }

      const replayed = (res.data as any)?.replayed ?? 0;
      toast({
        title: "Facebook Page Connected",
        description:
          `Successfully connected ${selectedPageIds.length} Page(s) for lead capture.` +
          (replayed ? ` Recovered ${replayed} lead(s) that arrived while disconnected.` : ""),
      });

      const newlyAdded: Source[] = (res.data?.connected || []).map((s: any) => ({
        id: s.id,
        name: s.name,
        type: s.type,
        isActive: s.isActive,
        webhookSecret: s.webhookSecret,
        config: s.config,
      }));

      setSources((prev) => {
        const existingIds = new Set(prev.map((x) => x.id));
        const filtered = newlyAdded.filter((x) => !existingIds.has(x.id));
        return [...prev, ...filtered];
      });

      setPageSelectorOpen(false);
    } catch (e: any) {
      toast({
        variant: "destructive",
        title: "Error connecting page",
        description: e.message || "Something went wrong.",
      });
    } finally {
      setIsSubmittingPages(false);
    }
  };

  // Facebook Form Selection state
  const [filterSource, setFilterSource] = React.useState<Source | null>(null);
  const [availableForms, setAvailableForms] = React.useState<Array<{ id: string; name: string; status?: string }>>([]);
  const [selectedFormIds, setSelectedFormIds] = React.useState<string[]>([]);
  const [isLoadingForms, setIsLoadingForms] = React.useState(false);
  const [formsError, setFormsError] = React.useState<string | null>(null);
  const [isSavingFilter, setIsSavingFilter] = React.useState(false);

  // Facebook Past Leads Sync state
  const [syncingSourceId, setSyncingSourceId] = React.useState<string | null>(null);
  const [syncDialogSource, setSyncDialogSource] = React.useState<Source | null>(null);
  const [syncPreset, setSyncPreset] = React.useState<string>("30"); // days, or "all" / "custom"
  const [syncFrom, setSyncFrom] = React.useState("");
  const [syncTo, setSyncTo] = React.useState("");

  const openSyncDialog = React.useCallback((s: Source) => {
    setSyncPreset("30");
    setSyncFrom("");
    setSyncTo("");
    setSyncDialogSource(s);
  }, []);

  const handleOpenFilter = React.useCallback(
    async (s: Source) => {
      setFilterSource(s);
      const existing = (s.config as any)?.formFilter;
      setSelectedFormIds(Array.isArray(existing) ? existing.map(String) : []);
      setAvailableForms([]);
      setFormsError(null);
      setIsLoadingForms(true);
      try {
        const res = await listFacebookFormsAction(s.id);
        if (!res.ok) {
          setFormsError(res.message);
          return;
        }
        setAvailableForms(res.data?.forms ?? []);
      } catch (e: any) {
        setFormsError(e.message || "Could not load lead forms from Facebook.");
      } finally {
        setIsLoadingForms(false);
      }
    },
    []
  );

  const handleSaveFormFilter = async () => {
    if (!filterSource) return;
    setIsSavingFilter(true);
    try {
      // Capture id → name for the selected forms so the card can show names without a Graph call.
      const formNames: Record<string, string> = {};
      for (const f of availableForms) {
        if (selectedFormIds.includes(f.id)) formNames[f.id] = f.name;
      }

      const res = await updateSourceFormFilterAction({
        sourceId: filterSource.id,
        formFilter: selectedFormIds,
        formNames,
      });

      if (!res.ok) {
        toast({ variant: "destructive", title: "Failed to save form selection", description: res.message });
        return;
      }

      setSources((prev) =>
        prev.map((s) =>
          s.id === filterSource.id
            ? { ...s, config: { ...((s.config as any) || {}), formFilter: selectedFormIds, formFilterNames: formNames } }
            : s
        )
      );

      toast({
        title: "Lead Forms Saved",
        description:
          selectedFormIds.length > 0
            ? `Capturing leads from ${selectedFormIds.length} selected form(s).`
            : "Selection cleared. Capturing leads from all forms on this Page.",
      });

      setFilterSource(null);
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error saving selection", description: e.message || "Failed to update form selection" });
    } finally {
      setIsSavingFilter(false);
    }
  };

  const handleSyncPastLeads = React.useCallback(
    async (s: Source, range?: { since?: number; until?: number }) => {
      setSyncingSourceId(s.id);
      try {
        const res = await syncPastFacebookLeadsAction(s.id, range);
        if (!res.ok) {
          toast({
            variant: "destructive",
            title: "Sync Failed",
            description: res.message,
          });
          return;
        }

        const data = res.data as any;
        const { totalFetched, importedCount, deduplicatedCount, skippedNoContact, formsProcessed, message, perForm } = data;

        if (message) {
          toast({ title: "Past Leads Sync", description: message });
          return;
        }

        // When Meta returned nothing, show the per-form breakdown so it's clear which form is empty.
        if (!totalFetched) {
          const breakdown = Array.isArray(perForm) && perForm.length
            ? " " + perForm.map((f: any) => `${f.name}: ${f.fetched}`).join(", ")
            : "";
          toast({
            title: "No leads returned by Meta",
            description:
              `Processed ${formsProcessed || 0} form(s), but Meta returned 0 leads.${breakdown}. ` +
              `Try "All time", select more forms, or note that test-tool leads aren't returned by the historical API.`,
          });
          return;
        }

        const skippedNote = skippedNoContact ? ` ${skippedNoContact} skipped (no email/phone).` : "";
        toast({
          title: "Past Leads Sync Complete",
          description: `Processed ${formsProcessed || 0} form(s). Found ${totalFetched || 0} lead(s): ${importedCount || 0} new imported, ${deduplicatedCount || 0} updated.${skippedNote}`,
        });
      } catch (e: any) {
        toast({
          variant: "destructive",
          title: "Sync Error",
          description: e.message || "An error occurred while syncing past leads.",
        });
      } finally {
        setSyncingSourceId(null);
      }
    },
    [toast]
  );

  const confirmSync = async () => {
    if (!syncDialogSource) return;
    let range: { since?: number; until?: number } | undefined;
    if (syncPreset === "all") {
      range = undefined;
    } else if (syncPreset === "custom") {
      const since = syncFrom ? Math.floor(new Date(syncFrom).getTime() / 1000) : undefined;
      // include the whole "to" day by adding one day (86400s)
      const until = syncTo ? Math.floor(new Date(syncTo).getTime() / 1000) + 86400 : undefined;
      range = since || until ? { since, until } : undefined;
    } else {
      const days = parseInt(syncPreset, 10);
      range = { since: Math.floor(Date.now() / 1000) - days * 86400 };
    }
    const src = syncDialogSource;
    setSyncDialogSource(null);
    await handleSyncPastLeads(src, range);
  };

  const copy = React.useCallback((text: string, what: string) => {
    navigator.clipboard.writeText(text).then(
      () => toast({ title: `${what} copied to clipboard` }),
      () => toast({ variant: "destructive", title: "Copy failed" })
    );
  }, [toast]);

  const toggleEdit = React.useCallback((id: string) => {
    setEditingFormId((cur) => (cur === id ? null : id));
  }, []);

  async function handleConnectPlatform(platform: IntegrationPlatformCard) {
    // Honest guard: these platforms have no working ingestion yet — don't attempt a create that the
    // server will reject with a cryptic validation error.
    if (platform.available === false) {
      toast({
        title: `${platform.name} — coming soon`,
        description: "This integration isn't available yet. Use Facebook Lead Ads or a Website Webhook to capture leads today.",
      });
      return;
    }
    setConnectingId(platform.id);
    try {
      if (platform.id === "facebook") {
        // Honest gate: without a real Meta app id we can't connect a Page. Don't fake a source.
        const appId = process.env.NEXT_PUBLIC_FACEBOOK_APP_ID;
        if (!appId || appId === "mock_app_id") {
          toast({
            variant: "destructive",
            title: "Facebook Lead Ads isn't set up yet",
            description: "Add your Meta app credentials (FACEBOOK_APP_ID / FACEBOOK_APP_SECRET) to enable this integration.",
          });
          return;
        }
        // Real OAuth in an embedded popup. redirect_uri stays clean (it must match the Meta app's
        // whitelist exactly under strict mode) — the popup flag rides in `state`. The callback posts
        // the result back to the message listener above, which surfaces success OR the error reason,
        // so the click never dead-ends silently.
        const redirectUri = encodeURIComponent(`${origin}/api/auth/facebook/callback`);
        const scope = encodeURIComponent("pages_show_list,leads_retrieval,pages_manage_ads");
        // CSRF double-submit: same nonce in a first-party cookie and in `state` (kept as popup_<nonce>
        // so the callback still detects popup mode). The callback rejects any mismatch.
        const nonce = (crypto.randomUUID?.() ?? String(Math.random()).slice(2)) + Date.now().toString(36);
        document.cookie = `fb_oauth_state=${nonce}; Max-Age=600; Path=/; SameSite=Lax`;
        const state = `popup_${nonce}`;
        const authUrl =
          `https://www.facebook.com/v20.0/dialog/oauth?client_id=${appId}` +
          `&redirect_uri=${redirectUri}&scope=${scope}&response_type=code&state=${encodeURIComponent(state)}`;
        const w = 600;
        const h = 720;
        const left = window.screenX + Math.max(0, (window.outerWidth - w) / 2);
        const top = window.screenY + Math.max(0, (window.outerHeight - h) / 2);
        const popup = window.open(authUrl, "fb_oauth", `width=${w},height=${h},left=${left},top=${top}`);
        if (!popup) {
          toast({
            variant: "destructive",
            title: "Popup blocked",
            description: "Allow pop-ups for this site, then click Connect Facebook Lead Ads again.",
          });
        }
        return;
      } else {
        const res = await createSourceAction({
          name: `${platform.name} Integration`,
          type: platform.typeKey as any,
        });
        if (!res.ok) {
          toast({ variant: "destructive", title: `Failed to connect ${platform.name}`, description: res.message });
          return;
        }
        setSources((prev) => [...prev, res.data as Source]);
        toast({
          title: `${platform.name} Connected`,
          description: `Integration endpoint activated. Use the webhook URL below to receive leads.`,
        });
      }
    } catch {
      toast({ variant: "destructive", title: `Failed to connect ${platform.name}`, description: "We couldn't reach the server. Please try again." });
    } finally {
      setConnectingId(null);
    }
  }

  async function createWebForm() {
    const name = window.prompt("Name your web form", "Website Enquiry Form")?.trim();
    if (!name) return;
    setCreatingForm(true);
    try {
      const res = await createSourceAction({ name, type: "webform" as any });
      if (!res.ok) {
        toast({ variant: "destructive", title: "Couldn't create form", description: res.message });
        return;
      }
      setSources((prev) => [...prev, res.data as Source]);
      toast({ title: "Web form created", description: "Copy its hosted link or embed code from the list below." });
    } catch {
      toast({ variant: "destructive", title: "Couldn't create form", description: "We couldn't reach the server. Please try again." });
    } finally {
      setCreatingForm(false);
    }
  }

  const toggle = React.useCallback(async (s: Source) => {
    const next = s.isActive ? 0 : 1;
    setSources((prev) => prev.map((x) => (x.id === s.id ? { ...x, isActive: next } : x)));
    try {
      const res = await toggleSourceAction(s.id, next === 1);
      if (!res.ok) {
        setSources((prev) => prev.map((x) => (x.id === s.id ? { ...x, isActive: s.isActive } : x)));
        toast({ variant: "destructive", title: "Could not update source status", description: res.message });
      }
    } catch {
      setSources((prev) => prev.map((x) => (x.id === s.id ? { ...x, isActive: s.isActive } : x)));
      toast({ variant: "destructive", title: "Could not update source status", description: "We couldn't reach the server. Please try again." });
    }
  }, [toast]);

  const rename = React.useCallback(async (s: Source) => {
    const name = window.prompt("Rename source", s.name)?.trim();
    if (!name || name === s.name) return;
    setSources((prev) => prev.map((x) => (x.id === s.id ? { ...x, name } : x)));
    try {
      const res = await renameSourceAction(s.id, name);
      if (!res.ok) {
        setSources((prev) => prev.map((x) => (x.id === s.id ? { ...x, name: s.name } : x)));
        toast({ variant: "destructive", title: "Could not rename source", description: res.message });
        return;
      }
      toast({ title: "Source renamed" });
    } catch {
      setSources((prev) => prev.map((x) => (x.id === s.id ? { ...x, name: s.name } : x)));
      toast({ variant: "destructive", title: "Could not rename source", description: "We couldn't reach the server. Please try again." });
    }
  }, [toast]);

  const remove = React.useCallback(async (s: Source) => {
    if (!confirm(`Delete source "${s.name}"? Existing leads are kept but un-sourced.`)) return;
    // Snapshot via the functional updater instead of closing over `sources`, so this callback
    // stays stable (empty deps) and doesn't defeat SourceCard's memoization.
    let snapshot: Source[] = [];
    setSources((p) => { snapshot = p; return p.filter((x) => x.id !== s.id); });
    try {
      const res = await deleteSourceAction(s.id);
      if (!res.ok) {
        setSources(snapshot);
        toast({ variant: "destructive", title: "Could not delete source", description: res.message });
        return;
      }
      toast({ title: "Source deleted" });
    } catch {
      setSources(snapshot);
      toast({ variant: "destructive", title: "Could not delete source", description: "We couldn't reach the server. Please try again." });
    }
  }, [toast]);

  return (
    <div className="space-y-8">
      {/* Header & Security Badge */}
      <div className="flex items-center justify-between bg-secondary text-foreground p-6 rounded-2xl">
        <div>
          <h3 className="text-xl font-bold flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-muted-foreground" /> Multi-Source Lead Integration Hub
          </h3>
          <p className="text-sm text-foreground mt-1">
            Connect ad accounts & webhooks. Leads are instantly pulled, mapped, and allocated to your tenant users.
          </p>
        </div>
        <Badge variant="outline" className="text-muted-foreground border-border/30 bg-secondary/40 py-1.5 px-3">
          10,000 req/sec Zero Breakdown Queue
        </Badge>
      </div>

      {/* Hosted Web Form — create a no-code capture form on your own /f/<id> URL */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border rounded-2xl p-5 bg-card">
        <div className="flex items-start gap-3">
          <div className="p-3 rounded-2xl border bg-muted"><FileText className="h-6 w-6 text-violet-500" /></div>
          <div>
            <h5 className="font-bold text-foreground">Hosted Web Form</h5>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed max-w-prose">
              Create a ready-to-share form that captures name, email, phone and a message straight
              into your pipeline — no code. After creating it, copy the hosted link or iframe embed
              from the list below.
            </p>
          </div>
        </div>
        <Button onClick={createWebForm} disabled={creatingForm} className="gap-2 rounded-2xl shrink-0">
          <Plus className="h-4 w-4" /> {creatingForm ? "Creating…" : "Create Web Form"}
        </Button>
      </div>

      {/* Platform Cards Section */}
      <div>
        <h4 className="text-base font-semibold text-foreground mb-4">Available Integration Platforms</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {PLATFORMS.map((platform) => {
            const IconComponent = platform.icon;
            const isConnected = sources.some((s) => s.type === platform.typeKey && s.isActive === 1);
            const unavailable = platform.available === false;

            return (
              <div
                key={platform.id}
                className="border rounded-2xl p-5 bg-card transition flex flex-col justify-between space-y-4"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className={`p-3 rounded-2xl border ${platform.brandColor}`}>
                      <IconComponent className="h-6 w-6" />
                    </div>
                    <Badge variant={unavailable ? "secondary" : "outline"} className="text-xs font-medium">
                      {unavailable ? "Coming soon" : platform.badge}
                    </Badge>
                  </div>
                  <div>
                    <h5 className="font-bold text-foreground flex items-center gap-2">
                      {platform.name}
                      {isConnected && <CheckCircle2 className="h-4 w-4 text-muted-foreground inline" />}
                    </h5>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{platform.description}</p>
                  </div>
                </div>

                <div className="pt-2 space-y-2">
                  <Button
                    onClick={() => handleConnectPlatform(platform)}
                    disabled={connectingId === platform.id || unavailable}
                    className={`w-full font-medium gap-2 rounded-2xl py-5 ${platform.buttonBg}`}
                  >
                    <IconComponent className="h-4 w-4" />
                    {unavailable ? "Coming soon" : connectingId === platform.id ? "Connecting..." : platform.buttonText}
                  </Button>
                  <a
                    href={platform.docsUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-muted-foreground hover:text-muted-foreground flex items-center justify-center gap-1 py-1"
                  >
                    Setup Guide & API Documentation <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Connected Sources & Webhook Endpoints */}
      <div className="space-y-4">
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <h4 className="text-base font-semibold text-foreground">Active Tenant Connected Endpoints ({sources.length})</h4>
          {(() => {
            const totals = Object.values(leadCounts).reduce(
              (a, c) => ({ total: a.total + c.total, new: a.new + c.new, deleted: a.deleted + c.deleted }),
              { total: 0, new: 0, deleted: 0 },
            );
            if (totals.total === 0 && totals.deleted === 0) return null;
            return (
              <p className="text-sm text-muted-foreground">
                <span className="font-semibold text-foreground">{totals.total.toLocaleString()}</span> leads
                {" · "}
                <span className="font-semibold text-primary">{totals.new.toLocaleString()}</span> new
                {" · "}
                <span className="font-semibold text-foreground">{totals.deleted.toLocaleString()}</span> in recycle bin
              </p>
            );
          })()}
        </div>
        {sources.length === 0 ? (
          <div className="text-center py-12 border rounded-2xl bg-card text-muted-foreground space-y-2">
            <Globe className="h-8 w-8 mx-auto text-foreground" />
            <p className="font-medium text-muted-foreground">No active sources connected yet.</p>
            <p className="text-xs text-muted-foreground">Click any platform button above to activate instant lead pulling.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {sources.map((s) => (
              <SourceCard
                key={s.id}
                s={s}
                origin={origin}
                isEditing={editingFormId === s.id}
                onToggle={toggle}
                onRename={rename}
                onRemove={remove}
                onCopy={copy}
                onToggleEdit={toggleEdit}
                onOpenFilter={handleOpenFilter}
                onSyncPastLeads={openSyncDialog}
                isSyncing={syncingSourceId === s.id}
                leadCount={leadCounts[s.id]}
              />
            ))}
          </div>
        )}
      </div>

      {/* Select Facebook Page Modal */}
      <Dialog open={pageSelectorOpen} onOpenChange={setPageSelectorOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Select Facebook Page to Connect</DialogTitle>
            <DialogDescription>
              Choose which Facebook Page you want to capture leads from. Only selected pages will be connected to your pipeline.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-72 overflow-y-auto space-y-2 py-2">
            {discoveredPages.map((page) => {
              const isSelected = selectedPageIds.includes(page.pageId);
              return (
                <div
                  key={page.pageId}
                  onClick={() => {
                    setSelectedPageIds((prev) =>
                      prev.includes(page.pageId) ? prev.filter((id) => id !== page.pageId) : [...prev, page.pageId]
                    );
                  }}
                  className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-colors ${
                    isSelected ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"
                  }`}
                >
                  <div className="space-y-1">
                    <p className="font-medium text-sm text-foreground">{page.name}</p>
                    <p className="text-xs text-muted-foreground font-mono">Page ID: {page.pageId}</p>
                  </div>
                  <div
                    className={`h-5 w-5 rounded-md border flex items-center justify-center transition-colors ${
                      isSelected ? "bg-primary border-primary text-primary-foreground" : "border-muted-foreground/40"
                    }`}
                  >
                    {isSelected && <CheckCircle2 className="h-4 w-4" />}
                  </div>
                </div>
              );
            })}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setPageSelectorOpen(false)} disabled={isSubmittingPages}>
              Cancel
            </Button>
            <Button
              onClick={handleConfirmConnectPages}
              disabled={isSubmittingPages || selectedPageIds.length === 0}
              className="rounded-2xl"
            >
              {isSubmittingPages
                ? "Connecting..."
                : `Connect ${selectedPageIds.length} Selected Page${selectedPageIds.length === 1 ? "" : "s"}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Sync Past Leads — pick a time window */}
      <Dialog open={Boolean(syncDialogSource)} onOpenChange={(open) => !open && setSyncDialogSource(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Sync Past Leads</DialogTitle>
            <DialogDescription>
              Choose how far back to pull historical leads from Meta for this Page. Leads are deduplicated against your existing pipeline.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 py-2">
            {[
              { v: "7", label: "Last 7 days" },
              { v: "30", label: "Last 30 days" },
              { v: "90", label: "Last 90 days" },
              { v: "all", label: "All time" },
              { v: "custom", label: "Custom range" },
            ].map((opt) => (
              <label
                key={opt.v}
                className={`flex items-center gap-3 p-2.5 rounded-xl border cursor-pointer transition-colors ${
                  syncPreset === opt.v ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"
                }`}
              >
                <input
                  type="radio"
                  name="sync-preset"
                  value={opt.v}
                  checked={syncPreset === opt.v}
                  onChange={(e) => setSyncPreset(e.target.value)}
                  className="accent-primary"
                />
                <span className="text-sm">{opt.label}</span>
              </label>
            ))}

            {syncPreset === "custom" && (
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">From</label>
                  <input
                    type="date"
                    value={syncFrom}
                    onChange={(e) => setSyncFrom(e.target.value)}
                    className="w-full bg-background border border-input rounded-xl px-3 py-2 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">To</label>
                  <input
                    type="date"
                    value={syncTo}
                    onChange={(e) => setSyncTo(e.target.value)}
                    className="w-full bg-background border border-input rounded-xl px-3 py-2 text-sm"
                  />
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setSyncDialogSource(null)}>
              Cancel
            </Button>
            <Button
              onClick={confirmSync}
              disabled={syncPreset === "custom" && !syncFrom && !syncTo}
              className="rounded-2xl gap-2"
            >
              <DownloadCloud className="h-4 w-4" /> Start sync
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Select Facebook Lead Forms Dialog */}
      <Dialog open={Boolean(filterSource)} onOpenChange={(open) => !open && setFilterSource(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Select Lead Forms</DialogTitle>
            <DialogDescription>
              Choose which lead forms on this Page should flow into your pipeline. Leads from unselected forms are ignored. Leave everything unchecked to capture all forms.
            </DialogDescription>
          </DialogHeader>

          <div className="py-2">
            {isLoadingForms ? (
              <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading forms from Facebook…
              </div>
            ) : formsError ? (
              <p className="text-sm text-destructive py-4">{formsError}</p>
            ) : availableForms.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 italic">No live lead forms found on this Page.</p>
            ) : (
              <div className="max-h-72 overflow-y-auto space-y-2">
                {availableForms.map((form) => {
                  const isSelected = selectedFormIds.includes(form.id);
                  return (
                    <div
                      key={form.id}
                      onClick={() =>
                        setSelectedFormIds((prev) =>
                          prev.includes(form.id) ? prev.filter((id) => id !== form.id) : [...prev, form.id]
                        )
                      }
                      className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-colors ${
                        isSelected ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"
                      }`}
                    >
                      <div className="space-y-1 min-w-0">
                        <p className="font-medium text-sm text-foreground truncate">{form.name}</p>
                        <p className="text-xs text-muted-foreground font-mono truncate">ID: {form.id}</p>
                      </div>
                      <div
                        className={`h-5 w-5 rounded-md border flex items-center justify-center shrink-0 transition-colors ${
                          isSelected ? "bg-primary border-primary text-primary-foreground" : "border-muted-foreground/40"
                        }`}
                      >
                        {isSelected && <CheckCircle2 className="h-4 w-4" />}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setFilterSource(null)} disabled={isSavingFilter}>
              Cancel
            </Button>
            <Button onClick={handleSaveFormFilter} disabled={isSavingFilter || isLoadingForms} className="rounded-2xl">
              {isSavingFilter
                ? "Saving..."
                : selectedFormIds.length > 0
                ? `Save ${selectedFormIds.length} form${selectedFormIds.length === 1 ? "" : "s"}`
                : "Save (all forms)"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
