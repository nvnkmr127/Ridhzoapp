"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Copy, Code, ExternalLink, ShieldCheck, SlidersHorizontal, Loader2, MoreHorizontal, RefreshCw, AlertTriangle } from "lucide-react";
import { FormFieldsEditor } from "./FormFieldsEditor";
import { SourceFieldMappingEditor } from "./SourceFieldMappingEditor";

export type Source = {
  id: string;
  name: string;
  type: string | null;
  isActive: number;
  webhookSecret: string | null; // only sent for sources whose setup uses it (webhook, Google)
  config?: unknown;
};
export type LeadCount = { total: number; new: number; deleted: number; lastAt: string | null };
export type Assignment = { mode: "none" } | { mode: "user"; userId: string } | { mode: "team"; teamId: string };
export type Ask = "rename" | "pause" | "delete" | "regenerate";

const TYPE_LABEL: Record<string, string> = {
  facebook_lead_ads: "Facebook Lead Ads",
  google_lead_ads: "Google Lead Form",
  generic_webhook: "Website webhook",
  webform: "Hosted web form",
};

// "3 hours ago" style, coarse on purpose.
function ago(iso: string) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  const [n, u] = s < 3600 ? [Math.round(s / 60), "minute"] : s < 86400 ? [Math.round(s / 3600), "hour"] : [Math.round(s / 86400), "day"];
  return n <= 0 ? "just now" : `${n} ${u}${n === 1 ? "" : "s"} ago`;
}

const encodeAssignment = (a: Assignment | undefined) => (!a || a.mode === "none" ? "none" : a.mode === "user" ? `user:${a.userId}` : `team:${a.teamId}`);
const decodeAssignment = (v: string): Assignment => {
  const [mode, id] = v.split(":");
  return mode === "user" ? { mode: "user", userId: id } : mode === "team" ? { mode: "team", teamId: id } : { mode: "none" };
};

