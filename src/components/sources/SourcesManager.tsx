"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { usePlan } from "@/components/billing/PlanGate";
import {
  createSourceAction,
  toggleSourceAction,
  renameSourceAction,
  deleteSourceAction,
  connectFacebookPagesAction,
  updateSourceFormFilterAction,
  listFacebookFormsAction,
  syncPastFacebookLeadsAction,
  subscribeFacebookWebhooksAction,
  setSourceAssignmentAction,
  regenerateSourceSecretAction,
} from "@/lib/actions/sources";
import { Input } from "@/components/ui/input";
import { SourceCard, type Source, type LeadCount, type Assignment, type Ask } from "./SourceCard";
import { Globe, ExternalLink, CheckCircle2, Sparkles, FileText, Plus, Loader2, DownloadCloud } from "lucide-react";
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
  docsUrl?: string; // external setup guide, when one exists
}

const PLATFORMS: IntegrationPlatformCard[] = [
  {
    id: "facebook",
    name: "Facebook & Instagram Lead Ads",
    typeKey: "facebook_lead_ads",
    description: "Connect your Facebook Page once; leads from your Facebook and Instagram lead forms arrive instantly.",
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
    description: "Get Google Ads lead form submissions the moment they're sent. You paste a URL and a key into Google Ads.",
    icon: Globe,
    badge: "Google Ads Webhook",
    brandColor: "bg-muted border-border text-foreground",
    buttonText: "Connect Google Lead Ads",
    buttonBg: "bg-destructive hover:bg-accent text-foreground",
    docsUrl: "https://support.google.com/google-ads/answer/9360341",
  },
  {
    id: "webhook",
    name: "Website Custom Webhook",
    typeKey: "generic_webhook",
    description: "Send leads from WordPress, Elementor, Webflow, Zapier or your own code. Paste one URL into your form tool's webhook action.",
    icon: Sparkles,
    badge: "Any form tool",
    brandColor: "bg-muted border-border text-muted-foreground",
    buttonText: "Create webhook",
    buttonBg: "bg-secondary hover:bg-accent text-foreground",
  },
];