function CopyRow({ label, value, onCopy, hint, children }: { label: string; value: string; onCopy: (v: string, what: string) => void; hint?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div>
      <span className="text-xs font-semibold text-muted-foreground block mb-1">{label}</span>
      <div className="flex items-center gap-2">
        <code className="flex-1 truncate bg-muted border rounded-2xl px-3 py-2 text-xs font-mono text-foreground">{value}</code>
        <Button variant="ghost" size="icon" aria-label={`Copy ${label}`} onClick={() => onCopy(value, label)}><Copy className="h-4 w-4" /></Button>
        {children}
      </div>
      {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
    </div>
  );
}

type Props = {
  s: Source;
  origin: string;
  isEditing: boolean;
  leadCount?: LeadCount;
  failures?: number;
  assignment?: Assignment;
  users: { id: string; name: string }[];
  teams: { id: string; name: string }[];
  isSyncing?: boolean;
  isSubscribing?: boolean;
  onCopy: (text: string, what: string) => void;
  onToggleEdit: (id: string) => void;
  onAsk: (kind: Ask, s: Source) => void;
  onResume: (s: Source) => void;
  onAssign: (s: Source, a: Assignment) => void;
  onReconnect: () => void;
  onSubscribe: (s: Source) => void;
  onOpenFilter: (s: Source) => void;
  onSyncPastLeads: (s: Source) => void;
};

// One connected source. Memoized: the parent keeps untouched rows' object identity and passes stable
// callbacks, so a change to one source re-renders only its card.
export const SourceCard = React.memo(function SourceCard({
  s, origin, isEditing, leadCount, failures, assignment, users, teams, isSyncing, isSubscribing,
  onCopy, onToggleEdit, onAsk, onResume, onAssign, onReconnect, onSubscribe, onOpenFilter, onSyncPastLeads,
}: Props) {
  const [showFieldMapping, setShowFieldMapping] = React.useState(false);
  const cfg = (s.config ?? {}) as Record<string, any>;
  const isFacebook = s.type === "facebook_lead_ads";
  const formFilter: string[] = Array.isArray(cfg.formFilter) ? cfg.formFilter : [];
  const formFilterNames = (cfg.formFilterNames ?? {}) as Record<string, string>;
  const needsReconnect = isFacebook && Boolean(cfg.needsReconnect);
  const webhookSubscribed = Boolean(cfg.webhookSubscribed);
  const lastSync = cfg.lastSync as
    | { ok?: boolean; importedCount?: number; deduplicatedCount?: number; skippedNoContact?: number; error?: string; message?: string }
    | undefined;
  const hookUrl = `${origin}/api/webhooks/${s.type}?sourceId=${s.id}`;
  // A deleted/deactivated person or deleted team leaves a rule nobody can see — show it as a problem.
  const assignValue = encodeAssignment(assignment);
  const staleAssignment =
    (assignment?.mode === "user" && !users.some((u) => u.id === assignment.userId)) ||
    (assignment?.mode === "team" && !teams.some((t) => t.id === assignment.teamId));

  // One status, in priority order, with the single action that fixes it.
  const status = needsReconnect
    ? { tone: "bad", text: "Facebook access expired — leads stopped", action: <Button size="sm" className="gap-1.5 rounded-2xl" onClick={onReconnect}><RefreshCw className="h-3.5 w-3.5" /> Reconnect</Button> }
    : !s.isActive
    ? { tone: "muted", text: "Paused — not capturing leads", action: <Button size="sm" variant="outline" className="rounded-2xl" onClick={() => onResume(s)}>Resume</Button> }
    : isFacebook && !webhookSubscribed
    ? { tone: "warn", text: "Live leads are off", action: (
        <Button size="sm" className="gap-1.5 rounded-2xl" onClick={() => onSubscribe(s)} disabled={isSubscribing}>
          {isSubscribing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />} {isSubscribing ? "Enabling…" : "Enable live leads"}
        </Button>
      ) }
    : { tone: "good", text: isFacebook ? "Live — leads arrive instantly" : "Active", action: null };
  const toneClass = {
    good: "border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-300",
    warn: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
    bad: "border-destructive/30 bg-destructive/10 text-destructive",
    muted: "border-border bg-muted text-muted-foreground",
  }[status.tone as "good" | "warn" | "bad" | "muted"];

  return (
    <div className="border rounded-2xl p-5 bg-card space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-foreground">{s.name}</span>
            <Badge variant="secondary">{TYPE_LABEL[s.type ?? ""] ?? s.type}</Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            {leadCount?.total ? `${leadCount.total.toLocaleString()} lead${leadCount.total === 1 ? "" : "s"}` : "No leads yet"}
            {leadCount?.new ? ` · ${leadCount.new.toLocaleString()} new` : ""}
            {leadCount?.deleted ? ` · ${leadCount.deleted.toLocaleString()} in recycle bin` : ""}
            {leadCount?.lastAt ? ` · last lead ${ago(leadCount.lastAt)}` : ""}
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label={`More actions for ${s.name}`}><MoreHorizontal className="h-4 w-4" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {isFacebook && (
              <>
                <DropdownMenuItem disabled={needsReconnect} onSelect={() => onOpenFilter(s)}>Choose lead forms…</DropdownMenuItem>
                <DropdownMenuItem disabled={needsReconnect || isSyncing} onSelect={() => onSyncPastLeads(s)}>Sync past leads…</DropdownMenuItem>
                {webhookSubscribed && !needsReconnect && <DropdownMenuItem onSelect={() => onSubscribe(s)}>Re-enable live leads</DropdownMenuItem>}
                <DropdownMenuSeparator />
              </>
            )}
            <DropdownMenuItem onSelect={() => onAsk("rename", s)}>Rename…</DropdownMenuItem>
            {s.isActive ? <DropdownMenuItem onSelect={() => onAsk("pause", s)}>Pause…</DropdownMenuItem> : <DropdownMenuItem onSelect={() => onResume(s)}>Resume</DropdownMenuItem>}
            {s.webhookSecret && <DropdownMenuItem onSelect={() => onAsk("regenerate", s)}>{s.type === "google_lead_ads" ? "New key…" : "New secret key…"}</DropdownMenuItem>}
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive" onSelect={() => onAsk("delete", s)}>Delete…</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2 text-sm ${toneClass}`}>
        <span className="font-medium">{status.text}</span>
        {status.action}
      </div>
      {!!failures && (
        <p className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-300">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          {failures} lead{failures === 1 ? "" : "s"} from this source failed to import in the last 7 days.
        </p>
      )}

      {/* Who gets the new leads */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
        <span className="text-xs font-semibold text-muted-foreground sm:w-40 shrink-0">New leads are assigned to</span>
        <Select value={staleAssignment ? "none" : assignValue} onValueChange={(v) => onAssign(s, decodeAssignment(v))}>
          <SelectTrigger className="sm:w-72" aria-label="New leads are assigned to"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Nobody — leave unassigned</SelectItem>
            {users.map((u) => <SelectItem key={u.id} value={`user:${u.id}`}>{u.name}</SelectItem>)}
            {teams.map((t) => <SelectItem key={t.id} value={`team:${t.id}`}>Take turns across {t.name}</SelectItem>)}
          </SelectContent>
        </Select>
        {staleAssignment && <span className="text-xs text-amber-700 dark:text-amber-300">The person or team it used is gone — pick again.</span>}
      </div>

      {/* Setup: only what this source type actually uses */}
      <div className="space-y-3 text-sm">
        {s.type === "generic_webhook" && s.webhookSecret && (
          <>
            <CopyRow
              label="Webhook URL"
              value={`${hookUrl}&key=${s.webhookSecret}`}
              onCopy={onCopy}
              hint="Paste this into your form tool's webhook action (WordPress, Elementor, Webflow, Zapier…). It includes your secret key, so keep it private. JSON and regular form posts both work."
            />
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer">Sending from your own code? Sign instead of putting the key in the URL</summary>
              <div className="pt-2 space-y-2">
                <CopyRow label="Secret key" value={s.webhookSecret} onCopy={onCopy} hint={<>POST to <code>{hookUrl}</code> with header <code>x-hub-signature-256: sha256=&lt;HMAC-SHA256 of the body&gt;</code>.</>} />
              </div>
            </details>
          </>
        )}

        {s.type === "google_lead_ads" && s.webhookSecret && (
          <>
            <p className="text-xs text-muted-foreground">In Google Ads, open your lead form → <strong>Lead delivery</strong> → <strong>Webhook integration</strong>, paste these two values, then click <strong>Send test data</strong>.</p>
            <CopyRow label="Webhook URL" value={hookUrl} onCopy={onCopy} />
            <CopyRow label="Key" value={s.webhookSecret} onCopy={onCopy} />
          </>
        )}

        {(s.type === "webform" || s.type === "generic_webhook") && (
          <CopyRow label="Hosted form link" value={`${origin}/f/${s.id}`} onCopy={onCopy}>
            <Button variant="ghost" size="icon" aria-label="Open form" onClick={() => window.open(`${origin}/f/${s.id}`, "_blank", "noopener")}><ExternalLink className="h-4 w-4" /></Button>
            <Button variant="ghost" size="icon" aria-label="Copy embed code"
              onClick={() => onCopy(`<iframe src="${origin}/f/${s.id}" style="border:0;width:100%;max-width:480px;height:520px" title="Lead form"></iframe>`, "Embed code")}>
              <Code className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" className="gap-1 rounded-2xl" onClick={() => onToggleEdit(s.id)}>
              {isEditing ? "Close" : "Customize fields"}
            </Button>
          </CopyRow>
        )}
        {isEditing && <FormFieldsEditor sourceId={s.id} initialConfig={s.config} />}

        {isFacebook && (
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap text-xs">
              <span className="font-semibold text-muted-foreground">Lead forms:</span>
              {formFilter.length ? (
                formFilter.map((id) => <Badge key={id} variant="secondary" className="text-xs font-normal">{formFilterNames[id] || id}</Badge>)
              ) : (
                <span className="text-muted-foreground">all forms on this Page</span>
              )}
            </div>
            {isSyncing ? (
              <p className="text-xs text-muted-foreground flex items-center gap-1.5"><Loader2 className="h-3 w-3 animate-spin" /> Syncing past leads…</p>
            ) : lastSync ? (
              <p className="text-xs text-muted-foreground">
                {lastSync.ok === false
                  ? `Last sync failed: ${lastSync.error ?? "unknown error"}`
                  : lastSync.message
                  ? `Last sync: ${lastSync.message}`
                  : `Last sync: ${lastSync.importedCount ?? 0} imported, ${lastSync.deduplicatedCount ?? 0} updated${lastSync.skippedNoContact ? `, ${lastSync.skippedNoContact} skipped` : ""}.`}
              </p>
            ) : null}
          </div>
        )}

        {(isFacebook || s.type === "google_lead_ads") && (
          <div>
            <Button variant="outline" size="sm" className="h-8 gap-1 text-xs" disabled={needsReconnect} onClick={() => setShowFieldMapping((v) => !v)}>
              <SlidersHorizontal className="h-3.5 w-3.5" />
              {showFieldMapping ? "Close field mapping" : "Map form questions to fields"}
            </Button>
            {s.type === "google_lead_ads" && !leadCount?.total && (
              <p className="text-xs text-muted-foreground mt-1">Google doesn&apos;t list a form&apos;s questions, so they show up here after the first leads arrive (you can also type a question key).</p>
            )}
            {showFieldMapping && (
              <SourceFieldMappingEditor sourceId={s.id} initialConfig={s.config} provider={isFacebook ? "facebook" : "google"} />
            )}
          </div>
        )}
      </div>
    </div>
  );
});