export function SourcesManager({
  initialSources,
  leadCounts = {},
  failures = {},
  initialAssignments = {},
  users = [],
  teams = [],
}: {
  initialSources: Source[];
  leadCounts?: Record<string, LeadCount>;
  failures?: Record<string, number>;
  initialAssignments?: Record<string, Assignment>;
  users?: { id: string; name: string }[];
  teams?: { id: string; name: string }[];
}) {
  const { toast } = useToast();
  const { openUpgrade } = usePlan();
  const [sources, setSources] = React.useState<Source[]>(initialSources);
  React.useEffect(() => setSources(initialSources), [initialSources]);
  const [assignments, setAssignments] = React.useState(initialAssignments);
  React.useEffect(() => setAssignments(initialAssignments), [initialAssignments]);
  // The one open confirm/rename dialog (replaces window.prompt / confirm).
  const [ask, setAsk] = React.useState<{ kind: Ask | "create-form"; s?: Source; name: string } | null>(null);
  const [askBusy, setAskBusy] = React.useState(false);
  const [connectingId, setConnectingId] = React.useState<string | null>(null);
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
          description: (event.data.details as string) || FB_ERROR[event.data.reason as string] || "The connection didn't complete. Please try again.",
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
        if (res.code === "LIMIT") return openUpgrade(res.message);
        toast({
          variant: "destructive",
          title: "Connection failed",
          description: res.message,
        });
        return;
      }

      const replayed = (res.data as any)?.replayed ?? 0;
      const subscribeErrors: string[] = (res.data as any)?.subscribeErrors ?? [];
      if (subscribeErrors.length > 0) {
        toast({
          variant: "destructive",
          title: "Connected, but live leads couldn't be enabled",
          description: `${subscribeErrors.join("; ")}. Use "Enable Live Leads" on the source to retry.`,
        });
      } else {
        toast({
          title: "Facebook Page Connected",
          description:
            `Connected ${selectedPageIds.length} Page(s) and enabled live lead delivery.` +
            (replayed ? ` Recovered ${replayed} lead(s) that arrived while disconnected.` : ""),
        });
      }

      // Reflect the subscription outcome immediately so the card shows Live/Active without a refresh.
      const subscribedOk = subscribeErrors.length === 0;
      const withState = (cfg: any) => ({ ...(cfg || {}), webhookSubscribed: subscribedOk, needsReconnect: false });
      const connectedById = new Map<string, any>(
        (res.data?.connected || []).map((s: any) => [
          s.id,
          { id: s.id, name: s.name, type: s.type, isActive: s.isActive, webhookSecret: s.webhookSecret, config: withState(s.config) },
        ]),
      );

      setSources((prev) => {
        // Update existing rows (reconnect returns the same id) and append any genuinely new ones.
        const updated = prev.map((x) => (connectedById.has(x.id) ? { ...x, ...connectedById.get(x.id) } : x));
        const existingIds = new Set(prev.map((x) => x.id));
        const added = [...connectedById.values()].filter((x) => !existingIds.has(x.id));
        return [...updated, ...added];
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

  const [subscribingSourceId, setSubscribingSourceId] = React.useState<string | null>(null);
  const handleSubscribe = React.useCallback(
    async (s: Source) => {
      setSubscribingSourceId(s.id);
      try {
        const res = await subscribeFacebookWebhooksAction(s.id);
        if (!res.ok) {
          toast({ variant: "destructive", title: "Couldn't enable live leads", description: res.message });
          return;
        }
        // Flip the card to "Live" immediately, no refresh needed.
        setSources((prev) =>
          prev.map((x) => (x.id === s.id ? { ...x, config: { ...((x.config as any) || {}), webhookSubscribed: true } } : x)),
        );
        toast({
          title: "Live leads enabled",
          description: "This Page is now subscribed to Meta webhooks — new leads will arrive instantly.",
        });
      } catch (e: any) {
        toast({ variant: "destructive", title: "Couldn't enable live leads", description: e?.message || "Please try again." });
      } finally {
        setSubscribingSourceId(null);
      }
    },
    [toast],
  );

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
      if (since && until && since >= until) {
        toast({ variant: "destructive", title: "Invalid date range", description: "The From date must be before the To date." });
        return;
      }
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
        // pages_manage_metadata is required to subscribe the Page to leadgen webhooks (subscribed_apps).
        const scope = encodeURIComponent("pages_show_list,leads_retrieval,pages_manage_ads,pages_manage_metadata");
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
          if (res.code === "LIMIT") return openUpgrade(res.message);
          toast({ variant: "destructive", title: `Failed to connect ${platform.name}`, description: res.message });
          return;
        }
        setSources((prev) => [...prev, res.data as Source]);
        toast({
          title: `${platform.name} added`,
          description: "Follow the setup steps on its card below to start receiving leads.",
        });
      }
    } catch {
      toast({ variant: "destructive", title: `Failed to connect ${platform.name}`, description: "We couldn't reach the server. Please try again." });
    } finally {
      setConnectingId(null);
    }
  }

  const createWebForm = () => setAsk({ kind: "create-form", name: "Website enquiry form" });

  const setActive = React.useCallback(async (s: Source, on: boolean) => {
    const next = on ? 1 : 0;
    setSources((prev) => prev.map((x) => (x.id === s.id ? { ...x, isActive: next } : x)));
    try {
      const res = await toggleSourceAction(s.id, on);
      if (!res.ok) {
        setSources((prev) => prev.map((x) => (x.id === s.id ? { ...x, isActive: s.isActive } : x)));
        toast({ variant: "destructive", title: on ? "Could not resume source" : "Could not pause source", description: res.message });
      }
    } catch {
      setSources((prev) => prev.map((x) => (x.id === s.id ? { ...x, isActive: s.isActive } : x)));
      toast({ variant: "destructive", title: "Could not update source", description: "We couldn't reach the server. Please try again." });
    }
  }, [toast]);
  const resume = React.useCallback((s: Source) => setActive(s, true), [setActive]);
  const openAsk = React.useCallback((kind: Ask, s: Source) => setAsk({ kind, s, name: s.name }), []);

  const assign = React.useCallback(async (s: Source, a: Assignment) => {
    let prev: Record<string, Assignment> = {};
    setAssignments((cur) => { prev = cur; return { ...cur, [s.id]: a }; });
    try {
      const res = await setSourceAssignmentAction(s.id, a);
      if (!res.ok) {
        setAssignments(prev);
        toast({ variant: "destructive", title: "Could not save assignment", description: res.message });
        return;
      }
      toast({ title: a.mode === "none" ? "New leads will stay unassigned" : "Assignment saved", description: a.mode === "none" ? undefined : "Applies to leads that arrive from now on." });
    } catch {
      setAssignments(prev);
      toast({ variant: "destructive", title: "Could not save assignment", description: "We couldn't reach the server. Please try again." });
    }
  }, [toast]);

  // Stable for the memoized cards; always calls the latest connect handler.
  const connectRef = React.useRef<(p: IntegrationPlatformCard) => void>(() => {});
  const reconnectFacebook = React.useCallback(() => {
    const fb = PLATFORMS.find((p) => p.id === "facebook");
    if (fb) connectRef.current(fb);
  }, []);

  // Runs the confirmed dialog action.
  async function confirmAsk() {
    if (!ask) return;
    const { kind, s, name } = ask;
    setAskBusy(true);
    try {
      if (kind === "create-form") {
        if (!name.trim()) return;
        const res = await createSourceAction({ name: name.trim(), type: "webform" });
        if (!res.ok) {
          if (res.code === "LIMIT") { setAsk(null); return openUpgrade(res.message); }
          toast({ variant: "destructive", title: "Couldn't create form", description: res.message });
          return;
        }
        setSources((prev) => [...prev, res.data as Source]);
        toast({ title: "Web form created", description: "Share its link or embed code from its card below." });
      } else if (kind === "rename" && s) {
        if (!name.trim() || name.trim() === s.name) { setAsk(null); return; }
        const res = await renameSourceAction(s.id, name.trim());
        if (!res.ok) { toast({ variant: "destructive", title: "Could not rename source", description: res.message }); return; }
        setSources((prev) => prev.map((x) => (x.id === s.id ? { ...x, name: name.trim() } : x)));
      } else if (kind === "pause" && s) {
        await setActive(s, false);
      } else if (kind === "regenerate" && s) {
        const res = await regenerateSourceSecretAction(s.id);
        if (!res.ok) { toast({ variant: "destructive", title: "Could not create a new key", description: res.message }); return; }
        setSources((prev) => prev.map((x) => (x.id === s.id ? { ...x, webhookSecret: res.data.webhookSecret } : x)));
        toast({ title: "New key created", description: "Update it wherever you pasted the old one — the old key no longer works." });
      } else if (kind === "delete" && s) {
        const res = await deleteSourceAction(s.id);
        if (!res.ok) { toast({ variant: "destructive", title: "Could not delete source", description: res.message }); return; }
        setSources((prev) => prev.filter((x) => x.id !== s.id));
        toast({ title: "Source deleted" });
      }
      setAsk(null);
    } catch {
      toast({ variant: "destructive", title: "Something went wrong", description: "We couldn't reach the server. Please try again." });
    } finally {
      setAskBusy(false);
    }
  }

  const askCopy: Record<Ask | "create-form", { title: string; body?: string; cta: string; destructive?: boolean; input?: boolean }> = {
    "create-form": { title: "Create a web form", body: "Give it a name you'll recognise in your leads list.", cta: "Create form", input: true },
    rename: { title: "Rename source", cta: "Save", input: true },
    pause: {
      title: `Pause "${ask?.s?.name ?? ""}"?`,
      body: ask?.s?.type === "facebook_lead_ads"
        ? "Leads that arrive while it's paused are not captured. After resuming, use “Sync past leads” to bring them in."
        : "Leads sent while it's paused are rejected, and the sending tool will show an error. Resume any time.",
      cta: "Pause",
    },
    regenerate: {
      title: "Create a new key?",
      body: "The current key stops working immediately. You'll need to paste the new URL/key wherever you set it up.",
      cta: "Create new key",
      destructive: true,
    },
    delete: {
      title: `Delete "${ask?.s?.name ?? ""}"?`,
      body: "It stops receiving leads. Its existing leads are kept (just without a source), and any alert or assignment rules for it are removed." +
        (ask?.s?.type === "facebook_lead_ads" ? " The Facebook Page is also disconnected from Ridhzo." : ""),
      cta: "Delete source",
      destructive: true,
    },
  };

  connectRef.current = handleConnectPlatform;

  return (
    <div className="space-y-8">
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
        <Button onClick={createWebForm} className="gap-2 rounded-2xl shrink-0">
          <Plus className="h-4 w-4" /> Create web form
        </Button>
      </div>

      {/* Platform Cards Section */}
      <div>
        <h4 className="text-base font-semibold text-foreground mb-4">Connect a lead source</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {PLATFORMS.map((platform) => {
            const IconComponent = platform.icon;
            const isConnected = sources.some((s) => s.type === platform.typeKey && s.isActive === 1);

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
                    {isConnected ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-green-500/30 bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-700 dark:text-green-300">
                        <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                        Connected
                      </span>
                    ) : (
                      <Badge variant="outline" className="text-xs font-medium">{platform.badge}</Badge>
                    )}
                  </div>
                  <div>
                    <h5 className="font-bold text-foreground flex items-center gap-2">
                      {platform.name}
                      {isConnected && <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400 inline" />}
                    </h5>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{platform.description}</p>
                  </div>
                </div>

                <div className="pt-2 space-y-2">
                  <Button
                    onClick={() => handleConnectPlatform(platform)}
                    disabled={connectingId === platform.id}
                    variant={isConnected ? "outline" : "default"}
                    className={`w-full font-medium gap-2 rounded-2xl py-5 ${isConnected ? "" : platform.buttonBg}`}
                  >
                    {isConnected ? (
                      <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                    ) : (
                      <IconComponent className="h-4 w-4" />
                    )}
                    {connectingId === platform.id
                      ? "Connecting..."
                      : isConnected
                      ? "Connected · Add another"
                      : platform.buttonText}
                  </Button>
                  {platform.docsUrl && (
                    <a
                      href={platform.docsUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-muted-foreground hover:text-muted-foreground flex items-center justify-center gap-1 py-1"
                    >
                      Setup guide <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Connected Sources & Webhook Endpoints */}
      <div className="space-y-4">
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <h4 className="text-base font-semibold text-foreground">Your sources ({sources.length})</h4>
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
            <p className="font-medium text-muted-foreground">No lead sources yet.</p>
            <p className="text-xs text-muted-foreground">Create a web form or connect Facebook, Google or your website above.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {sources.map((s) => (
              <SourceCard
                key={s.id}
                s={s}
                origin={origin}
                isEditing={editingFormId === s.id}
                leadCount={leadCounts[s.id]}
                failures={failures[s.id]}
                assignment={assignments[s.id]}
                users={users}
                teams={teams}
                isSyncing={syncingSourceId === s.id}
                isSubscribing={subscribingSourceId === s.id}
                onCopy={copy}
                onToggleEdit={toggleEdit}
                onAsk={openAsk}
                onResume={resume}
                onAssign={assign}
                onReconnect={reconnectFacebook}
                onSubscribe={handleSubscribe}
                onOpenFilter={handleOpenFilter}
                onSyncPastLeads={openSyncDialog}
              />
            ))}
          </div>
        )}
      </div>

      {/* Rename / create form / pause / new key / delete */}
      <Dialog open={!!ask} onOpenChange={(o) => !o && !askBusy && setAsk(null)}>
        <DialogContent className="max-w-md">
          {ask && (
            <>
              <DialogHeader>
                <DialogTitle>{askCopy[ask.kind].title}</DialogTitle>
                {askCopy[ask.kind].body && <DialogDescription>{askCopy[ask.kind].body}</DialogDescription>}
              </DialogHeader>
              {askCopy[ask.kind].input && (
                <Input autoFocus aria-label="Name" value={ask.name} maxLength={255}
                  onChange={(e) => setAsk({ ...ask, name: e.target.value })}
                  onKeyDown={(e) => { if (e.key === "Enter") confirmAsk(); }} />
              )}
              <DialogFooter className="gap-2 sm:gap-0">
                <Button variant="outline" onClick={() => setAsk(null)} disabled={askBusy}>Cancel</Button>
                <Button variant={askCopy[ask.kind].destructive ? "destructive" : "default"} onClick={confirmAsk}
                  disabled={askBusy || (!!askCopy[ask.kind].input && !ask.name.trim())}>
                  {askBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : askCopy[ask.kind].cta}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

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
                <label
                  key={page.pageId}
                  className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary ${
                    isSelected ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"
                  }`}
                >
                  <div className="space-y-1">
                    <p className="font-medium text-sm text-foreground">{page.name}</p>
                    <p className="text-xs text-muted-foreground font-mono">Page ID: {page.pageId}</p>
                  </div>
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={isSelected}
                    onChange={() =>
                      setSelectedPageIds((prev) =>
                        prev.includes(page.pageId) ? prev.filter((id) => id !== page.pageId) : [...prev, page.pageId]
                      )
                    }
                  />
                  <div
                    aria-hidden="true"
                    className={`h-5 w-5 rounded-md border flex items-center justify-center transition-colors ${
                      isSelected ? "bg-primary border-primary text-primary-foreground" : "border-muted-foreground/40"
                    }`}
                  >
                    {isSelected && <CheckCircle2 className="h-4 w-4" />}
                  </div>
                </label>
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
                    <label
                      key={form.id}
                      className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary ${
                        isSelected ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"
                      }`}
                    >
                      <div className="space-y-1 min-w-0">
                        <p className="font-medium text-sm text-foreground truncate">{form.name}</p>
                        <p className="text-xs text-muted-foreground font-mono truncate">ID: {form.id}</p>
                      </div>
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={isSelected}
                        onChange={() =>
                          setSelectedFormIds((prev) =>
                            prev.includes(form.id) ? prev.filter((id) => id !== form.id) : [...prev, form.id]
                          )
                        }
                      />
                      <div
                        aria-hidden="true"
                        className={`h-5 w-5 rounded-md border flex items-center justify-center shrink-0 transition-colors ${
                          isSelected ? "bg-primary border-primary text-primary-foreground" : "border-muted-foreground/40"
                        }`}
                      >
                        {isSelected && <CheckCircle2 className="h-4 w-4" />}
                      </div>
                    </label>
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
